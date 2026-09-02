/**
 * Verification Suite: Engine Configuration Backend (omp config)
 *
 * Probe Verification (2026-09-02, omp v18.1.2):
 * - `omp config list --json`: 482 keys
 * - `omp config list` (text): 87 keys with (opt1|opt2|...) enum format
 * - `omp config set tui.tight true` -> exit 0
 * - `omp config set extensions '[]'` -> exit 0
 * - `omp config path` -> ~/.omp/agent
 * - `omp --profile default config path` -> ~/.omp/agent
 *
 * Kiểm tra:
 * 1. parseConfigListJson, parseEnumOptions, mergeEnumOptions với fixture
 * 2. fetchEngineConfig live (>=480 entries, >=80 enum options)
 * 3. setEngineConfigValue & resetEngineConfigValue roundtrip live trên tui.tight
 * 4. getEngineConfigPath live
 * 5. Cache 60s, forceRefresh & cache invalidation khi set/reset
 * 6. Xử lý lỗi: key rỗng, key chứa khoảng trắng, key không tồn tại
 */

import assert from 'node:assert';
import {
  parseConfigListJson,
  parseEnumOptions,
  mergeEnumOptions,
  fetchEngineConfig,
  setEngineConfigValue,
  resetEngineConfigValue,
  getEngineConfigPath,
  clearEngineConfigCache,
  getEngineConfigCacheInfo,
} from '../electron/engine-config.ts';

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ PASSED: ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAILED: ${message}`);
  }
}

async function test(name, fn) {
  try {
    await fn();
  } catch (err) {
    failed++;
    console.error(`  ✗ FAILED: ${name}\n`, err);
  }
}

console.log('=== Starting Engine Config Backend Verification Suite ===\n');

// ----------------------------------------------------
// Fixtures
// ----------------------------------------------------
const FIXTURE_CONFIG_JSON = JSON.stringify({
  symbolPreset: {
    value: 'unicode',
    type: 'enum',
    description: 'Glyph set for icons and symbols (Unicode, Nerd Font, or ASCII)',
  },
  'statusLine.preset': {
    value: 'minimal',
    type: 'enum',
    description: 'Pre-built status line configurations',
  },
  'tui.tight': {
    value: true,
    type: 'boolean',
    description: 'Remove horizontal padding',
  },
  'images.urls.credentials': {
    redacted: true,
    type: 'record',
    description: 'Secret credentials',
  },
  extensions: {
    value: [],
    type: 'array',
    description: '',
  },
  'auth.broker.url': {
    type: 'string',
    description: '',
  },
});

const FIXTURE_CONFIG_TEXT = `
Settings:

[appearance]
  theme.dark = pearl (string)
  theme.light = light (string)
  symbolPreset = unicode (unicode|nerd|ascii)
  colorBlindMode = false (boolean)
  statusLine.preset = minimal (default|minimal|compact|full|nerd|ascii|custom)
  statusLine.separator = powerline-thin (powerline|powerline-thin|slash|pipe|block|none|ascii)
  statusLine.contextLine = embedded (off|percentage|annotated|embedded)
  tui.resizeScrollback = rebuild (append|rebuild|preserve)
  tui.hyperlinks = auto (off|auto|always)
  display.shimmer = classic (classic|kitt|disabled)
