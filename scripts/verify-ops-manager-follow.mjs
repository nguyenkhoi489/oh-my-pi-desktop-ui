import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { OpsManager, ProcessLogFollower } from '../electron/ops-manager.ts';

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ ${name}:`, err);
    process.exit(1);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ ${name}:`, err);
    process.exit(1);
  }
}

console.log('=== Running verify-ops-manager-follow.mjs ===');

const tmpDir = path.join(os.tmpdir(), `omp-test-ops-follow-${Date.now()}`);
fs.mkdirSync(tmpDir, { recursive: true });

try {
  const mockFollowScript = path.join(tmpDir, 'mock-ops-follow.cjs');
  fs.writeFileSync(
    mockFollowScript,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
const sub = args[0];

if (sub === 'ps') {
  const action = args[1];
  if (action === 'logs') {
    const name = args[2];
    const isFollow = args.includes('--follow');
    const isHead = args.includes('--head');
    const linesArg = args.find(a => a.startsWith('--lines='));
    const grepArg = args.find(a => a.startsWith('--grep='));
    const globalArg = args.find(a => a.startsWith('--global='));

    // Emit initial lines
    console.log(\`[INIT] daemon=\${name} follow=\${isFollow} head=\${isHead} lines=\${linesArg} grep=\${grepArg} global=\${globalArg}\`);

    if (isFollow) {
      let count = 1;
      console.log(\`[STREAM 0] first immediate tick from \${name}\`);
      const interval = setInterval(() => {
        console.log(\`[STREAM \${count}] tick from \${name}\`);
        count++;
        if (count > 20) {
          clearInterval(interval);
        }
      }, 30);

      process.on('SIGTERM', () => {
        clearInterval(interval);
        process.exit(0);
      });
      process.on('SIGINT', () => {
        clearInterval(interval);
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  }
}
`,
    { mode: 0o755 }
  );

  // Test 1: ProcessLogFollower stream receiving & flags forwarding
  await asyncTest('ProcessLogFollower spawns process and receives continuous lines', async () => {
    const follower = new ProcessLogFollower();
    const lines = [];

    const startRes = follower.start(
      mockFollowScript,
      'web-daemon',
      { lines: 50, head: true, grep: 'tick', global: 'browser-relay' },
      (line) => {
        lines.push(line);
      }
    );

    if (!startRes.success) {
      console.error('startRes failed:', startRes.error);
    }

    // Đợi 250ms để nhận các dòng stream
    // Đợi 400ms để nhận các dòng stream
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert(lines[0].includes('daemon=web-daemon'), 'Init header must contain daemon name');
    assert(lines[0].includes('follow=true'), 'Init header must contain follow=true');
    assert(lines[0].includes('head=true'), 'Init header must contain head=true');
    assert(lines[0].includes('--lines=50'), 'Init header must contain lines=50');
    assert(lines[0].includes('--grep=tick'), 'Init header must contain grep=tick');
    assert(lines[0].includes('--global=browser-relay'), 'Init header must contain global=browser-relay');

    follower.stop();
    assert.strictEqual(follower.isRunning(), false);
    assert.strictEqual(follower.currentProcessName, null);
  });

  // Test 2: Starting a new follow stops the previous follower
  await asyncTest('Starting a new follow stops existing follower immediately', async () => {
    const follower = new ProcessLogFollower();
    const lines1 = [];
    const lines2 = [];

    follower.start(mockFollowScript, 'daemon-1', {}, (l) => lines1.push(l));
    assert.strictEqual(follower.currentProcessName, 'daemon-1');

    await new Promise((resolve) => setTimeout(resolve, 300));
    const countBeforeSwitch = lines1.length;
    assert(countBeforeSwitch >= 1, 'daemon-1 must receive lines');

    // Start daemon-2
    follower.start(mockFollowScript, 'daemon-2', {}, (l) => lines2.push(l));
    assert.strictEqual(follower.currentProcessName, 'daemon-2');

    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.strictEqual(lines1.length, countBeforeSwitch, 'daemon-1 should not receive any new lines after stop');
    assert(lines2.length >= 1, 'daemon-2 must receive lines');

    follower.stop();
  });

  // Test 3: OpsManager wrapper methods
  await asyncTest('OpsManager startLogFollow, stopLogFollow, dispose lifecycle', async () => {
    const manager = new OpsManager();
    const lines = [];

    const res = manager.startLogFollow(mockFollowScript, 'test-app', {}, (l) => lines.push(l));
    assert.strictEqual(res.success, true);
    assert.strictEqual(manager.getLogFollower().isRunning(), true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert(lines.length >= 1);
    manager.dispose();
    assert.strictEqual(manager.getLogFollower().isRunning(), false);
  });

  // Test 4: Validation on empty process name
  await asyncTest('ProcessLogFollower rejects empty name', async () => {
    const follower = new ProcessLogFollower();
    const res = follower.start(mockFollowScript, '   ', {}, () => {});
    assert.strictEqual(res.success, false);
    assert(res.error?.includes('không được để trống'));
  });

} finally {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}

// Test 5: Contract verification for IPC channels & Preload methods
test('Preload & Main IPC contracts for follow logs & disposeAll are present', () => {
  const preloadSource = fs.readFileSync(path.resolve('electron/preload.ts'), 'utf8');
  assert(preloadSource.includes('omp:ps-logs-follow-start'), 'preload.ts must invoke omp:ps-logs-follow-start');
  assert(preloadSource.includes('omp:ps-logs-follow-stop'), 'preload.ts must invoke omp:ps-logs-follow-stop');
  assert(preloadSource.includes('omp:ps-log-line'), 'preload.ts must listen to omp:ps-log-line');
  assert(preloadSource.includes('startProcessLogFollow'), 'preload.ts must expose startProcessLogFollow');
  assert(preloadSource.includes('stopProcessLogFollow'), 'preload.ts must expose stopProcessLogFollow');
  assert(preloadSource.includes('onPsLogLine'), 'preload.ts must expose onPsLogLine');

  const mainSource = fs.readFileSync(path.resolve('electron/main.ts'), 'utf8');
  assert(mainSource.includes('omp:ps-logs-follow-start'), 'main.ts must handle omp:ps-logs-follow-start');
  assert(mainSource.includes('omp:ps-logs-follow-stop'), 'main.ts must handle omp:ps-logs-follow-stop');
  assert(mainSource.includes('omp:ps-log-line'), 'main.ts must send omp:ps-log-line');
  assert(mainSource.includes('disposeAll'), 'main.ts must define disposeAll');
  assert(mainSource.includes("app.on('before-quit'"), 'main.ts must register before-quit handler');

  const processesTabSource = fs.readFileSync(path.resolve('src/components/Modals/ops/ProcessesTab.tsx'), 'utf8');
  assert(processesTabSource.includes('startProcessLogFollow'), 'ProcessesTab.tsx must call startProcessLogFollow');
  assert(processesTabSource.includes('stopProcessLogFollow'), 'ProcessesTab.tsx must call stopProcessLogFollow');
  assert(processesTabSource.includes('onPsLogLine'), 'ProcessesTab.tsx must call onPsLogLine');
  assert(processesTabSource.includes('getProcessInfo'), 'ProcessesTab.tsx must call getProcessInfo');
  assert(processesTabSource.includes('MAX_LOG_BUFFER_LINES'), 'ProcessesTab.tsx must enforce log buffer cap');
});

console.log(`\nAll ${passCount} tests passed successfully!`);
