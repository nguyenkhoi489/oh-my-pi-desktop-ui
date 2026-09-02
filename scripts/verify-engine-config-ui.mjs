/**
 * Verification Suite: Engine Configuration Editor UI (Phase 3)
 *
 * Kiểm tra:
 * 1. src/utils/engineConfig.ts pure functions:
 *    - groupByPrefix với fixture đa dạng
 *    - filterEntries với key, description, tiếng Việt có dấu/không dấu, case-insensitive
 *    - coerceInput với boolean, number, enum, string, array, record, lỗi cú pháp JSON
 *    - formatConfigValue với mọi kiểu dữ liệu
 *    - PINNED_CONFIG_KEYS (18 keys theo plan)
 *    - SESSION_OVERRIDE_KEYS (7 override keys theo plan)
 *    - MAX_RENDER_CONFIG_ROWS = 200
 * 2. Static contracts & Component wiring:
 *    - SettingsModal.tsx tab 'engine-config' và props
 *    - EngineConfigEditor.tsx structure, input handling, override badges
 *    - App.tsx wiring từ useOmpRpc sang SettingsModal
 * 3. i18n keys parity for engineConfig.*
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  PINNED_CONFIG_KEYS,
  SESSION_OVERRIDE_KEYS,
  MAX_RENDER_CONFIG_ROWS,
  removeAccents,
  filterEntries,
  groupByPrefix,
  coerceInput,
  formatConfigValue,
} from '../src/utils/engineConfig.ts';
import { vi } from '../shared/i18n/vi.ts';
import { en } from '../shared/i18n/en.ts';

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

console.log('=== Starting Engine Config Editor UI Verification Suite (Phase 3) ===\n');

// ----------------------------------------------------
// 1. PINNED_CONFIG_KEYS & SESSION_OVERRIDE_KEYS
// ----------------------------------------------------
console.log('--- 1. Pinned Keys & Session Overrides ---');

const EXPECTED_PINNED = [
  'tools.approvalMode',
  'defaultThinkingLevel',
  'steeringMode',
  'followUpMode',
  'interruptMode',
  'autoResume',
  'update.channel',
  'startup.checkUpdate',
  'compaction.enabled',
  'compaction.thresholdPercent',
  'retry.enabled',
  'retry.maxRetries',
  'lsp.enabled',
  'todo.enabled',
  'skills.enabled',
  'memories.enabled',
  'browser.enabled',
  'git.enabled',
];

check(
  PINNED_CONFIG_KEYS.length === EXPECTED_PINNED.length,
  `PINNED_CONFIG_KEYS contains exactly ${EXPECTED_PINNED.length} keys`,
);

EXPECTED_PINNED.forEach((key) => {
  check(PINNED_CONFIG_KEYS.includes(key), `PINNED_CONFIG_KEYS contains '${key}'`);
});

const EXPECTED_OVERRIDES = [
  'tools.approvalMode',
  'steeringMode',
  'followUpMode',
  'interruptMode',
  'defaultThinkingLevel',
  'modelRoles',
  'autoResume',
];

EXPECTED_OVERRIDES.forEach((key) => {
  const info = SESSION_OVERRIDE_KEYS[key];
  check(info !== undefined, `SESSION_OVERRIDE_KEYS has '${key}'`);
  check(typeof info?.appSetting === 'string', `'${key}' has appSetting descriptor`);
  check(typeof info?.descriptionKey === 'string', `'${key}' has descriptionKey`);
  check(vi[info?.descriptionKey] !== undefined, `'${key}' descriptionKey exists in vi.ts`);
  check(en[info?.descriptionKey] !== undefined, `'${key}' descriptionKey exists in en.ts`);
});

check(MAX_RENDER_CONFIG_ROWS === 200, 'MAX_RENDER_CONFIG_ROWS is capped at 200');

// ----------------------------------------------------
// 2. removeAccents & filterEntries
// ----------------------------------------------------
console.log('\n--- 2. Search & Filtering ---');

check(removeAccents('Cấu hình Engine') === 'cau hinh engine', 'removeAccents strips Vietnamese accents');
check(removeAccents('Đường dẫn Đã lưu') === 'duong dan da luu', 'removeAccents handles đ and Đ');

const MOCK_ENTRIES = [
  {
    key: 'compaction.enabled',
    value: true,
    type: 'boolean',
    description: 'Tự động nén ngữ cảnh khi vượt ngưỡng',
  },
  {
    key: 'compaction.thresholdPercent',
    value: 80,
    type: 'number',
    description: 'Ngưỡng phần trăm context kích hoạt compaction',
  },
  {
    key: 'update.channel',
    value: 'stable',
    type: 'enum',
    enumOptions: ['stable', 'beta', 'nightly'],
    description: 'Kênh cập nhật phiên bản OMP',
  },
  {
    key: 'symbolPreset',
    value: 'unicode',
    type: 'enum',
    description: 'Bộ ký tự biểu tượng',
  },
  {
    key: 'extensions',
    value: [],
    type: 'array',
    description: 'Danh sách các tiện ích mở rộng',
  },
];

check(filterEntries(MOCK_ENTRIES, '').length === 5, 'filterEntries with empty query returns all items');
check(filterEntries(MOCK_ENTRIES, '   ').length === 5, 'filterEntries with whitespace returns all items');

const compactionMatches = filterEntries(MOCK_ENTRIES, 'compaction');
check(compactionMatches.length === 2, 'filterEntries matches by key name ("compaction")');

const descMatches = filterEntries(MOCK_ENTRIES, 'nguong');
check(descMatches.length === 2, 'filterEntries matches by unaccented query in description ("nguong")');

const accentedDescMatches = filterEntries(MOCK_ENTRIES, 'ngưỡng');
check(accentedDescMatches.length === 2, 'filterEntries matches by accented query in description ("ngưỡng")');

const emptyMatches = filterEntries(MOCK_ENTRIES, 'nonexistent_key_xyz');
check(emptyMatches.length === 0, 'filterEntries returns empty array for non-matching query');

// ----------------------------------------------------
// 3. groupByPrefix
// ----------------------------------------------------
console.log('\n--- 3. Grouping by Prefix ---');

const groups = groupByPrefix(MOCK_ENTRIES);
check(groups['compaction']?.length === 2, 'groupByPrefix groups "compaction.*" items');
check(groups['update']?.length === 1, 'groupByPrefix groups "update.*" items');
check(groups['general']?.length === 2, 'groupByPrefix assigns non-dotted keys ("symbolPreset", "extensions") to "general"');
check(
  groups['compaction'][0].key === 'compaction.enabled' &&
    groups['compaction'][1].key === 'compaction.thresholdPercent',
  'groupByPrefix sorts keys inside each group',
);

// ----------------------------------------------------
// 4. coerceInput & formatConfigValue
// ----------------------------------------------------
console.log('\n--- 4. Coercion & Formatting ---');

// Boolean
check(coerceInput('boolean', true).value === true, 'coerce boolean true');
check(coerceInput('boolean', 'true').value === true, 'coerce string "true" to boolean true');
check(coerceInput('boolean', 'false').value === false, 'coerce string "false" to boolean false');
check(coerceInput('boolean', '1').value === true, 'coerce string "1" to boolean true');
check(coerceInput('boolean', '0').value === false, 'coerce string "0" to boolean false');
check(coerceInput('boolean', 'invalid_bool').error !== undefined, 'coerce invalid boolean returns error');

// Number
check(coerceInput('number', 42).value === 42, 'coerce number 42');
check(coerceInput('number', '123.45').value === 123.45, 'coerce string "123.45" to number');
check(coerceInput('number', 'not_a_num').error !== undefined, 'coerce invalid number returns error');
check(coerceInput('number', '').error !== undefined, 'coerce empty string for number returns error');

// Array
const validArr = coerceInput('array', '["a", "b", 123]');
check(!validArr.error && Array.isArray(validArr.value) && validArr.value.length === 3, 'coerce valid JSON array');
const invalidArrJson = coerceInput('array', '{ "not": "array" }');
check(invalidArrJson.error === 'engineConfig.error.expectedArray', 'coerce non-array object JSON returns expectedArray error');
const malformedArr = coerceInput('array', '[invalid');
check(malformedArr.error === 'engineConfig.error.invalidJson', 'coerce malformed array JSON returns invalidJson error');

// Record
const validRecord = coerceInput('record', '{"key": "value", "num": 1}');
check(!validRecord.error && typeof validRecord.value === 'object' && !Array.isArray(validRecord.value), 'coerce valid JSON record');
const invalidRecordJson = coerceInput('record', '["an", "array"]');
check(invalidRecordJson.error === 'engineConfig.error.expectedObject', 'coerce array JSON for record returns expectedObject error');
const malformedRecord = coerceInput('record', '{key: "missing quotes"}');
check(malformedRecord.error === 'engineConfig.error.invalidJson', 'coerce malformed record JSON returns invalidJson error');

// Enum & String
check(coerceInput('enum', 'beta').value === 'beta', 'coerce enum returns string');
check(coerceInput('string', 'hello world').value === 'hello world', 'coerce string returns string');

// formatConfigValue
check(formatConfigValue(true) === 'true', 'formatConfigValue boolean');
check(formatConfigValue(100) === '100', 'formatConfigValue number');
check(formatConfigValue('sample') === 'sample', 'formatConfigValue string');
check(formatConfigValue({ a: 1 }) === '{\n  "a": 1\n}', 'formatConfigValue object');
check(formatConfigValue(null) === '', 'formatConfigValue null');
check(formatConfigValue(undefined) === '', 'formatConfigValue undefined');

// ----------------------------------------------------
// 5. Component & SettingsModal Integration Tests
// ----------------------------------------------------
console.log('\n--- 5. Component Wiring & Source Checks ---');

const settingsModalSrc = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/Modals/SettingsModal.tsx'),
  'utf-8',
);
const engineConfigEditorSrc = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/Modals/settings/EngineConfigEditor.tsx'),
  'utf-8',
);
const appSrc = fs.readFileSync(
  path.resolve(process.cwd(), 'src/App.tsx'),
  'utf-8',
);

check(settingsModalSrc.includes("activeTab === 'engine-config'"), 'SettingsModal has engine-config tab condition');
check(settingsModalSrc.includes("setActiveTab('engine-config')"), 'SettingsModal has engine-config tab button');
check(settingsModalSrc.includes('<EngineConfigEditor'), 'SettingsModal renders EngineConfigEditor');
check(settingsModalSrc.includes('getEngineConfig?:'), 'SettingsModalProps includes getEngineConfig');
check(settingsModalSrc.includes('setEngineConfigValue?:'), 'SettingsModalProps includes setEngineConfigValue');
check(settingsModalSrc.includes('resetEngineConfigValue?:'), 'SettingsModalProps includes resetEngineConfigValue');
check(settingsModalSrc.includes('getEngineConfigPath?:'), 'SettingsModalProps includes getEngineConfigPath');

check(appSrc.includes('getEngineConfig,'), 'App.tsx destructures getEngineConfig from useOmpRpc');
check(appSrc.includes('setEngineConfigValue,'), 'App.tsx destructures setEngineConfigValue from useOmpRpc');
check(appSrc.includes('resetEngineConfigValue,'), 'App.tsx destructures resetEngineConfigValue from useOmpRpc');
check(appSrc.includes('getEngineConfigPath,'), 'App.tsx destructures getEngineConfigPath from useOmpRpc');
check(appSrc.includes('getEngineConfig={getEngineConfig}'), 'App.tsx passes getEngineConfig to SettingsModal');
check(appSrc.includes('setEngineConfigValue={setEngineConfigValue}'), 'App.tsx passes setEngineConfigValue to SettingsModal');
check(appSrc.includes('resetEngineConfigValue={resetEngineConfigValue}'), 'App.tsx passes resetEngineConfigValue to SettingsModal');
check(appSrc.includes('getEngineConfigPath={getEngineConfigPath}'), 'App.tsx passes getEngineConfigPath to SettingsModal');

check(engineConfigEditorSrc.includes('MAX_RENDER_CONFIG_ROWS'), 'EngineConfigEditor uses MAX_RENDER_CONFIG_ROWS');
check(engineConfigEditorSrc.includes('SESSION_OVERRIDE_KEYS'), 'EngineConfigEditor handles SESSION_OVERRIDE_KEYS');
check(engineConfigEditorSrc.includes('PINNED_CONFIG_KEYS'), 'EngineConfigEditor handles PINNED_CONFIG_KEYS');

// ----------------------------------------------------
// 6. i18n Keys Parity
// ----------------------------------------------------
console.log('\n--- 6. i18n Keys Parity ---');

const REQUIRED_I18N_KEYS = [
  'settings.tab.engineConfig',
  'engineConfig.title',
  'engineConfig.desc',
  'engineConfig.search.placeholder',
  'engineConfig.path',
  'engineConfig.refresh',
  'engineConfig.group.pinned',
  'engineConfig.group.other',
  'engineConfig.override.badge',
  'engineConfig.override.approvalMode',
  'engineConfig.override.steeringMode',
  'engineConfig.override.followUpMode',
  'engineConfig.override.interruptMode',
  'engineConfig.override.thinkingLevel',
  'engineConfig.override.modelRoles',
  'engineConfig.override.autoResume',
  'engineConfig.reset.tooltip',
  'engineConfig.save.tooltip',
  'engineConfig.saving',
  'engineConfig.saved',
  'engineConfig.resetting',
  'engineConfig.empty.search',
  'engineConfig.empty.total',
  'engineConfig.error.invalidBoolean',
  'engineConfig.error.invalidNumber',
  'engineConfig.error.invalidJson',
  'engineConfig.error.expectedArray',
  'engineConfig.error.expectedObject',
  'engineConfig.cap.warning',
];

REQUIRED_I18N_KEYS.forEach((k) => {
  check(vi[k] !== undefined, `vi.ts has '${k}'`);
  check(en[k] !== undefined, `en.ts has '${k}'`);
});

// ----------------------------------------------------
// Summary
// ----------------------------------------------------
console.log('\n====================================================');
console.log(`Engine Config Editor UI Verification: ${passed} passed, ${failed} failed.`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
}
