import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { OpsManager } from '../electron/ops-manager.ts';

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

console.log('=== Running verify-ops-manager.mjs ===');

const tmpDir = path.join(os.tmpdir(), `omp-test-ops-${Date.now()}`);
fs.mkdirSync(tmpDir, { recursive: true });

try {
  const mockOpsScript = path.join(tmpDir, 'mock-ops.cjs');
  fs.writeFileSync(
    mockOpsScript,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
const sub = args[0];

if (sub === 'ps') {
  const action = args[1];
  if (action === 'list') {
    const payload = [
      {
        kind: 'project',
        projectDir: '/mock/project',
        brokerPid: 987654,
        daemons: [
          {
            name: 'dev-server',
            state: 'running',
            command: 'bun run dev',
            outputBytes: 1024,
          }
        ]
      },
      {
        kind: 'global',
        service: 'browser-relay',
        runtimeDir: process.env.MOCK_OPS_RUNTIME_DIR || undefined,
        daemons: [
          {
            name: 'omp.browser.relay',
            state: 'exited',
            exitCode: 0,
            command: 'omp browser-relay',
          }
        ]
      }
    ];
    console.log(JSON.stringify(payload));
    process.exit(0);
  } else if (action === 'stop' || action === 'kill' || action === 'restart') {
    const name = args[2];
    if (name === 'error-target') {
      console.error('Error: daemon not found');
      process.exit(1);
    }
    const dirArg = args.find(a => a.startsWith('--dir='));
    console.log('Successfully performed ' + action + ' on ' + name + (dirArg ? (' with ' + dirArg) : ''));
    process.exit(0);
  } else if (action === 'logs') {
    const name = args[2];
    const dirArg = args.find(a => a.startsWith('--dir='));
    console.log('[log 1] ' + name + ' starting\\n[log 2] ' + name + ' ready' + (dirArg ? (' ' + dirArg) : ''));
    process.exit(0);
  } else if (action === 'info') {
    const name = args[2];
    if (name === 'error-target') {
      console.error('Error: daemon not found');
      process.exit(1);
    }
    const dirArg = args.find(a => a.startsWith('--dir='));
    const payload = {
      name: name,
      id: 'mock-uuid-1234',
      state: 'running',
      command: 'bun run dev' + (dirArg ? (' ' + dirArg) : ''),
      spec: {
        name: name,
        application: 'bun',
        args: ['run', 'dev'],
        cwd: '/mock/project',
        pty: false,
      }
    };
    console.log(JSON.stringify(payload));
    process.exit(0);
  }
} else if (sub === 'worktree') {
  const action = args[1];
  if (action === 'list') {
    const payload = [
      {
        path: '/mock/.omp/wt/branch-1',
        branch: 'feature-1',
        isDirty: false,
      },
      {
        path: '/mock/.omp/wt/branch-2',
        branch: 'feature-2',
        isDirty: true,
      }
    ];
    console.log(JSON.stringify(payload));
    process.exit(0);
  } else if (action === 'clear') {
    const isAll = args.includes('--all');
    console.log('Cleared worktrees (all=' + isAll + ')');
    process.exit(0);
  }
}
process.exit(0);
`,
    { mode: 0o755 }
  );

  const manager = new OpsManager();

  // Test 1: listProcesses
  await asyncTest('listProcesses parses scopes and daemons list correctly', async () => {
    const res = await manager.listProcesses(mockOpsScript, { all: true });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.scopes?.length, 2);
    assert.strictEqual(res.scopes[0].kind, 'project');
    assert.strictEqual(res.scopes[0].daemons[0].name, 'dev-server');
    assert.strictEqual(res.scopes[0].daemons[0].state, 'running');
    assert.strictEqual(res.scopes[1].kind, 'global');
    assert.strictEqual(res.scopes[1].daemons[0].name, 'omp.browser.relay');
  });

  // Test 2: controlProcess success
  await asyncTest('controlProcess executes action on target daemon with dir support', async () => {
    const res = await manager.controlProcess(mockOpsScript, 'stop', 'dev-server', { dir: '/mock/project' });
    assert.strictEqual(res.success, true);
    assert(res.message?.includes('stop on dev-server'));
    assert(res.message?.includes('--dir=/mock/project'));
  });

  // Test 3: controlProcess error handling
  await asyncTest('controlProcess handles non-existent daemon error', async () => {
    const res = await manager.controlProcess(mockOpsScript, 'kill', 'error-target');
    assert.strictEqual(res.success, false);
    assert(res.error?.includes('daemon not found') || res.error?.includes('Lỗi'));
  });

  // Test 4: controlProcess validation
  await asyncTest('controlProcess rejects empty daemon name', async () => {
    const res = await manager.controlProcess(mockOpsScript, 'stop', '');
    assert.strictEqual(res.success, false);
    assert(res.error?.includes('không được để trống'));
  });

  // Test 5: getProcessLogs
  await asyncTest('getProcessLogs fetches daemon logs', async () => {
    const res = await manager.getProcessLogs(mockOpsScript, 'dev-server', { dir: '/mock/project' });
    assert.strictEqual(res.success, true);
    assert(res.logs?.includes('dev-server starting'));
    assert(res.logs?.includes('--dir=/mock/project'));
  });
  // Test 5b: info
  await asyncTest('info fetches daemon specification and status detail', async () => {
    const res = await manager.info(mockOpsScript, 'dev-server', { dir: '/mock/project' });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.daemon?.name, 'dev-server');
    assert(res.daemon?.command?.includes('--dir=/mock/project'));
    assert.strictEqual(res.daemon?.id, 'mock-uuid-1234');
  });

  // Test 5c: info error handling
  await asyncTest('info handles non-existent daemon error', async () => {
    const res = await manager.info(mockOpsScript, 'error-target');
    assert.strictEqual(res.success, false);
    assert(res.error?.includes('daemon not found') || res.error?.includes('Lỗi'));
  });

  // Test 6: listWorktrees
  await asyncTest('listWorktrees parses worktree list', async () => {
    const res = await manager.listWorktrees(mockOpsScript);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.worktrees?.length, 2);
    assert.strictEqual(res.worktrees[0].branch, 'feature-1');
    assert.strictEqual(res.worktrees[1].isDirty, true);
  });

  // Test 7: clearWorktrees
  await asyncTest('clearWorktrees executes clear command', async () => {
    const res = await manager.clearWorktrees(mockOpsScript, { all: true });
    assert.strictEqual(res.success, true);
    assert(res.rawOutput?.includes('all=true'));
  });
  // Test 7b: removeProcess kills running process if needed and cleans record with stubbed broker signaling
  await asyncTest('removeProcess kills running daemon and cleans record', async () => {
    const signaled = [];
    manager.setSignalProcessForTest((pid, signal) => {
      signaled.push({ pid, signal });
    });
    const res = await manager.removeProcess(mockOpsScript, 'dev-server', { dir: '/mock/project' });
    assert.strictEqual(res.success, true);
    assert(signaled.length > 0, 'Broker should be signaled when last daemon is removed');
    assert.strictEqual(signaled[0].pid, 987654);
    assert.strictEqual(signaled[0].signal, 'SIGTERM');
  });

  // Test 7c: removeProcess removes dead daemon record folder under runtimeDir
  await asyncTest('removeProcess removes dead daemon record file', async () => {
    const mockRuntimeDir = path.join(tmpDir, 'mock-scope');
    const fakeDaemonDir = path.join(mockRuntimeDir, 'daemons', 'omp.browser.relay');
    fs.mkdirSync(fakeDaemonDir, { recursive: true });
    fs.writeFileSync(path.join(fakeDaemonDir, 'meta.json'), JSON.stringify({ name: 'omp.browser.relay', state: 'exited' }));
    fs.writeFileSync(path.join(fakeDaemonDir, 'output.log'), 'Process exited\n');

    process.env.MOCK_OPS_RUNTIME_DIR = mockRuntimeDir;
    try {
      const res = await manager.removeProcess(mockOpsScript, 'omp.browser.relay', { global: 'browser-relay' });
      assert.strictEqual(res.success, true);
      assert(!fs.existsSync(fakeDaemonDir), 'Daemon directory should be deleted');
    } finally {
      delete process.env.MOCK_OPS_RUNTIME_DIR;
    }
  });

} finally {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}

// Test 8: Preload & Main contract inspection
test('Preload & Main IPC contracts for ps & worktrees are properly wired', () => {
  const preloadSource = fs.readFileSync(path.resolve('electron/preload.ts'), 'utf8');
  assert(preloadSource.includes('omp:ps-list'), 'preload.ts must invoke omp:ps-list');
  assert(preloadSource.includes('omp:ps-control'), 'preload.ts must invoke omp:ps-control');
  assert(preloadSource.includes('omp:ps-remove'), 'preload.ts must invoke omp:ps-remove');
  assert(preloadSource.includes('omp:ps-logs'), 'preload.ts must invoke omp:ps-logs');
  assert(preloadSource.includes('omp:worktree-list'), 'preload.ts must invoke omp:worktree-list');
  assert(preloadSource.includes('omp:worktree-clear'), 'preload.ts must invoke omp:worktree-clear');

  assert(preloadSource.includes('omp:ps-info'), 'preload.ts must invoke omp:ps-info');
  assert(preloadSource.includes('omp:ps-logs-follow-start'), 'preload.ts must invoke omp:ps-logs-follow-start');
  assert(preloadSource.includes('omp:ps-logs-follow-stop'), 'preload.ts must invoke omp:ps-logs-follow-stop');
  assert(preloadSource.includes('omp:ps-log-line'), 'preload.ts must listen to omp:ps-log-line');
  assert(preloadSource.includes('getProcessInfo'), 'preload.ts must expose getProcessInfo');
  assert(preloadSource.includes('removeProcess'), 'preload.ts must expose removeProcess');
  assert(preloadSource.includes('startProcessLogFollow'), 'preload.ts must expose startProcessLogFollow');
  assert(preloadSource.includes('stopProcessLogFollow'), 'preload.ts must expose stopProcessLogFollow');
  assert(preloadSource.includes('onPsLogLine'), 'preload.ts must expose onPsLogLine');

  const mainSource = fs.readFileSync(path.resolve('electron/main.ts'), 'utf8');
  assert(mainSource.includes('omp:ps-list'), 'main.ts must handle omp:ps-list');
  assert(mainSource.includes('omp:ps-control'), 'main.ts must handle omp:ps-control');
  assert(mainSource.includes('omp:ps-remove'), 'main.ts must handle omp:ps-remove');
  assert(mainSource.includes('omp:ps-logs'), 'main.ts must handle omp:ps-logs');
  assert(mainSource.includes('omp:ps-info'), 'main.ts must handle omp:ps-info');
  assert(mainSource.includes('omp:ps-logs-follow-start'), 'main.ts must handle omp:ps-logs-follow-start');
  assert(mainSource.includes('omp:ps-logs-follow-stop'), 'main.ts must handle omp:ps-logs-follow-stop');
  assert(mainSource.includes('disposeAll'), 'main.ts must define disposeAll');
  assert(mainSource.includes("app.on('before-quit'"), 'main.ts must listen to before-quit');
  assert(mainSource.includes('omp:worktree-list'), 'main.ts must handle omp:worktree-list');
  assert(mainSource.includes('omp:worktree-clear'), 'main.ts must handle omp:worktree-clear');
});

console.log(`\nAll ${passCount} tests passed successfully!`);
