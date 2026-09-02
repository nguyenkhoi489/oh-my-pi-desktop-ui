/**
 * Verification Suite: Model Roles trong ~/.omp/agent/config.yml
 *
 * Requirements:
 * 1. parseModelRolesYaml parses modelRoles map from real-shape config.yml fixture.
 * 2. parseModelRolesYaml returns {} for missing/invalid modelRoles or broken YAML.
 * 3. readModelRolesConfig handles existing and missing (ENOENT) files.
 * 4. writeModelRolesConfig updates only modelRoles, preserving all other keys and comments.
 * 5. writeModelRolesConfig creates .bak backup before writing.
 * 6. writeModelRolesConfig with empty roles removes the modelRoles key.
 * 7. writeModelRolesConfig refuses to update a syntactically broken config.yml.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseModelRolesYaml,
  readModelRolesConfig,
  writeModelRolesConfig,
} from '../electron/roles-config.ts';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    failed++;
    throw new Error(message);
  } else {
    console.log(`  ✓ PASSED: ${message}`);
    passed++;
  }
}

console.log('=== Starting Model Roles Config Verification Suite ===\n');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-roles-test-'));
const testConfigPath = path.join(tempDir, 'config.yml');

const REAL_CONFIG_YML_FIXTURE = `# Cấu hình OMP agent
modelRoles:
  default: lm-studio/gemini-3.7-flash-tiered
  smol: anthropic/claude-haiku-4-5
  plan: anthropic/claude-opus-4-8
  vision: anthropic/claude-sonnet-5
symbolPreset: unicode
theme:
  dark: pearl
  light: light
compaction:
  idleThresholdTokens: 300000
  enabled: true
statusLine:
  preset: minimal
`;

try {
  console.log('--- Test 1: parseModelRolesYaml with real-shape fixture ---');
  const roles = parseModelRolesYaml(REAL_CONFIG_YML_FIXTURE);
  assert(Object.keys(roles).length === 4, 'Parses 4 roles from fixture');
  assert(roles.default === 'lm-studio/gemini-3.7-flash-tiered', 'default role parsed');
  assert(roles.smol === 'anthropic/claude-haiku-4-5', 'smol role parsed');

  console.log('\n--- Test 2: parseModelRolesYaml edge cases ---');
  assert(Object.keys(parseModelRolesYaml('')).length === 0, 'Empty content returns {}');
  assert(Object.keys(parseModelRolesYaml('theme:\n  dark: pearl\n')).length === 0, 'Missing modelRoles returns {}');
  assert(Object.keys(parseModelRolesYaml('modelRoles: [a, b]\n')).length === 0, 'Array modelRoles returns {}');
  assert(Object.keys(parseModelRolesYaml('modelRoles: {smol: 123}\n')).length === 0, 'Non-string model value ignored');
  assert(Object.keys(parseModelRolesYaml(':::broken yaml{{{')).length === 0, 'Broken YAML returns {}');

  console.log('\n--- Test 3: readModelRolesConfig existing & missing files ---');
  fs.writeFileSync(testConfigPath, REAL_CONFIG_YML_FIXTURE, 'utf-8');
  const readRes = await readModelRolesConfig(testConfigPath);
  assert(readRes.roles.plan === 'anthropic/claude-opus-4-8', 'Reads roles from existing file');
  assert(readRes.isWritable === true, 'Existing temp file is writable');
  const missingRes = await readModelRolesConfig(path.join(tempDir, 'nonexistent.yml'));
  assert(Object.keys(missingRes.roles).length === 0 && !missingRes.error, 'ENOENT returns empty roles without error');

  console.log('\n--- Test 4: writeModelRolesConfig preserves other keys and comments ---');
  const writeRes = await writeModelRolesConfig(
    {
      default: 'lm-studio/gemini-3.7-flash-tiered',
      smol: 'anthropic/claude-haiku-4-5',
      slow: 'anthropic/claude-sonnet-5',
    },
    testConfigPath
  );
  assert(writeRes.success === true, 'Write succeeds');
  const afterContent = fs.readFileSync(testConfigPath, 'utf-8');
  assert(afterContent.includes('# Cấu hình OMP agent'), 'Top comment preserved');
  assert(afterContent.includes('symbolPreset: unicode'), 'symbolPreset preserved');
  assert(afterContent.includes('idleThresholdTokens: 300000'), 'compaction preserved');
  assert(afterContent.includes('preset: minimal'), 'statusLine preserved');
  assert(afterContent.includes('slow: anthropic/claude-sonnet-5'), 'New slow role written');
  assert(!afterContent.includes('vision:'), 'Removed vision role gone');
  const reread = await readModelRolesConfig(testConfigPath);
  assert(Object.keys(reread.roles).length === 3, 'Re-read returns exactly 3 roles');

  console.log('\n--- Test 5: backup .bak created ---');
  assert(fs.existsSync(`${testConfigPath}.bak`), '.bak backup exists');
  assert(
    fs.readFileSync(`${testConfigPath}.bak`, 'utf-8').includes('vision: anthropic/claude-sonnet-5'),
    'Backup holds pre-write content'
  );

  console.log('\n--- Test 6: empty roles removes modelRoles key ---');
  const emptyRes = await writeModelRolesConfig({}, testConfigPath);
  assert(emptyRes.success === true, 'Empty write succeeds');
  const emptiedContent = fs.readFileSync(testConfigPath, 'utf-8');
  assert(!emptiedContent.includes('modelRoles'), 'modelRoles key removed');
  assert(emptiedContent.includes('symbolPreset: unicode'), 'Other keys still preserved');

  console.log('\n--- Test 7: broken config.yml is not clobbered ---');
  const brokenPath = path.join(tempDir, 'broken.yml');
  const brokenContent = 'modelRoles: {smol: [\nunclosed';
  fs.writeFileSync(brokenPath, brokenContent, 'utf-8');
  const brokenRes = await writeModelRolesConfig({ smol: 'anthropic/claude-haiku-4-5' }, brokenPath);
  assert(brokenRes.success === false, 'Write to broken file fails gracefully');
  assert(fs.readFileSync(brokenPath, 'utf-8') === brokenContent, 'Broken file content untouched');

  console.log(`\n=== Suite complete: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
} catch (err) {
  console.error(`\n=== Suite aborted: ${err.message} (${passed} passed, ${failed} failed) ===`);
  process.exit(1);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
