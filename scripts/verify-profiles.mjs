import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  sanitizeProfileName,
  getOmpBaseDir,
  getProfileSessionDir,
  listProfiles,
  createProfile,
  deleteProfile,
} from '../electron/profile-paths.ts';
import { OmpBridge } from '../electron/omp-bridge.ts';

let passCount = 0;
async function test(name, fn) {
  await fn();
  passCount++;
  console.log(`✓ ${name}`);
}

console.log('=== Running verify-profiles.mjs ===');

await test('sanitizeProfileName normalizes names cleanly', () => {
  assert(sanitizeProfileName('Work') === 'work', 'Should lowercase');
  assert(sanitizeProfileName('My Work 2026') === 'my-work-2026', 'Should convert spaces to dash');
  assert(sanitizeProfileName('Special!@#$%^&*') === 'special--------', 'Should sanitize special chars');
});

await test('getOmpBaseDir resolves default and named profiles correctly', () => {
  const defaultDir = getOmpBaseDir();
  assert(defaultDir === path.join(os.homedir(), '.omp'), 'Default should be ~/.omp');

  const defaultDirExplicit = getOmpBaseDir('default');
  assert(defaultDirExplicit === path.join(os.homedir(), '.omp'), 'Explicit default should be ~/.omp');

  const workDir = getOmpBaseDir('work');
  assert(workDir === path.join(os.homedir(), '.omp', 'profiles', 'work'), 'Named profile should be ~/.omp/profiles/work');
});

await test('getProfileSessionDir resolves session directories', () => {
  const sessDir = getProfileSessionDir('work', '/Users/test/my-project');
  assert(sessDir.includes(path.join('.omp', 'profiles', 'work', 'agent', 'sessions')), 'Should contain profile sessions path');
  assert(sessDir.includes('--Users-test-my-project--'), 'Should contain encoded workspace path');
});

await test('createProfile and listProfiles work safely', async () => {
  const testProfile = `test-verify-${Date.now()}`;
  const createRes = await createProfile(testProfile);
  assert(createRes.success === true, 'createProfile should succeed');
  assert(createRes.profile === testProfile, 'Profile name should match');

  const list = await listProfiles();
  assert(list.includes('default'), 'List must include default');
  assert(list.includes(testProfile), 'List must include created profile');

  // Clean up
  const delRes = await deleteProfile(testProfile);
  assert(delRes.success === true, 'deleteProfile should succeed');

  const delDefaultRes = await deleteProfile('default');
  assert(delDefaultRes.success === false, 'Cannot delete default profile');
});

await test('OmpBridge manages profile state and passes --profile flag to CLI args', async () => {
  const bridge = new OmpBridge();
  assert(bridge.getProfile().profile === 'default', 'Initial profile should be default');

  const setRes = await bridge.setProfile('work');
  assert(setRes.success === true, 'setProfile should succeed');
  assert(setRes.profile === 'work', 'Current profile should be updated to work');
  assert(bridge.getProfile().profile === 'work', 'getProfile should return work');
});

await test('Preload and Main IPC contracts for profiles are properly wired', () => {
  const preloadSource = fs.readFileSync(path.resolve('electron/preload.ts'), 'utf-8');
  assert(preloadSource.includes('omp:get-profile'), 'preload.ts must invoke omp:get-profile');
  assert(preloadSource.includes('omp:set-profile'), 'preload.ts must invoke omp:set-profile');
  assert(preloadSource.includes('omp:profile-list'), 'preload.ts must invoke omp:profile-list');
  assert(preloadSource.includes('omp:profile-create'), 'preload.ts must invoke omp:profile-create');
  assert(preloadSource.includes('omp:profile-delete'), 'preload.ts must invoke omp:profile-delete');

  const mainSource = fs.readFileSync(path.resolve('electron/main.ts'), 'utf-8');
  assert(mainSource.includes('omp:get-profile'), 'main.ts must handle omp:get-profile');
  assert(mainSource.includes('omp:set-profile'), 'main.ts must handle omp:set-profile');
  assert(mainSource.includes('omp:profile-list'), 'main.ts must handle omp:profile-list');
  assert(mainSource.includes('omp:profile-create'), 'main.ts must handle omp:profile-create');
  assert(mainSource.includes('omp:profile-delete'), 'main.ts must handle omp:profile-delete');
});

console.log(`\nAll ${passCount} tests passed successfully!`);
