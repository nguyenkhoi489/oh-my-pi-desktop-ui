/**
 * Verification Suite: OAuth Login qua auth-broker (UI-driven)
 *
 * Requirements:
 * 1. start() spawn CLI, parse URL OAuth từ stdout, mở trình duyệt, emit awaiting-browser.
 * 2. Exit code 0 -> emit success.
 * 3. Exit code != 0 -> emit error kèm stderr tail.
 * 4. cancel() -> kill process, emit cancelled.
 * 5. submitInput() ghi vào stdin (fallback dán code); từ chối khi không có phiên.
 * 6. start() khi đang có phiên -> hủy phiên cũ trước.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AuthLoginManager, parseAuthenticatedProviders } from '../electron/auth-login.ts';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    failed++;
    throw new Error(message);
  } else {
    console.log(`  ✓ PASSED: ${message}`);
    passed++;
  }
}

function createFakeWindow() {
  const events = [];
  return {
    events,
    window: {
      isDestroyed: () => false,
      webContents: {
        send: (_channel, event) => events.push(event),
      },
    },
  };
}

function waitFor(predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve(undefined);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error('waitFor timeout'));
      }
    }, 20);
  });
}

console.log('=== Starting Auth Login Verification Suite ===\n');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-auth-login-test-'));

// Stub CLI mô phỏng `omp auth-broker login`: in URL rồi chờ stdin
const stubSuccessPath = path.join(tempDir, 'stub-omp-success.sh');
fs.writeFileSync(
  stubSuccessPath,
  `#!/bin/bash
echo "Open this URL in your browser:"
echo "https://example.com/oauth/authorize?code=true&state=abc"
echo "Waiting for browser authentication..."
read line
if [ "$line" = "good-code" ]; then exit 0; else exit 1; fi
`,
  { mode: 0o755 }
);

const stubFailPath = path.join(tempDir, 'stub-omp-fail.sh');
fs.writeFileSync(
  stubFailPath,
  `#!/bin/bash
echo "boom: unknown provider" >&2
exit 2
`,
  { mode: 0o755 }
);

const stubHangPath = path.join(tempDir, 'stub-omp-hang.sh');
fs.writeFileSync(
  stubHangPath,
  `#!/bin/bash
echo "https://example.com/oauth/hang"
exec sleep 60
`,
  { mode: 0o755 }
);

try {
  // ----------------------------------------------------
  // Test 1: URL parsing + awaiting-browser + submitInput -> success
  // ----------------------------------------------------
  console.log('[Test 1] Parse URL, mở trình duyệt, submitInput -> success');
  {
    const opened = [];
    const manager = new AuthLoginManager(async (url) => {
      opened.push(url);
    });
    const { events, window } = createFakeWindow();

    const res = manager.start(stubSuccessPath, 'anthropic', window);
    assert(res.success === true, 'start() trả về success');
    assert(events.some((e) => e.status === 'started'), 'Emit started ngay khi spawn');

    await waitFor(() => events.some((e) => e.status === 'awaiting-browser'));
    const awaiting = events.find((e) => e.status === 'awaiting-browser');
    assert(
      awaiting.url === 'https://example.com/oauth/authorize?code=true&state=abc',
      'URL OAuth được parse chính xác từ stdout'
    );
    assert(opened.length === 1 && opened[0] === awaiting.url, 'openUrl được gọi đúng 1 lần với URL đó');
    assert(awaiting.providerId === 'anthropic', 'Event mang đúng providerId');

    const inputRes = manager.submitInput('good-code');
    assert(inputRes.success === true, 'submitInput ghi được vào stdin');

    await waitFor(() => events.some((e) => e.status === 'success'));
    assert(events.some((e) => e.status === 'success'), 'Exit code 0 -> emit success');
  }

  // ----------------------------------------------------
  // Test 2: Exit code != 0 -> error kèm stderr
  // ----------------------------------------------------
  console.log('[Test 2] CLI thất bại -> emit error kèm stderr tail');
  {
    const manager = new AuthLoginManager(async () => {});
    const { events, window } = createFakeWindow();
    manager.start(stubFailPath, 'unknown-provider', window);

    await waitFor(() => events.some((e) => e.status === 'error'));
    const errEvent = events.find((e) => e.status === 'error');
    assert(errEvent.message.includes('boom: unknown provider'), 'Error message chứa stderr tail');
  }

  // ----------------------------------------------------
  // Test 3: cancel() -> cancelled
  // ----------------------------------------------------
  console.log('[Test 3] cancel() -> kill process, emit cancelled');
  {
    const manager = new AuthLoginManager(async () => {});
    const { events, window } = createFakeWindow();
    manager.start(stubHangPath, 'anthropic', window);
    await waitFor(() => events.some((e) => e.status === 'awaiting-browser'));

    manager.cancel();
    await waitFor(() => events.some((e) => e.status === 'cancelled'));
    assert(events.some((e) => e.status === 'cancelled'), 'Emit cancelled sau khi hủy');
  }

  // ----------------------------------------------------
  // Test 4: submitInput không có phiên -> từ chối
  // ----------------------------------------------------
  console.log('[Test 4] submitInput khi không có phiên đăng nhập');
  {
    const manager = new AuthLoginManager(async () => {});
    const res = manager.submitInput('abc');
    assert(res.success === false, 'Từ chối khi không có phiên đang chờ');
  }

  // ----------------------------------------------------
  // Test 5: start() mới hủy phiên cũ
  // ----------------------------------------------------
  console.log('[Test 5] start() phiên mới hủy phiên cũ');
  {
    const manager = new AuthLoginManager(async () => {});
    const { events, window } = createFakeWindow();
    manager.start(stubHangPath, 'first', window);
    await waitFor(() => events.some((e) => e.status === 'awaiting-browser'));

    manager.start(stubSuccessPath, 'second', window);
    await waitFor(() =>
      events.some((e) => e.status === 'cancelled' && e.providerId === 'first')
    );
    assert(
      events.some((e) => e.status === 'cancelled' && e.providerId === 'first'),
      'Phiên cũ bị hủy khi phiên mới bắt đầu'
    );
    await waitFor(() =>
      events.some((e) => e.status === 'awaiting-browser' && e.providerId === 'second')
    );
    assert(
      events.some((e) => e.status === 'started' && e.providerId === 'second'),
      'Phiên mới khởi động bình thường'
    );
    manager.cancel();
  }

  console.log('\n[Test] parseAuthenticatedProviders từ omp usage --json');
  {
    const usageJson = JSON.stringify({
      reports: [
        { provider: 'openai-codex', limits: [] },
        { provider: 'anthropic', limits: [] },
        { provider: 'openai-codex', limits: [] },
        { provider: '', limits: [] },
        { limits: [] },
      ],
    });
    const ids = parseAuthenticatedProviders(usageJson);
    assert(
      ids.length === 2 && ids.includes('openai-codex') && ids.includes('anthropic'),
      'Trích provider đã xác thực, loại trùng và giá trị rỗng'
    );
    assert(
      parseAuthenticatedProviders('{"reports": []}').length === 0,
      'reports rỗng -> danh sách rỗng'
    );
    assert(
      parseAuthenticatedProviders('không phải json').length === 0,
      'JSON hỏng -> danh sách rỗng, không throw'
    );
    assert(
      parseAuthenticatedProviders('{"other": true}').length === 0,
      'Thiếu reports -> danh sách rỗng'
    );
  }

  console.log(`\n=== Auth Login Verification Suite Complete: ${passed} passed, ${failed} failed ===`);
  fs.rmSync(tempDir, { recursive: true, force: true });
  process.exit(failed > 0 ? 1 : 0);
} catch (err) {
  console.error('\nSuite aborted:', err.message);
  console.log(`\n=== Auth Login Verification Suite Complete: ${passed} passed, ${failed} failed (aborted) ===`);
  fs.rmSync(tempDir, { recursive: true, force: true });
  process.exit(1);
}
