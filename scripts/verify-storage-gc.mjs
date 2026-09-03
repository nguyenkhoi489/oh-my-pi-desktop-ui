/**
 * Verification Suite: Storage GC (Phase 10)
 */

import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { buildGcArgs, runGc } from '../electron/storage-gc.ts';
import { OmpBridge } from '../electron/omp-bridge.ts';

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

console.log('=== Running verify-storage-gc.mjs ===');

const tmpDir = path.join(os.tmpdir(), `omp-test-gc-${Date.now()}`);
fs.mkdirSync(tmpDir, { recursive: true });

try {
  // Test 1: buildGcArgs default behavior
  test('buildGcArgs builds baseline args with default agent-dir', () => {
    const args = buildGcArgs();
    assert.strictEqual(args[0], 'gc');
    assert.strictEqual(args[1], '--json');
    assert.ok(args.some((a) => a.startsWith('--agent-dir=')), 'Must contain --agent-dir');
    assert.ok(!args.includes('--apply'), 'Must not contain --apply by default');
    assert.ok(!args.includes('--blobs'), 'Must not contain --blobs when false');
  });

  // Test 2: buildGcArgs with all options enabled
  test('buildGcArgs includes all flags when specified', () => {
    const args = buildGcArgs({
      apply: true,
      blobs: true,
      archive: true,
      wal: true,
      coldArchiveAfterDays: 14,
      retainNewestGlobal: 25,
      retainNewestPerCwd: 5,
      profile: 'test-profile',
    });

    assert.ok(args.includes('--apply'), 'Must include --apply');
    assert.ok(args.includes('--blobs'), 'Must include --blobs');
    assert.ok(args.includes('--archive'), 'Must include --archive');
    assert.ok(args.includes('--wal'), 'Must include --wal');
    assert.ok(args.includes('--cold-archive-after-days=14'), 'Must include --cold-archive-after-days');
    assert.ok(args.includes('--retain-newest-global=25'), 'Must include --retain-newest-global');
    assert.ok(args.includes('--retain-newest-per-cwd=5'), 'Must include --retain-newest-per-cwd');
    assert.ok(args.some((a) => a.includes('test-profile')), 'agent-dir must contain profile name');
  });

  // Test 3: OmpBridge getStatus and isStreaming helpers
  test('OmpBridge exposes getStatus and isStreaming', () => {
    // Check method existence on OmpBridge prototype
    assert.strictEqual(typeof OmpBridge.prototype.getStatus, 'function', 'getStatus must be a function');
    assert.strictEqual(typeof OmpBridge.prototype.isStreaming, 'function', 'isStreaming must be a function');
  });

  // Test 4: runGc with mock binary returning valid fixture
  const mockGcScript = path.join(tmpDir, 'mock-omp.cjs');
  fs.writeFileSync(
    mockGcScript,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'gc' && args.includes('--json')) {
  const isApply = args.includes('--apply');
  const payload = {
    agentDir: "/mock/.omp/agent",
    apply: isApply,
    lockPath: "/mock/.omp/agent/gc.lock",
    blobs: {
      referenced: 141,
      candidates: 145,
      wouldDelete: isApply ? 0 : 8,
      deleted: isApply ? 8 : 0,
      bytes: 452112,
      errors: []
    },
    archive: {
      scanned: 320,
      skippedActive: 73,
      keptNewestGlobal: 20,
      keptNewestPerCwd: 223,
      wouldArchive: isApply ? 0 : 5,
      archived: isApply ? 5 : 0,
      historyRowsDeleted: isApply ? 50 : 0,
      statsRowsDeleted: 0,
      ftsRebuilt: false,
      errors: []
    },
    wal: {
      databases: [
        {
          dbPath: "/mock/.omp/agent/history.db",
          walBytes: 1024,
          wouldCheckpoint: !isApply,
          checkpointed: isApply
        }
      ],
      walBytes: 1024,
      wouldCheckpoint: !isApply,
      checkpointed: isApply
    }
  };
  console.log(JSON.stringify(payload));
  process.exit(0);
}
console.error("Unknown command");
process.exit(1);
`,
    { mode: 0o755 }
  );

  // Test 4: runGc with mock binary returning valid fixture

  await asyncTest('runGc correctly parses report when invoked with node script', async () => {
    const res = await runGc(mockGcScript, {
      blobs: true,
      archive: true,
      wal: true,
      apply: false,
    });

    assert.strictEqual(res.success, true, 'runGc should succeed');
    assert.ok(res.report, 'report must exist');
    assert.strictEqual(res.report.apply, false);
    assert.strictEqual(res.report.blobs?.wouldDelete, 8);
    assert.strictEqual(res.report.archive?.wouldArchive, 5);
    assert.strictEqual(res.report.wal?.wouldCheckpoint, true);
  });

  await asyncTest('runGc correctly parses apply report when apply is true', async () => {
    const res = await runGc(mockGcScript, {
      blobs: true,
      archive: true,
      wal: true,
      apply: true,
    });

    assert.strictEqual(res.success, true, 'runGc should succeed');
    assert.ok(res.report, 'report must exist');
    assert.strictEqual(res.report.apply, true);
    assert.strictEqual(res.report.blobs?.deleted, 8);
    assert.strictEqual(res.report.archive?.archived, 5);
    assert.strictEqual(res.report.wal?.checkpointed, true);
  });

  // Test 7: IPC, preload, types and hook contract verification
  test('IPC and Type contract wiring across layers', () => {
    const mainSrc = fs.readFileSync(path.join(process.cwd(), 'electron/main.ts'), 'utf-8');
    assert.ok(mainSrc.includes("'omp:gc-run'"), 'main.ts must handle omp:gc-run IPC');
    assert.ok(mainSrc.includes('ompBridge.isStreaming()'), 'main.ts must guard against apply when engine is streaming');

    const preloadSrc = fs.readFileSync(path.join(process.cwd(), 'electron/preload.ts'), 'utf-8');
    assert.ok(preloadSrc.includes('runGc: (options?: StorageGcOptions)'), 'preload.ts must expose runGc');
    assert.ok(preloadSrc.includes("ipcRenderer.invoke('omp:gc-run'"), 'preload.ts must invoke omp:gc-run');

    const electronTypesSrc = fs.readFileSync(path.join(process.cwd(), 'electron/types.ts'), 'utf-8');
    assert.ok(electronTypesSrc.includes('export interface StorageGcOptions'), 'electron/types.ts must export StorageGcOptions');
    assert.ok(electronTypesSrc.includes('runGc: (options?: StorageGcOptions) => Promise<StorageGcResponse>'), 'electron/types.ts ElectronAPI must include runGc');

    const srcTypes = fs.readFileSync(path.join(process.cwd(), 'src/types/index.ts'), 'utf-8');
    assert.ok(srcTypes.includes('export interface StorageGcOptions'), 'src/types/index.ts must export StorageGcOptions');
    assert.ok(srcTypes.includes('runGc?: (options?: StorageGcOptions) => Promise<StorageGcResponse>'), 'src/types/index.ts ElectronAPI must include runGc?');

    const hookSrc = fs.readFileSync(path.join(process.cwd(), 'src/hooks/useOmpRpc.ts'), 'utf-8');
    assert.ok(hookSrc.includes('runGc,'), 'useOmpRpc must export runGc');
  });

  // Test 5: Lock conflict error handling
  const mockLockScript = path.join(tmpDir, 'mock-lock.cjs');
  fs.writeFileSync(
    mockLockScript,
    `#!/usr/bin/env node
console.error("Error: another process holds gc.lock: /mock/.omp/agent/gc.lock");
process.exit(1);
`,
    { mode: 0o755 }
  );

  await asyncTest('runGc returns friendly error on lock conflict', async () => {
    const res = await runGc(mockLockScript, {
      blobs: true,
      apply: false,
    });

    assert.strictEqual(res.success, false, 'runGc should fail on lock');
    assert.ok(res.error, 'error must exist');
    assert.ok(res.error.includes('gc.lock'), 'error should mention gc.lock');
  });

  // Test 6: Live test against real omp binary (dry-run)
  await asyncTest('live runGc dry-run succeeds against real omp binary', async () => {
    const res = await runGc('omp', {
      blobs: true,
      apply: false,
    });

    assert.strictEqual(res.success, true, 'live dry-run should succeed');
    assert.ok(res.report, 'live report should exist');
    assert.strictEqual(res.report.apply, false, 'live report apply must be false');
    assert.ok(typeof res.report.blobs?.candidates === 'number', 'blobs.candidates must be a number');
    assert.ok(typeof res.report.blobs?.referenced === 'number', 'blobs.referenced must be a number');
  });

  console.log(`\n====================================================`);
  console.log(`verify-storage-gc: ${passCount} tests passed!`);
  console.log(`====================================================\n`);
} finally {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}
