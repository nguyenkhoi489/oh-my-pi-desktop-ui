/**
 * Verification Suite: Browser Relay Service (Phase 16)
 */

import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  buildBrowserRelayInstallArgs,
  buildBrowserRelayStartArgs,
  getDefaultExtensionDir,
  parseInstallInstructions,
  RelayServer,
  BrowserRelayManager,
} from '../electron/browser-relay.ts';
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

console.log('=== Running verify-browser-relay.mjs ===\n');

try {
  // Test 1: buildBrowserRelayInstallArgs
  test('buildBrowserRelayInstallArgs generates correct argv', () => {
    assert.deepStrictEqual(buildBrowserRelayInstallArgs(), ['browser-relay', 'install']);
    assert.deepStrictEqual(buildBrowserRelayInstallArgs({}), ['browser-relay', 'install']);
    assert.deepStrictEqual(buildBrowserRelayInstallArgs({ dir: '' }), ['browser-relay', 'install']);
    assert.deepStrictEqual(buildBrowserRelayInstallArgs({ dir: '   ' }), ['browser-relay', 'install']);
    assert.deepStrictEqual(buildBrowserRelayInstallArgs({ dir: '/custom/path/ext' }), [
      'browser-relay',
      'install',
      '--dir=/custom/path/ext',
    ]);
  });

  // Test 2: buildBrowserRelayStartArgs
  test('buildBrowserRelayStartArgs generates correct argv for all options', () => {
    assert.deepStrictEqual(buildBrowserRelayStartArgs(), ['browser-relay', 'serve']);
    assert.deepStrictEqual(buildBrowserRelayStartArgs({}), ['browser-relay', 'serve']);

    // Port
    assert.deepStrictEqual(buildBrowserRelayStartArgs({ port: 9224 }), [
      'browser-relay',
      'serve',
      '--port=9224',
    ]);

    // Token
    assert.deepStrictEqual(buildBrowserRelayStartArgs({ token: 'secretToken' }), [
      'browser-relay',
      'serve',
      '--token=secretToken',
    ]);

    // Flags: noGroup, verbose
    assert.deepStrictEqual(buildBrowserRelayStartArgs({ noGroup: true }), [
      'browser-relay',
      'serve',
      '--no-group',
    ]);
    assert.deepStrictEqual(buildBrowserRelayStartArgs({ verbose: true }), [
      'browser-relay',
      'serve',
      '--verbose',
    ]);

    // Combined options
    assert.deepStrictEqual(
      buildBrowserRelayStartArgs({
        port: 9333,
        token: 'auth123',
        noGroup: true,
        verbose: true,
      }),
      [
        'browser-relay',
        'serve',
        '--port=9333',
        '--token=auth123',
        '--no-group',
        '--verbose',
      ]
    );
  });

  // Test 3: getDefaultExtensionDir
  test('getDefaultExtensionDir returns valid path in home directory', () => {
    const extDir = getDefaultExtensionDir();
    assert.ok(typeof extDir === 'string' && extDir.length > 0);
    assert.ok(extDir.includes('.omp'));
    assert.ok(extDir.includes('browser-relay'));
    assert.ok(extDir.endsWith('extension'));
    assert.strictEqual(extDir, path.join(os.homedir(), '.omp', 'browser-relay', 'extension'));
  });

  // Test 4: parseInstallInstructions
  test('parseInstallInstructions extracts chrome instructions block', () => {
    const rawSample = `Installed the OMP Browser Relay extension to /Users/test/.omp/browser-relay/extension

Finish setup in Chrome:
  1. Open chrome://extensions and enable Developer mode.
  2. Click "Load unpacked" and select: /Users/test/.omp/browser-relay/extension
  3. Enable the mode:  omp config set browser.relay true

omp starts the relay automatically when the browser tool needs it;
run \`omp browser-relay\` yourself only for --token or --no-group.
The extension badge shows 'on' once it reaches a relay.`;

    const instructions = parseInstallInstructions(rawSample);
    assert.ok(instructions.startsWith('Finish setup in Chrome:'));
    assert.ok(instructions.includes('chrome://extensions'));
    assert.ok(instructions.includes('Load unpacked'));

    // Empty / no marker fallback
    assert.strictEqual(parseInstallInstructions(''), '');
    assert.strictEqual(parseInstallInstructions('Some custom output'), 'Some custom output');
  });

  // Test 5: RelayServer start and stop lifecycle with mock process
  await asyncTest('RelayServer start, status, and stop work properly', async () => {
    const server = new RelayServer();
    assert.strictEqual(server.isRunning, false);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-relay-test-'));
    const fakeBin = path.join(tmpDir, 'fake-omp');
    const fakeScriptContent = `#!/usr/bin/env node
console.log("omp browser relay listening on http://127.0.0.1:9555");
process.on('SIGTERM', () => {
  process.exit(0);
});
setInterval(() => {}, 1000);
`;
    fs.writeFileSync(fakeBin, fakeScriptContent, { mode: 0o755 });

    try {
      const startRes = await server.start(fakeBin, {
        port: 9555,
        token: 'test',
      });

      assert.strictEqual(startRes.success, true);
      assert.strictEqual(startRes.port, 9555);
      assert.strictEqual(server.isRunning, true);

      // Không cho start lại khi đang chạy
      const secondStart = await server.start(fakeBin, { port: 9555 });
      assert.strictEqual(secondStart.success, false);
      assert.ok(secondStart.error?.includes('đã đang chạy'));

      // Kiểm tra status
      const statusRes = await server.status(fakeBin);
      assert.strictEqual(statusRes.running, true);
      assert.strictEqual(statusRes.source, 'app');
      assert.strictEqual(statusRes.port, 9555);
      assert.ok(typeof statusRes.pid === 'number');

      // Dừng server
      const stopRes = await server.stop();
      assert.strictEqual(stopRes.success, true);
      assert.strictEqual(server.isRunning, false);

      // Status sau khi dừng
      const stoppedStatus = await server.status(fakeBin);
      assert.strictEqual(stoppedStatus.running, false);
      assert.strictEqual(stoppedStatus.source, 'none');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // Test 6: BrowserRelayManager dispose clears resources
  await asyncTest('BrowserRelayManager dispose stops running server and disposes runner', async () => {
    const server = new RelayServer();
    const manager = new BrowserRelayManager(server);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-relay-dispose-test-'));
    const fakeBin = path.join(tmpDir, 'fake-omp');
    const fakeScriptContent = `#!/usr/bin/env node
console.log("omp browser relay listening on http://127.0.0.1:9556");
process.on('SIGTERM', () => {
  process.exit(0);
});
setInterval(() => {}, 1000);
`;
    fs.writeFileSync(fakeBin, fakeScriptContent, { mode: 0o755 });

    try {
      await server.start(fakeBin, { port: 9556 });
      assert.strictEqual(manager.isRelayRunning, true);

      manager.dispose();
      // Đợi process thoát
      await new Promise((r) => setTimeout(r, 200));
      assert.strictEqual(manager.isRelayRunning, false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // Test 7: Preload and Types IPC Contracts
  test('IPC channel names and API methods match contract', () => {
    const preloadContent = fs.readFileSync(
      path.join(process.cwd(), 'electron/preload.ts'),
      'utf-8'
    );
    const mainContent = fs.readFileSync(
      path.join(process.cwd(), 'electron/main.ts'),
      'utf-8'
    );
    const electronTypes = fs.readFileSync(
      path.join(process.cwd(), 'electron/types.ts'),
      'utf-8'
    );
    const srcTypes = fs.readFileSync(
      path.join(process.cwd(), 'src/types/index.ts'),
      'utf-8'
    );

    // Preload exposes methods
    assert.ok(preloadContent.includes('installBrowserRelay:'), 'preload has installBrowserRelay');
    assert.ok(preloadContent.includes('startBrowserRelay:'), 'preload has startBrowserRelay');
    assert.ok(preloadContent.includes('stopBrowserRelay:'), 'preload has stopBrowserRelay');
    assert.ok(preloadContent.includes('getBrowserRelayStatus:'), 'preload has getBrowserRelayStatus');
    assert.ok(preloadContent.includes('onBrowserRelayOutput:'), 'preload has onBrowserRelayOutput');

    // Preload invokes channels
    assert.ok(preloadContent.includes("'omp:browser-relay-install'"));
    assert.ok(preloadContent.includes("'omp:browser-relay-start'"));
    assert.ok(preloadContent.includes("'omp:browser-relay-stop'"));
    assert.ok(preloadContent.includes("'omp:browser-relay-status'"));
    assert.ok(preloadContent.includes("'omp:browser-relay-output'"));

    // Main handles channels
    assert.ok(mainContent.includes("'omp:browser-relay-install'"));
    assert.ok(mainContent.includes("'omp:browser-relay-start'"));
    assert.ok(mainContent.includes("'omp:browser-relay-stop'"));
    assert.ok(mainContent.includes("'omp:browser-relay-status'"));

    // Main disposeAll cleans up browserRelayManager
    assert.ok(mainContent.includes('browserRelayManager.dispose()'));

    // Types contracts
    assert.ok(electronTypes.includes('installBrowserRelay:'));
    assert.ok(electronTypes.includes('startBrowserRelay:'));
    assert.ok(electronTypes.includes('stopBrowserRelay:'));
    assert.ok(electronTypes.includes('getBrowserRelayStatus:'));
    assert.ok(electronTypes.includes('onBrowserRelayOutput:'));
    assert.ok(electronTypes.includes('interface BrowserRelayInstallOptions'));
    assert.ok(electronTypes.includes('interface BrowserRelayStartOptions'));
    assert.ok(electronTypes.includes('interface BrowserRelayStatus'));
    assert.ok(electronTypes.includes('interface BrowserRelayInstallResult'));

    assert.ok(srcTypes.includes('installBrowserRelay?:'));
    assert.ok(srcTypes.includes('startBrowserRelay?:'));
    assert.ok(srcTypes.includes('stopBrowserRelay?:'));
    assert.ok(srcTypes.includes('getBrowserRelayStatus?:'));
    assert.ok(srcTypes.includes('onBrowserRelayOutput?:'));
    assert.ok(srcTypes.includes('interface BrowserRelayInstallOptions'));
    assert.ok(srcTypes.includes('interface BrowserRelayStartOptions'));
    assert.ok(srcTypes.includes('interface BrowserRelayStatus'));
    assert.ok(srcTypes.includes('interface BrowserRelayInstallResult'));
  });

  // Test 8: i18n Keys existence and parity
  test('i18n keys for browser relay exist in vi and en', () => {
    const requiredKeys = [
      'ops.processes.relay.title',
      'ops.processes.relay.desc',
      'ops.processes.relay.status.running',
      'ops.processes.relay.status.stopped',
      'ops.processes.relay.status.app',
      'ops.processes.relay.status.daemon',
      'ops.processes.relay.installBtn',
      'ops.processes.relay.installing',
      'ops.processes.relay.openFolder',
      'ops.processes.relay.startBtn',
      'ops.processes.relay.starting',
      'ops.processes.relay.stopBtn',
      'ops.processes.relay.port',
      'ops.processes.relay.portPlaceholder',
      'ops.processes.relay.token',
      'ops.processes.relay.tokenPlaceholder',
      'ops.processes.relay.instructionsTitle',
      'ops.processes.relay.note',
      'ops.processes.relay.installFailed',
      'ops.processes.relay.startFailed',
      'ops.processes.relay.stopFailed',
      'ops.processes.relay.chromeExtLink',
      'ops.processes.relay.copyDir',
      'ops.processes.relay.copied',
    ];

    for (const key of requiredKeys) {
      assert.ok(key in vi, `Missing key "${key}" in vi.ts`);
      assert.ok(key in en, `Missing key "${key}" in en.ts`);
      assert.ok(typeof vi[key] === 'string' && vi[key].length > 0);
      assert.ok(typeof en[key] === 'string' && en[key].length > 0);
    }
  });

  console.log(`\n==============================================`);
  console.log(`Browser Relay Service: ${passCount} tests passed, 0 failed.`);
  console.log(`==============================================\n`);
} catch (err) {
  console.error('Test suite failed:', err);
  process.exit(1);
}