`;

// ----------------------------------------------------
// 1. Parser & Merger Unit Tests
// ----------------------------------------------------
console.log('--- 1. Parser & Merger Unit Tests ---');

await test('parseConfigListJson parses valid JSON entries properly', () => {
  const entries = parseConfigListJson(FIXTURE_CONFIG_JSON);
  check(entries.length === 6, `Should parse 6 entries (got ${entries.length})`);

  const symbolPreset = entries.find((e) => e.key === 'symbolPreset');
  check(symbolPreset?.value === 'unicode', 'symbolPreset value should be unicode');
  check(symbolPreset?.type === 'enum', 'symbolPreset type should be enum');
  check(
    symbolPreset?.description.includes('Glyph set'),
    'symbolPreset should have description'
  );

  const tuiTight = entries.find((e) => e.key === 'tui.tight');
  check(tuiTight?.value === true, 'tui.tight value should be boolean true');

  const redactedEntry = entries.find((e) => e.key === 'images.urls.credentials');
  check(redactedEntry?.redacted === true, 'images.urls.credentials should have redacted=true');

  const emptyUrl = entries.find((e) => e.key === 'auth.broker.url');
  check(emptyUrl?.value === undefined, 'Unset value should be undefined');
  check(emptyUrl?.type === 'string', 'Unset type should be string');
});

await test('parseConfigListJson handles banner text and malformed input', () => {
  const withBanner = `[omp] Checking configuration...\n${FIXTURE_CONFIG_JSON}\n[omp] Done.`;
  const entries = parseConfigListJson(withBanner);
  check(entries.length === 6, 'Should extract JSON even with banner output');

  const empty = parseConfigListJson('');
  check(empty.length === 0, 'Empty string returns empty array');

  const malformed = parseConfigListJson('{ not valid json');
  check(malformed.length === 0, 'Malformed JSON returns empty array');
});

await test('parseEnumOptions extracts enum choices from text listing', () => {
  const enumMap = parseEnumOptions(FIXTURE_CONFIG_TEXT);
  check(enumMap.size >= 7, `Should extract >=7 enum mappings (got ${enumMap.size})`);

  const symbolPreset = enumMap.get('symbolPreset');
  check(
    Array.isArray(symbolPreset) && symbolPreset.join('|') === 'unicode|nerd|ascii',
    'symbolPreset options match unicode|nerd|ascii'
  );

  const preset = enumMap.get('statusLine.preset');
  check(
    preset?.includes('minimal') && preset?.includes('compact'),
    'statusLine.preset options match'
  );
});

await test('mergeEnumOptions attaches enumOptions to matching entries', () => {
  const entries = parseConfigListJson(FIXTURE_CONFIG_JSON);
  const enumMap = parseEnumOptions(FIXTURE_CONFIG_TEXT);
  mergeEnumOptions(entries, enumMap);

  const symbolPreset = entries.find((e) => e.key === 'symbolPreset');
  check(
    Array.isArray(symbolPreset?.enumOptions) && symbolPreset.enumOptions.length === 3,
    'symbolPreset received 3 enumOptions'
  );

  const tuiTight = entries.find((e) => e.key === 'tui.tight');
  check(tuiTight?.enumOptions === undefined, 'tui.tight should not have enumOptions');
});

// ----------------------------------------------------
// 2. Input Validation & Error Handling
// ----------------------------------------------------
console.log('\n--- 2. Input Validation & Error Handling ---');

await test('setEngineConfigValue & resetEngineConfigValue reject invalid keys', async () => {
  const resEmpty = await setEngineConfigValue('omp', '', 'val');
  check(resEmpty.success === false, 'Empty key in set should fail');

  const resSpace = await setEngineConfigValue('omp', 'key with spaces', 'val');
  check(resSpace.success === false, 'Key with space in set should fail');

  const resResetEmpty = await resetEngineConfigValue('omp', '   ');
  check(resResetEmpty.success === false, 'Whitespace key in reset should fail');

  const resNonExistent = await setEngineConfigValue('omp', 'invalid.setting.key.12345', 'val');
  check(resNonExistent.success === false, 'Non-existent setting should return error');
});

// ----------------------------------------------------
// 3. Live Binary Tests
// ----------------------------------------------------
console.log('\n--- 3. Live Binary Tests ---');

await test('fetchEngineConfig retrieves 480+ entries with >=80 enum options', async () => {
  clearEngineConfigCache();
  const res = await fetchEngineConfig('omp', { forceRefresh: true });
  check(res.success === true, 'fetchEngineConfig should succeed');
  check(Array.isArray(res.entries), 'entries should be an array');
  check(
    (res.entries?.length ?? 0) >= 480,
    `Should have at least 480 entries (got ${res.entries?.length})`
  );

  const enumCount = res.entries?.filter((e) => e.enumOptions && e.enumOptions.length > 0).length ?? 0;
  check(enumCount >= 80, `Should have at least 80 enum options (got ${enumCount})`);
});

await test('getEngineConfigPath returns path to agent config directory', async () => {
  const res = await getEngineConfigPath('omp');
  check(res.success === true, 'getEngineConfigPath should succeed');
  check(Boolean(res.path && res.path.includes('.omp')), `Path should include .omp (got ${res.path})`);
});

await test('setEngineConfigValue and resetEngineConfigValue roundtrip live on tui.tight', async () => {
  // Read current value
  const initialConfig = await fetchEngineConfig('omp', { forceRefresh: true });
  const initialTight = initialConfig.entries?.find((e) => e.key === 'tui.tight')?.value ?? true;

  // Set opposite value
  const targetVal = initialTight === true ? 'false' : 'true';
  const setRes = await setEngineConfigValue('omp', 'tui.tight', targetVal);
  check(setRes.success === true, `Setting tui.tight to ${targetVal} succeeded`);

  // Verify change
  const afterSet = await fetchEngineConfig('omp', { forceRefresh: true });
  const updatedVal = afterSet.entries?.find((e) => e.key === 'tui.tight')?.value;
  check(
    String(updatedVal) === targetVal,
    `tui.tight updated value confirmed as ${targetVal} (got ${updatedVal})`
  );

  // Reset back
  const resetRes = await resetEngineConfigValue('omp', 'tui.tight');
  check(resetRes.success === true, 'Resetting tui.tight succeeded');

  // Set back to original to leave state pristine
  if (initialTight !== undefined) {
    await setEngineConfigValue('omp', 'tui.tight', String(initialTight));
  }
});

// ----------------------------------------------------
// 4. Cache & Invalidation Tests
// ----------------------------------------------------
console.log('\n--- 4. Cache & Invalidation Tests ---');

await test('Cache serves cached entries and invalidates on mutation', async () => {
  clearEngineConfigCache();
  check(getEngineConfigCacheInfo().hasCached === false, 'Cache is initially empty');

  // First fetch populates cache
  const fetch1 = await fetchEngineConfig('omp');
  check(fetch1.success === true, 'First fetch succeeded');
  const cacheInfo1 = getEngineConfigCacheInfo();
  check(cacheInfo1.hasCached === true, 'Cache is now populated');

  // Second fetch without forceRefresh hits cache
  const fetch2 = await fetchEngineConfig('omp');
  check(fetch2.success === true, 'Second fetch succeeded');
  check(fetch2.entries === fetch1.entries, 'Second fetch returned exact cached instance');

  // Mutation invalidates cache
  await setEngineConfigValue('omp', 'tui.tight', 'true');
  const cacheInfoAfterSet = getEngineConfigCacheInfo();
  check(cacheInfoAfterSet.hasCached === false, 'Cache was invalidated after set');
});

// ----------------------------------------------------
// Summary
// ----------------------------------------------------
console.log(`\n=== Engine Config Backend Suite Finished ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\nAll tests passed successfully!');
}
