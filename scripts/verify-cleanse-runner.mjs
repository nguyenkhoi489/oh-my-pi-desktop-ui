/**
 * Verification Suite: Cleanse Runner (Phase 15)
 */

import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  buildCleanseArgs,
  stripAnsi,
} from '../src/utils/cleanseArgs.ts';
import { CleanseRunnerManager } from '../electron/cleanse-runner.ts';
import { vi } from '../shared/i18n/vi.ts';
import { en } from '../shared/i18n/en.ts';

let passCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passCount++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passCount++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('=== Running verify-cleanse-runner.mjs ===\n');

try {
  // Test 1: buildCleanseArgs với các cờ và tùy chọn
  test('buildCleanseArgs constructs correct argv for all option combinations', () => {
    // Không truyền opts -> mặc định bật --all
    assert.deepStrictEqual(buildCleanseArgs(), ['cleanse', '--all']);
    assert.deepStrictEqual(buildCleanseArgs({}), ['cleanse', '--all']);

    // Chỉ truyền request
    assert.deepStrictEqual(buildCleanseArgs({ request: 'ts errors' }), [
      'cleanse',
      'ts errors',
    ]);

    // Request rỗng -> tự động fallback --all
    assert.deepStrictEqual(buildCleanseArgs({ request: '   ' }), [
      'cleanse',
      '--all',
    ]);

    // Số agent -n
    assert.deepStrictEqual(buildCleanseArgs({ request: 'lint', agents: 4 }), [
      'cleanse',
      'lint',
      '-n',
      '4',
    ]);

    // Model -m
    assert.deepStrictEqual(
      buildCleanseArgs({ request: 'ts errors', model: 'claude-3-5-sonnet' }),
      ['cleanse', 'ts errors', '-m', 'claude-3-5-sonnet']
    );

    // Tests -t
    assert.deepStrictEqual(
      buildCleanseArgs({ request: 'ts errors', tests: true }),
      ['cleanse', 'ts errors', '-t']
    );

    // All cờ kết hợp
    assert.deepStrictEqual(
      buildCleanseArgs({
        request: 'ts errors',
        agents: 8,
        model: 'opus',
        tests: true,
        all: true,
      }),
      ['cleanse', 'ts errors', '-n', '8', '-m', 'opus', '-t', '--all']
    );

    // Khi không có request nhưng có all và agents
    assert.deepStrictEqual(
      buildCleanseArgs({
        agents: 2,
        all: true,
      }),
      ['cleanse', '-n', '2', '--all']
    );
  });

  // Test 2: stripAnsi loại bỏ màu và ký tự điều khiển ANSI
  test('stripAnsi removes 8-bit, 24-bit color codes and terminal escapes', () => {
    assert.strictEqual(stripAnsi(''), '');
    const ansiText = '\u001b[32m✓ TypeScript (.) clean\u001b[39m \u001b[2m· 5.0s\u001b[22m';
    assert.strictEqual(stripAnsi(ansiText), '✓ TypeScript (.) clean · 5.0s');
    const complexAnsi = '\u001b[1;31;40mError:\u001b[0m \u001b[33mWarning\u001b[0m';
    assert.strictEqual(stripAnsi(complexAnsi), 'Error: Warning');
  });

  // Test 3: CleanseRunnerManager instance lifecycle, start & cancel
  await asyncTest('CleanseRunnerManager manages task lifecycle and cancellation', async () => {
    const manager = new CleanseRunnerManager();
    assert.strictEqual(manager.isRunning, false);
    assert.strictEqual(manager.currentTaskId, null);

    const mockWindow = {
      isDestroyed: () => false,
      webContents: {
        send: (_channel, _data) => {},
      },
    };

    // Chạy tiến trình ngủ 5 giây để kiểm tra cancel
    const res = await manager.runCleanse(
      'sleep',
      { request: '5' },
      mockWindow
    );

    assert.strictEqual(res.success, true);
    assert.strictEqual(manager.isRunning, true);
    assert.strictEqual(manager.currentTaskId, 'cleanse-task');

    // Chạy tiếp khi đang bận -> báo lỗi
    const busyRes = await manager.runCleanse(
      'sleep',
      { request: '1' },
      mockWindow
    );
    assert.strictEqual(busyRes.success, false);
    assert.ok(busyRes.error?.includes('Đang có một tác vụ cleanse khác đang chạy'));

    // Huỷ tác vụ
    const cancelRes = manager.cancelCleanse();
    assert.strictEqual(cancelRes.success, true);

    // Chờ tiến trình thoát
    await new Promise((r) => setTimeout(r, 200));
    assert.strictEqual(manager.isRunning, false);

    manager.dispose();
  });

  // Test 4: Preload & Main IPC contract check
  test('Preload and Main IPC contract coverage for Cleanse Runner', () => {
    const preloadSource = fs.readFileSync(
      path.join(process.cwd(), 'electron/preload.ts'),
      'utf-8'
    );
    const mainSource = fs.readFileSync(
      path.join(process.cwd(), 'electron/main.ts'),
      'utf-8'
    );
    const typesSource = fs.readFileSync(
      path.join(process.cwd(), 'electron/types.ts'),
      'utf-8'
    );
    const srcTypesSource = fs.readFileSync(
      path.join(process.cwd(), 'src/types/index.ts'),
      'utf-8'
    );

    // Channels
    assert.ok(
      preloadSource.includes("'omp:cleanse-run'"),
      'preload.ts must invoke omp:cleanse-run'
    );
    assert.ok(
      preloadSource.includes("'omp:cleanse-cancel'"),
      'preload.ts must invoke omp:cleanse-cancel'
    );
    assert.ok(
      preloadSource.includes("'omp:cleanse-output'"),
      'preload.ts must listen to omp:cleanse-output'
    );

    assert.ok(
      mainSource.includes("'omp:cleanse-run'"),
      'main.ts must handle omp:cleanse-run'
    );
    assert.ok(
      mainSource.includes("'omp:cleanse-cancel'"),
      'main.ts must handle omp:cleanse-cancel'
    );

    // Exposed API methods
    assert.ok(preloadSource.includes('runCleanse:'), 'preload must expose runCleanse');
    assert.ok(preloadSource.includes('cancelCleanse:'), 'preload must expose cancelCleanse');
    assert.ok(preloadSource.includes('onCleanseOutput:'), 'preload must expose onCleanseOutput');

    // Types
    assert.ok(typesSource.includes('interface CleanseRunOptions'), 'electron/types.ts must export CleanseRunOptions');
    assert.ok(typesSource.includes('runCleanse: (options: CleanseRunOptions)'), 'electron/types.ts must declare runCleanse');
    assert.ok(typesSource.includes('cancelCleanse: () => Promise<{ success: boolean }>'), 'electron/types.ts must declare cancelCleanse');
    assert.ok(typesSource.includes('onCleanseOutput: (callback: (event: TaskOutputEvent) => void) => () => void'), 'electron/types.ts must declare onCleanseOutput');

    assert.ok(srcTypesSource.includes('interface CleanseRunOptions'), 'src/types/index.ts must export CleanseRunOptions');
    assert.ok(srcTypesSource.includes('runCleanse?: (options: CleanseRunOptions)'), 'src/types/index.ts must declare runCleanse');
    assert.ok(srcTypesSource.includes('cancelCleanse?: () => Promise<{ success: boolean }>'), 'src/types/index.ts must declare cancelCleanse');
    assert.ok(srcTypesSource.includes('onCleanseOutput?: (callback: (event: TaskOutputEvent) => void) => () => void'), 'src/types/index.ts must declare onCleanseOutput');
  });

  // Test 5: UI Components and Hook Integration
  test('UI components and hook integration for Cleanse Runner', () => {
    const engineTabSource = fs.readFileSync(
      path.join(process.cwd(), 'src/components/Modals/ops/EngineTab.tsx'),
      'utf-8'
    );
    const opsModalSource = fs.readFileSync(
      path.join(process.cwd(), 'src/components/Modals/OpsModal.tsx'),
      'utf-8'
    );
    const appSource = fs.readFileSync(
      path.join(process.cwd(), 'src/App.tsx'),
      'utf-8'
    );
    const hookSource = fs.readFileSync(
      path.join(process.cwd(), 'src/hooks/useOmpRpc.ts'),
      'utf-8'
    );

    assert.ok(engineTabSource.includes('runCleanse'), 'EngineTab must call runCleanse');
    assert.ok(engineTabSource.includes('cancelCleanse'), 'EngineTab must call cancelCleanse');
    assert.ok(engineTabSource.includes('onCleanseOutput'), 'EngineTab must subscribe to onCleanseOutput');
    assert.ok(engineTabSource.includes('cleanseStreamingWarning'), 'EngineTab must display streaming warning');
    assert.ok(engineTabSource.includes('cleanseWorkspaceWarning'), 'EngineTab must display workspace modification warning');
    assert.ok(engineTabSource.includes('onOpenCommitModal'), 'EngineTab must support commit modal shortcut');

    assert.ok(opsModalSource.includes('onOpenCommitModal'), 'OpsModal must accept and pass onOpenCommitModal');
    assert.ok(opsModalSource.includes("isEngineRunning={status === 'streaming'}"), 'OpsModal must pass streaming status to EngineTab');
    assert.ok(appSource.includes('onOpenCommitModal={() => {'), 'App.tsx must pass onOpenCommitModal to OpsModal');

    assert.ok(hookSource.includes('runCleanse,'), 'useOmpRpc must export runCleanse');
    assert.ok(hookSource.includes('cancelCleanse,'), 'useOmpRpc must export cancelCleanse');
  });

  // Test 6: i18n keys parity
  test('i18n keys for Cleanse Runner exist in both vi and en', () => {
    const requiredKeys = [
      'ops.engine.cleanseTitle',
      'ops.engine.cleanseDesc',
      'ops.engine.cleanseRequest',
      'ops.engine.cleanseRequestPlaceholder',
      'ops.engine.cleanseAgents',
      'ops.engine.cleanseModel',
      'ops.engine.cleanseModelPlaceholder',
      'ops.engine.cleanseTestsToggle',
      'ops.engine.cleanseAllToggle',
      'ops.engine.cleanseRun',
      'ops.engine.cleanseRunning',
      'ops.engine.cleanseCancel',
      'ops.engine.cleanseStreamingWarning',
      'ops.engine.cleanseWorkspaceWarning',
      'ops.engine.cleanseCommitFirst',
      'ops.engine.cleanseClearLog',
    ];

    for (const key of requiredKeys) {
      assert.ok(key in vi, `Missing vi key: ${key}`);
      assert.ok(key in en, `Missing en key: ${key}`);
      assert.ok(typeof vi[key] === 'string' && vi[key].length > 0, `Empty vi key: ${key}`);
      assert.ok(typeof en[key] === 'string' && en[key].length > 0, `Empty en key: ${key}`);
    }
  });

  console.log(`\nAll ${passCount} tests passed successfully!`);
} catch (err) {
  console.error('Test suite failed:', err);
  process.exit(1);
}
