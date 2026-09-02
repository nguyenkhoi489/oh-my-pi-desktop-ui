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
        brokerPid: 999,
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
    console.log(\`Successfully performed \${action} on \${name}\`);
    process.exit(0);
  } else if (action === 'logs') {
    const name = args[2];
    console.log(\`[log 1] \${name} starting\\n[log 2] \${name} ready\`);
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
    console.log(\`Cleared worktrees (all=\${isAll})\`);
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
  await asyncTest('controlProcess executes action on target daemon', async () => {
    const res = await manager.controlProcess(mockOpsScript, 'stop', 'dev-server');
    assert.strictEqual(res.success, true);
    assert(res.message?.includes('stop on dev-server'));
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
    const res = await manager.getProcessLogs(mockOpsScript, 'dev-server');
    assert.strictEqual(res.success, true);
    assert(res.logs?.includes('dev-server starting'));
    assert(res.logs?.includes('dev-server ready'));
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
  assert(preloadSource.includes('omp:ps-logs'), 'preload.ts must invoke omp:ps-logs');
  assert(preloadSource.includes('omp:worktree-list'), 'preload.ts must invoke omp:worktree-list');
  assert(preloadSource.includes('omp:worktree-clear'), 'preload.ts must invoke omp:worktree-clear');

  const mainSource = fs.readFileSync(path.resolve('electron/main.ts'), 'utf8');
  assert(mainSource.includes('omp:ps-list'), 'main.ts must handle omp:ps-list');
  assert(mainSource.includes('omp:ps-control'), 'main.ts must handle omp:ps-control');
  assert(mainSource.includes('omp:ps-logs'), 'main.ts must handle omp:ps-logs');
  assert(mainSource.includes('omp:worktree-list'), 'main.ts must handle omp:worktree-list');
  assert(mainSource.includes('omp:worktree-clear'), 'main.ts must handle omp:worktree-clear');
});

console.log(`\nAll ${passCount} tests passed successfully!`);
