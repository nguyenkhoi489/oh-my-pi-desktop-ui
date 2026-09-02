import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ExtensionManager } from '../electron/extension-manager.ts';

let passCount = 0;
async function test(name, fn) {
  await fn();
  passCount++;
  console.log(`✓ ${name}`);
}

console.log('=== Running verify-extension-manager.mjs ===');

await test('ExtensionManager lists plugins from CLI JSON', async () => {
  const manager = new ExtensionManager();
  const res = await manager.listPlugins('omp');
  assert(res.success === true, 'listPlugins should succeed');
  assert(Array.isArray(res.plugins), 'res.plugins should be an array');
});

await test('ExtensionManager validates plugin install targets', async () => {
  const manager = new ExtensionManager();
  const res = await manager.installPlugin('omp', '');
  assert(res.success === false, 'Empty target should fail');
  assert(res.error.includes('package') || res.error.includes('plugin'), 'Error message should mention package/plugin');
});

await test('ExtensionManager validates plugin link paths', async () => {
  const manager = new ExtensionManager();
  const res = await manager.linkPlugin('omp', '');
  assert(res.success === false, 'Empty link path should fail');
  assert(res.error.includes('Đường dẫn'), 'Error message should mention Đường dẫn');
});

await test('ExtensionManager lists agents (bundled + custom)', async () => {
  const manager = new ExtensionManager();
  const res = await manager.listAgents('omp');
  assert(res.success === true, 'listAgents should succeed');
  assert(Array.isArray(res.agents), 'res.agents should be an array');
  assert(res.agents.some((a) => a.scope === 'bundled'), 'Should contain bundled agents');
});

await test('Preload and Main IPC contracts for extensions and agents are properly wired', async () => {
  const preloadSource = fs.readFileSync(path.resolve('electron/preload.ts'), 'utf-8');
  assert(preloadSource.includes('omp:plugin-list'), 'preload.ts must invoke omp:plugin-list');
  assert(preloadSource.includes('omp:plugin-install'), 'preload.ts must invoke omp:plugin-install');
  assert(preloadSource.includes('omp:plugin-uninstall'), 'preload.ts must invoke omp:plugin-uninstall');
  assert(preloadSource.includes('omp:plugin-link'), 'preload.ts must invoke omp:plugin-link');
  assert(preloadSource.includes('omp:agents-list'), 'preload.ts must invoke omp:agents-list');
  assert(preloadSource.includes('omp:agents-unpack'), 'preload.ts must invoke omp:agents-unpack');

  const mainSource = fs.readFileSync(path.resolve('electron/main.ts'), 'utf-8');
  assert(mainSource.includes('omp:plugin-list'), 'main.ts must handle omp:plugin-list');
  assert(mainSource.includes('omp:plugin-install'), 'main.ts must handle omp:plugin-install');
  assert(mainSource.includes('omp:plugin-uninstall'), 'main.ts must handle omp:plugin-uninstall');
  assert(mainSource.includes('omp:plugin-link'), 'main.ts must handle omp:plugin-link');
  assert(mainSource.includes('omp:agents-list'), 'main.ts must handle omp:agents-list');
  assert(mainSource.includes('omp:agents-unpack'), 'main.ts must handle omp:agents-unpack');
});

console.log(`\nAll ${passCount} tests passed successfully!`);
