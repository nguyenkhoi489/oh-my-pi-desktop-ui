import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  parseUpdateCheckOutput,
  parseTinyModelsOutput,
  EngineMaintenanceManager,
} from '../electron/engine-maintenance.ts';

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passCount++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

console.log('=== Running verify-engine-maintenance.mjs ===');

const tmpDir = path.join(os.tmpdir(), `omp-test-maintenance-${Date.now()}`);
fs.mkdirSync(tmpDir, { recursive: true });

try {
  // Test 1: parseUpdateCheckOutput with "Already up to date"
  test('parseUpdateCheckOutput parses already up-to-date correctly', () => {
    const fixture = 'Current version: 18.1.2\n✔ Already up to date\n';
    const res = parseUpdateCheckOutput(fixture);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentVersion, '18.1.2');
    assert.strictEqual(res.hasUpdate, false);
    assert.strictEqual(res.latestVersion, '18.1.2');
  });

  // Test 2: parseUpdateCheckOutput with update available
  test('parseUpdateCheckOutput parses update available with new version', () => {
    const fixture = 'Current version: 18.1.2\nUpdate available: 18.1.2 → 18.2.0\nRun omp update to install.\n';
    const res = parseUpdateCheckOutput(fixture);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentVersion, '18.1.2');
    assert.strictEqual(res.hasUpdate, true);
    assert.strictEqual(res.latestVersion, '18.2.0');
  });

  // Test 3: parseTinyModelsOutput
  test('parseTinyModelsOutput parses models list correctly', () => {
    const fixture = `Tiny local models
lfm2-350m
  LFM2 350M — Recommended local model; best speed/quality balance, about 212 MB cached.
lfm2-700m default
  LFM2 700M — Highest-quality local option; larger and slower than LFM2 350M.
qwen3-0.6b
  Qwen3 0.6B — Most robust local option; slower first load, about 500 MB cached.`;

    const items = parseTinyModelsOutput(fixture);
    assert.strictEqual(items.length, 3);
    assert.strictEqual(items[0].key, 'lfm2-350m');
    assert.strictEqual(items[0].isDefault, false);
    assert(items[0].description.includes('LFM2 350M'));

    assert.strictEqual(items[1].key, 'lfm2-700m');
    assert.strictEqual(items[1].isDefault, true);

    assert.strictEqual(items[2].key, 'qwen3-0.6b');
  });

  // Test 4: EngineMaintenanceManager single slot execution & streaming
  await asyncTest('EngineMaintenanceManager streams stdout and enforces 1-slot lock', async () => {
    const mockScriptPath = path.join(tmpDir, 'mock-omp.cjs');
    fs.writeFileSync(
      mockScriptPath,
      `console.log("step 1 starting");
setTimeout(() => {
  console.log("step 2 finished");
  process.exit(0);
}, 100);
`
    );

    const manager = new EngineMaintenanceManager();
    const emittedEvents = [];
    const mockWindow = {
      isDestroyed: () => false,
      webContents: {
        send: (channel, data) => {
          emittedEvents.push({ channel, data });
        },
      },
    };

    const startRes1 = manager.startTask('test-task', process.execPath, [mockScriptPath], mockWindow);
    assert.strictEqual(startRes1.success, true, 'Task 1 should start');

    // Attempt starting second task concurrently -> must fail
    const startRes2 = manager.startTask('second-task', process.execPath, [mockScriptPath], mockWindow);
    assert.strictEqual(startRes2.success, false, 'Second task should be rejected');
    assert(startRes2.error, 'Should provide error message for busy task');

    // Wait for task 1 to finish
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify emitted stream events
    const stdoutEvents = emittedEvents.filter((e) => e.data.type === 'stdout');
    assert(stdoutEvents.length >= 1, 'Should have received stdout events');
    const combinedStdout = stdoutEvents.map((e) => e.data.text).join('');
    assert(combinedStdout.includes('step 1 starting'));
    assert(combinedStdout.includes('step 2 finished'));

    const doneEvent = emittedEvents.find((e) => e.data.type === 'status' && e.data.status === 'done');
    assert(doneEvent, 'Must emit status: done event at process completion');
    assert.strictEqual(doneEvent.data.exitCode, 0);

    manager.dispose();
  });

  // Test 5: EngineMaintenanceManager cancellation
  await asyncTest('EngineMaintenanceManager cancelTask kills running process', async () => {
    const mockScriptPath = path.join(tmpDir, 'mock-long.cjs');
    fs.writeFileSync(
      mockScriptPath,
      `console.log("started long task");
setInterval(() => {}, 1000);
`
    );

    const manager = new EngineMaintenanceManager();
    const emittedEvents = [];
    const mockWindow = {
      isDestroyed: () => false,
      webContents: {
        send: (channel, data) => emittedEvents.push({ channel, data }),
      },
    };

    manager.startTask('long-task', process.execPath, [mockScriptPath], mockWindow);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const cancelRes = manager.cancelTask();
    assert.strictEqual(cancelRes.success, true);

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Next task can start after cancel
    const mockQuickScript = path.join(tmpDir, 'mock-quick.cjs');
    fs.writeFileSync(mockQuickScript, 'console.log("quick"); process.exit(0);\n');
    const nextRes = manager.startTask('next-task', process.execPath, [mockQuickScript], mockWindow);
    assert.strictEqual(nextRes.success, true, 'Next task should start cleanly after cancel');

    await new Promise((resolve) => setTimeout(resolve, 300));
    manager.dispose();
  });

  // Test 6: Live binary sanity check if available
  await asyncTest('EngineMaintenanceManager checkUpdate against host binary', async () => {
    const manager = new EngineMaintenanceManager();
    const res = await manager.checkUpdate('omp');
    assert(typeof res.currentVersion === 'string', 'Should return currentVersion');
    assert(typeof res.hasUpdate === 'boolean', 'Should return hasUpdate');
  });

} finally {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}

console.log(`\nAll ${passCount} tests passed successfully!`);
