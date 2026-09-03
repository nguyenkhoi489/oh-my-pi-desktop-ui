/**
 * Verification Suite: Grievances (Auto-QA Tool Issues) (Phase 13)
 */

import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  validateCleanOptions,
  buildGrievancesArgs,
  parseGrievancesListJson,
  listGrievances,
  cleanGrievances,
  MAX_GRIEVANCES_LIMIT,
  DEFAULT_AUTOQA_ENDPOINT,
} from '../electron/grievances.ts';
import { vi } from '../shared/i18n/vi.ts';
import { en } from '../shared/i18n/en.ts';

let passCount = 0;

function test(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passCount++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('=== Running verify-grievances.mjs ===\n');

// 1. Kiểm tra logic xác thực validateCleanOptions
test('validateCleanOptions enforces mutually exclusive options and valid types', () => {
  // Rỗng
  const emptyRes = validateCleanOptions({});
  assert.strictEqual(emptyRes.valid, false, 'Empty options must be rejected');

  // Quá nhiều tùy chọn (id + tool)
  const multiRes1 = validateCleanOptions({ id: 1, tool: 'browser' });
  assert.strictEqual(multiRes1.valid, false, 'id and tool together must be rejected');

  // Quá nhiều tùy chọn (id + all)
  const multiRes2 = validateCleanOptions({ id: 1, all: true });
  assert.strictEqual(multiRes2.valid, false, 'id and all together must be rejected');

  // Quá nhiều tùy chọn (tool + all)
  const multiRes3 = validateCleanOptions({ tool: 'bash', all: true });
  assert.strictEqual(multiRes3.valid, false, 'tool and all together must be rejected');

  // ID không hợp lệ (số âm, số 0, số thực, chuỗi)
  assert.strictEqual(validateCleanOptions({ id: 0 }).valid, false, 'id=0 must be rejected');
  assert.strictEqual(validateCleanOptions({ id: -5 }).valid, false, 'Negative id must be rejected');
  assert.strictEqual(validateCleanOptions({ id: 1.5 }).valid, false, 'Float id must be rejected');
  assert.strictEqual(validateCleanOptions({ id: '1' }).valid, false, 'String id must be rejected');

  // Hợp lệ
  assert.strictEqual(validateCleanOptions({ id: 42 }).valid, true, 'Positive integer id must pass');
  assert.strictEqual(validateCleanOptions({ tool: 'browser' }).valid, true, 'Valid tool string must pass');
  assert.strictEqual(validateCleanOptions({ all: true }).valid, true, 'all=true must pass');
});

// 2. Kiểm tra hàm dựng tham số buildGrievancesArgs
test('buildGrievancesArgs builds correct CLI flags for list, clean, and push', () => {
  // List mặc định
  const listArgs1 = buildGrievancesArgs('list');
  assert.deepStrictEqual(
    listArgs1,
    ['grievances', 'list', '--json', `--limit=${MAX_GRIEVANCES_LIMIT}`],
    'Default list args should include --json and default limit'
  );

  // List với limit và tool và profile
  const listArgs2 = buildGrievancesArgs('list', {
    limit: 50,
    tool: 'browser',
    profile: 'work',
  });
  assert.deepStrictEqual(
    listArgs2,
    ['--profile=work', 'grievances', 'list', '--json', '--limit=50', '--tool=browser'],
    'List with options should order flags correctly'
  );

  // List với limit vượt quá MAX_GRIEVANCES_LIMIT (200)
  const listArgs3 = buildGrievancesArgs('list', { limit: 500 });
  assert.deepStrictEqual(
    listArgs3,
    ['grievances', 'list', '--json', '--limit=200'],
    'Limit must be capped at MAX_GRIEVANCES_LIMIT (200)'
  );

  // Clean theo ID
  const cleanArgs1 = buildGrievancesArgs('clean', { id: 105 });
  assert.deepStrictEqual(
    cleanArgs1,
    ['grievances', 'clean', '--id=105'],
    'Clean with id should build --id flag'
  );

  // Clean theo Tool
  const cleanArgs2 = buildGrievancesArgs('clean', { tool: 'editor', profile: 'custom' });
  assert.deepStrictEqual(
    cleanArgs2,
    ['--profile=custom', 'grievances', 'clean', '--tool=editor'],
    'Clean with tool should build --tool flag'
  );

  // Clean tất cả (--all)
  const cleanArgs3 = buildGrievancesArgs('clean', { all: true });
  assert.deepStrictEqual(
    cleanArgs3,
    ['grievances', 'clean', '--all'],
    'Clean with all should build --all flag'
  );

  // Push
  const pushArgs1 = buildGrievancesArgs('push');
  assert.deepStrictEqual(
    pushArgs1,
    ['grievances', 'push'],
    'Push args should be ["grievances", "push"]'
  );

  const pushArgs2 = buildGrievancesArgs('push', { profile: 'team' });
  assert.deepStrictEqual(
    pushArgs2,
    ['--profile=team', 'grievances', 'push'],
    'Push with profile should include profile flag'
  );
});

// 3. Phân tích fixture JSON từ CLI thực tế
test('parseGrievancesListJson parses fixture and handles edge cases', () => {
  const sampleFixture = JSON.stringify([
    {
      id: 2,
      model: 'anthropic/claude-opus-5',
      version: '17.3.8',
      tool: 'browser',
      report: 'tab killed with "Browser tab worker recovery failed; tab killed"',
    },
    {
      id: 1,
      model: 'anthropic/claude-opus-5',
      version: '17.3.8',
      tool: 'browser',
      report: 'run failed with "Failed to clear browser request interception"',
    },
  ]);

  const parsed = parseGrievancesListJson(sampleFixture);
  assert.strictEqual(parsed.length, 2, 'Should parse 2 grievance items');
  assert.strictEqual(parsed[0].id, 2);
  assert.strictEqual(parsed[0].tool, 'browser');
  assert.strictEqual(parsed[0].model, 'anthropic/claude-opus-5');
  assert.strictEqual(parsed[0].version, '17.3.8');
  assert.ok(parsed[0].report.includes('Browser tab worker recovery failed'));

  assert.strictEqual(parsed[1].id, 1);
  assert.strictEqual(parsed[1].tool, 'browser');

  // Edge cases
  assert.deepStrictEqual(parseGrievancesListJson(''), [], 'Empty string should yield empty array');
  assert.deepStrictEqual(parseGrievancesListJson('   '), [], 'Whitespace string should yield empty array');
  assert.deepStrictEqual(parseGrievancesListJson('{ "invalid": true }'), [], 'Non-array JSON should yield empty array');
  assert.deepStrictEqual(parseGrievancesListJson('malformed json {{{'), [], 'Malformed JSON should yield empty array');
});

// 4. Live CLI test: listGrievances
await asyncTest('Live CLI test: listGrievances with live omp binary', async () => {
  const res = await listGrievances('omp', { limit: 10 });
  assert.strictEqual(res.success, true, 'listGrievances should succeed with live omp binary');
  assert.ok(Array.isArray(res.grievances), 'res.grievances must be an array');
  assert.ok(typeof res.endpoint === 'string' && res.endpoint.startsWith('http'), 'endpoint must be a valid URL');

  // Verify elements shape
  for (const item of res.grievances) {
    assert.ok(typeof item.id === 'number', 'item.id must be a number');
    assert.ok(typeof item.model === 'string', 'item.model must be a string');
    assert.ok(typeof item.tool === 'string', 'item.tool must be a string');
    assert.ok(typeof item.report === 'string', 'item.report must be a string');
  }
});

// 5. Live CLI test: cleanGrievances với tool không tồn tại (không xóa nhầm data)
await asyncTest('Live CLI test: cleanGrievances with safe non-existent tool filter', async () => {
  // Pre-check validation
  const invalidCall = await cleanGrievances('omp', {});
  assert.strictEqual(invalidCall.success, false, 'Calling clean without options must fail');

  // Safe live call with a nonexistent tool name
  const res = await cleanGrievances('omp', { tool: 'non_existent_tool_verify_test_xyz' });
  assert.strictEqual(res.success, true, 'Clean with nonexistent tool should exit cleanly');
  assert.ok(typeof res.message === 'string', 'res.message should be string');
});

// 6. Kiểm tra khóa hợp đồng (Contract Pinning) giữa các tầng
test('Contract pinning: IPC channels, preload methods, and types', () => {
  const mainTs = fs.readFileSync(path.resolve('electron/main.ts'), 'utf8');
  const preloadTs = fs.readFileSync(path.resolve('electron/preload.ts'), 'utf8');
  const electronTypesTs = fs.readFileSync(path.resolve('electron/types.ts'), 'utf8');
  const srcTypesTs = fs.readFileSync(path.resolve('src/types/index.ts'), 'utf8');

  // IPC channel names in main.ts
  assert.ok(mainTs.includes("'omp:grievances-list'"), 'main.ts must register omp:grievances-list');
  assert.ok(mainTs.includes("'omp:grievances-clean'"), 'main.ts must register omp:grievances-clean');
  assert.ok(mainTs.includes("'omp:grievances-push'"), 'main.ts must register omp:grievances-push');

  // Preload methods in preload.ts
  assert.ok(preloadTs.includes('listGrievances:'), 'preload.ts must expose listGrievances');
  assert.ok(preloadTs.includes('cleanGrievances:'), 'preload.ts must expose cleanGrievances');
  assert.ok(preloadTs.includes('pushGrievances:'), 'preload.ts must expose pushGrievances');

  // Type definitions
  for (const content of [electronTypesTs, srcTypesTs]) {
    assert.ok(content.includes('interface GrievanceItem'), 'Must export GrievanceItem');
    assert.ok(content.includes('interface GrievancesListOptions'), 'Must export GrievancesListOptions');
    assert.ok(content.includes('interface GrievancesListResponse'), 'Must export GrievancesListResponse');
    assert.ok(content.includes('interface GrievancesCleanOptions'), 'Must export GrievancesCleanOptions');
    assert.ok(content.includes('interface GrievancesCleanResponse'), 'Must export GrievancesCleanResponse');
    assert.ok(content.includes('interface GrievancesPushResponse'), 'Must export GrievancesPushResponse');
  }
});

// 7. Đồng bộ khóa i18n cho Grievances
test('Grievances i18n keys are synchronized between vi and en', () => {
  const grievancesKeys = Object.keys(vi).filter((k) => k.startsWith('ops.grievances.') || k === 'ops.tab.grievances');
  assert.ok(grievancesKeys.length >= 20, `Must have at least 20 grievances keys, got ${grievancesKeys.length}`);

  for (const key of grievancesKeys) {
    assert.ok(key in en, `Missing key "${key}" in en dictionary`);
    assert.ok(typeof vi[key] === 'string' && vi[key].length > 0, `Empty value for key "${key}" in vi`);
    assert.ok(typeof en[key] === 'string' && en[key].length > 0, `Empty value for key "${key}" in en`);
  }
});

console.log(`\n====================================================`);
console.log(`Grievances Verification: ${passCount} passed, 0 failed.`);
console.log(`====================================================\n`);
