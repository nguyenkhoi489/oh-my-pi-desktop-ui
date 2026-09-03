/**
 * Verification Suite: Image Backends (Phase 11)
 */

import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { buildImagesArgs, runImages } from '../electron/image-backends.ts';

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

console.log('=== Running verify-image-backends.mjs ===');

const tmpDir = path.join(os.tmpdir(), `omp-test-images-${Date.now()}`);
fs.mkdirSync(tmpDir, { recursive: true });

try {
  // Test 1: buildImagesArgs default behavior
  test('buildImagesArgs builds baseline args with status and --json', () => {
    const args = buildImagesArgs();
    assert.strictEqual(args[0], 'images');
    assert.strictEqual(args[1], 'status');
    assert.strictEqual(args[2], '--json');
    assert.strictEqual(args.length, 3);
  });

  // Test 2: buildImagesArgs with options
  test('buildImagesArgs handles dir and timeout options', () => {
    const args = buildImagesArgs('doctor', {
      dir: '/test/workspace',
      timeout: 10,
    });
    assert.strictEqual(args[0], 'images');
    assert.strictEqual(args[1], 'doctor');
    assert.strictEqual(args[2], '--json');
    assert.ok(args.includes('--dir=/test/workspace'), 'Must include --dir');
    assert.ok(args.includes('--timeout=10'), 'Must include --timeout');
  });
  // Test 2b: buildImagesArgs with profile
  test('buildImagesArgs handles profile option by prefixing --profile before command', () => {
    const args = buildImagesArgs('status', { profile: 'work' });
    assert.strictEqual(args[0], '--profile=work');
    assert.strictEqual(args[1], 'images');
    assert.strictEqual(args[2], 'status');
    assert.strictEqual(args[3], '--json');
  });

  // Test 3: buildImagesArgs with purge options
  test('buildImagesArgs handles purge flags (--all, --apply)', () => {
    const dryRunArgs = buildImagesArgs('purge', { all: true, apply: false });
    assert.ok(dryRunArgs.includes('purge'));
    assert.ok(dryRunArgs.includes('--all'));
    assert.ok(!dryRunArgs.includes('--apply'));

    const applyArgs = buildImagesArgs('purge', { all: false, apply: true });
    assert.ok(applyArgs.includes('purge'));
    assert.ok(!applyArgs.includes('--all'));
    assert.ok(applyArgs.includes('--apply'));
  });

  // Test 4: runImages with mock binary simulating hanging status (prints JSON then sleeps)
  const mockHangingScript = path.join(tmpDir, 'mock-hanging-omp.cjs');
  fs.writeFileSync(
    mockHangingScript,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'images') {
  const action = args[1] || 'status';
  if (action === 'status') {
    const payload = {
      action: "status",
      exitCode: 0,
      projectDir: "/mock/workspace",
      enabled: false,
      backends: ["provider-files", "tailscale", "cloudflared", "litterbox"],
      daemon: { state: "stopped" },
      providerFiles: {
        indexPath: "/mock/blobs/index.json",
        entries: 4,
        bytes: 2048,
        providers: { openai: 2, anthropic: 1, google: 1 },
        dirty: false
      },
      savings: {
        journalPath: "/mock/blobs/savings.jsonl",
        entries: 10,
        imageCount: 5,
        inlineBytes: 5000,
        referenceBytes: 2000,
        savedBytes: 3000,
        byDestination: {}
      }
    };
    console.log(JSON.stringify(payload));
    // Mô phỏng tiến trình engine bị treo sau khi in JSON
    setTimeout(() => { process.exit(0); }, 30000);
    return;
  }
}
process.exit(1);
`,
    { mode: 0o755 }
  );

  await asyncTest('runImages extracts status from hanging process quickly without waiting for exit', async () => {
    const startTime = Date.now();
    const res = await runImages(mockHangingScript, 'status');
    const duration = Date.now() - startTime;

    assert.strictEqual(res.success, true, 'runImages should succeed');
    assert.strictEqual(res.action, 'status');
    assert.ok(res.data, 'res.data must exist');
    assert.strictEqual(res.data.enabled, false);
    assert.strictEqual(res.data.daemon?.state, 'stopped');
    assert.strictEqual(res.data.backends.length, 4);
    assert.strictEqual(res.data.providerFiles?.entries, 4);
    assert.strictEqual(res.data.savings?.savedBytes, 3000);
    assert.ok(duration < 5000, `Duration was ${duration}ms, should be < 5000ms`);
  });

  // Test 5: runImages with doctor, probe and purge
  // Test 4b: runImages forwarding profile
  const mockProfileScript = path.join(tmpDir, 'mock-profile-omp.cjs');
  fs.writeFileSync(
    mockProfileScript,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
const profileArg = args.find(a => a.startsWith('--profile='));
const profileEnv = process.env.OMP_PROFILE;
if (profileArg && profileEnv) {
  console.log(JSON.stringify({
    action: "status",
    exitCode: 0,
    profileArg: profileArg.split('=')[1],
    profileEnv,
    enabled: true,
    backends: ["provider-files"],
    daemon: { state: "running" }
  }));
  process.exit(0);
}
console.error("Profile not forwarded");
process.exit(1);
`,
    { mode: 0o755 }
  );

  await asyncTest('runImages forwards profile via argv and environment', async () => {
    const res = await runImages(mockProfileScript, 'status', { profile: 'test-custom' });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data?.profileArg, 'test-custom');
    assert.strictEqual(res.data?.profileEnv, 'test-custom');
  });
  const mockOperationsScript = path.join(tmpDir, 'mock-operations-omp.cjs');
  fs.writeFileSync(
    mockOperationsScript,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
const action = args[1];
if (action === 'doctor') {
  console.log(JSON.stringify({
    action: "doctor",
    exitCode: 1,
    healthy: false,
    checks: [
      { name: "enabled", severity: "error", detail: "images disabled" },
      { name: "daemon", severity: "warn", detail: "daemon stopped" },
      { name: "disk", severity: "ok", detail: "writable" }
    ]
  }));
  process.exit(1);
}
if (action === 'probe') {
  console.log(JSON.stringify({
    action: "probe",
    exitCode: 1,
    daemonState: "stopped",
    ok: false,
    detail: "Publication disabled"
  }));
  process.exit(1);
}
if (action === 'purge') {
  const isApply = args.includes('--apply');
  console.log(JSON.stringify({
    action: "purge",
    exitCode: 0,
    applied: isApply,
    all: args.includes('--all'),
    daemon: null,
    providerFiles: {
      selected: 5,
      bytes: 10240,
      deleted: isApply ? 5 : 0,
      skippedAuth: 0,
      errors: []
    }
  }));
  process.exit(0);
}
console.error("Unknown action");
process.exit(1);
`,
    { mode: 0o755 }
  );

  await asyncTest('runImages doctor parses checks accurately', async () => {
    const res = await runImages(mockOperationsScript, 'doctor');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.action, 'doctor');
    assert.strictEqual(res.data.healthy, false);
    assert.strictEqual(res.data.checks?.length, 3);
    assert.strictEqual(res.data.checks[0].severity, 'error');
  });

  await asyncTest('runImages probe parses probe status accurately', async () => {
    const res = await runImages(mockOperationsScript, 'probe', { timeout: 3 });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.action, 'probe');
    assert.strictEqual(res.data.ok, false);
    assert.strictEqual(res.data.daemonState, 'stopped');
  });

  await asyncTest('runImages purge dry-run and apply parses providerFiles report', async () => {
    const dryRes = await runImages(mockOperationsScript, 'purge', { apply: false });
    assert.strictEqual(dryRes.success, true);
    assert.strictEqual(dryRes.data.applied, false);
    assert.strictEqual(dryRes.data.providerFiles?.selected, 5);
    assert.strictEqual(dryRes.data.providerFiles?.deleted, 0);

    const applyRes = await runImages(mockOperationsScript, 'purge', { apply: true, all: true });
    assert.strictEqual(applyRes.success, true);
    assert.strictEqual(applyRes.data.applied, true);
    assert.strictEqual(applyRes.data.all, true);
    assert.strictEqual(applyRes.data.providerFiles?.deleted, 5);
  });

  // Test 6: Error handling on failure without JSON
  const mockFailingScript = path.join(tmpDir, 'mock-fail.cjs');
  fs.writeFileSync(
    mockFailingScript,
    `#!/usr/bin/env node
console.error("Fatal: failed to connect to daemon socket");
process.exit(1);
`,
    { mode: 0o755 }
  );

  await asyncTest('runImages handles command failure gracefully without crashing', async () => {
    const res = await runImages(mockFailingScript, 'status');
    assert.strictEqual(res.success, false);
    assert.ok(res.error);
    assert.ok(res.error.includes('Fatal: failed to connect to daemon socket'));
  });

  // Test 7: IPC, Preload, Types, Hook, and StorageTab wiring contracts
  test('IPC and Type contract wiring across layers for Image Backends', () => {
    const mainSrc = fs.readFileSync(path.join(process.cwd(), 'electron/main.ts'), 'utf-8');
    assert.ok(mainSrc.includes("'omp:images-run'"), 'main.ts must handle omp:images-run IPC');
    assert.ok(
      mainSrc.includes("ompBridge.isStreaming()"),
      'main.ts must guard against purge apply when engine is streaming'
    );

    const preloadSrc = fs.readFileSync(path.join(process.cwd(), 'electron/preload.ts'), 'utf-8');
    assert.ok(preloadSrc.includes('runImages: (action?: ImageBackendsAction'), 'preload.ts must expose runImages');
    assert.ok(preloadSrc.includes("ipcRenderer.invoke('omp:images-run'"), 'preload.ts must invoke omp:images-run');

    const electronTypesSrc = fs.readFileSync(path.join(process.cwd(), 'electron/types.ts'), 'utf-8');
    assert.ok(electronTypesSrc.includes('export type ImageBackendsAction'), 'electron/types.ts must export ImageBackendsAction');
    assert.ok(electronTypesSrc.includes('runImages: (action?: ImageBackendsAction'), 'electron/types.ts ElectronAPI must include runImages');

    const srcTypes = fs.readFileSync(path.join(process.cwd(), 'src/types/index.ts'), 'utf-8');
    assert.ok(srcTypes.includes('export type ImageBackendsAction'), 'src/types/index.ts must export ImageBackendsAction');
    assert.ok(srcTypes.includes('runImages?: (action?: ImageBackendsAction'), 'src/types/index.ts ElectronAPI must include runImages?');
    const hookSrc = fs.readFileSync(path.join(process.cwd(), 'src/hooks/useOmpRpc.ts'), 'utf-8');
    assert.ok(hookSrc.includes('runImages,'), 'useOmpRpc must export runImages');

    const storageTabSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/Modals/ops/StorageTab.tsx'), 'utf-8');
    assert.ok(storageTabSrc.includes('runImages'), 'StorageTab must support runImages prop/runner');
    assert.ok(storageTabSrc.includes('ops.storage.images.title'), 'StorageTab must render image backends title');

    const viSrc = fs.readFileSync(path.join(process.cwd(), 'shared/i18n/vi.ts'), 'utf-8');
    const enSrc = fs.readFileSync(path.join(process.cwd(), 'shared/i18n/en.ts'), 'utf-8');
    assert.ok(viSrc.includes('ops.storage.images.title'), 'vi.ts must have image backends keys');
    assert.ok(enSrc.includes('ops.storage.images.title'), 'en.ts must have image backends keys');
    assert.ok(storageTabSrc.includes('ops.storage.images.purge.optionsChanged'), 'StorageTab must guard against changed purge options');
    assert.ok(storageTabSrc.includes('ops.storage.images.purge.errorsTitle'), 'StorageTab must render purge errors');
    assert.ok(storageTabSrc.includes('ops.storage.images.doctor.results'), 'StorageTab must localize doctor results');
    assert.ok(storageTabSrc.includes('ops.storage.images.probe.results'), 'StorageTab must localize probe results');
    assert.ok(viSrc.includes('ops.storage.images.purge.optionsChanged'), 'vi.ts must have purge options changed key');
    assert.ok(enSrc.includes('ops.storage.images.purge.optionsChanged'), 'en.ts must have purge options changed key');
  });

  // Test 8: Live test against real omp binary
  await asyncTest('live runImages status against real omp binary', async () => {
    const res = await runImages('omp', 'status');
    assert.strictEqual(res.success, true, 'live status should succeed');
    assert.strictEqual(res.action, 'status');
    assert.ok(res.data, 'live status data must exist');
    assert.ok(Array.isArray(res.data.backends), 'backends must be an array');
    assert.strictEqual(res.data.backends.length, 4, 'should report 4 backends');
    assert.ok(res.data.backends.includes('provider-files'));
    assert.ok(res.data.backends.includes('tailscale'));
    assert.ok(res.data.backends.includes('cloudflared'));
    assert.ok(res.data.backends.includes('litterbox'));
    assert.ok(res.data.daemon, 'daemon state must exist');
    assert.ok(typeof res.data.daemon.state === 'string', 'daemon.state must be string');
  });

  await asyncTest('live runImages doctor against real omp binary', async () => {
    const res = await runImages('omp', 'doctor');
    assert.strictEqual(res.success, true, 'live doctor should succeed');
    assert.strictEqual(res.action, 'doctor');
    assert.ok(res.data, 'live doctor data must exist');
    assert.ok(Array.isArray(res.data.checks), 'checks must be an array');
  });

  await asyncTest('live runImages probe against real omp binary', async () => {
    const res = await runImages('omp', 'probe', { timeout: 3 });
    assert.strictEqual(res.success, true, 'live probe should succeed');
    assert.strictEqual(res.action, 'probe');
    assert.ok(res.data, 'live probe data must exist');
    assert.ok(typeof res.data.ok === 'boolean', 'ok must be boolean');
  });

  await asyncTest('live runImages purge dry-run against real omp binary', async () => {
    const res = await runImages('omp', 'purge', { apply: false });
    assert.strictEqual(res.success, true, 'live purge dry-run should succeed');
    assert.strictEqual(res.action, 'purge');
    assert.strictEqual(res.data.applied, false);
    assert.ok(res.data.providerFiles, 'providerFiles report must exist');
  });

  console.log(`\n====================================================`);
  console.log(`verify-image-backends: ${passCount} tests passed!`);
  console.log(`====================================================\n`);
} finally {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}
