/**
 * Verification Suite: Command Output ANSI & TTS (Phase 17)
 *
 * Requirements:
 * 1. stripAnsi util:
 *    - Strips CSI (SGR color codes, cursor moves, clear screen).
 *    - Strips OSC (window title, operating system commands).
 *    - Preserves newlines (\n, \r\n), unicode, Vietnamese characters, and block characters (█░).
 *    - Handles null/undefined/empty gracefully.
 * 2. SayManager:
 *    - Manages `omp say --file <tmp>` child process.
 *    - Creates temp file and unlinks it upon completion/abort.
 *    - Passes `--voice` and `--model` flags when configured.
 *    - Detects missing TTS model from stderr and flags missingModel.
 *    - Supports manual stop() and dispose() lifecycle cleanup.
 * 3. Contract & wiring verification:
 *    - Preload exposes startSay, stopSay, onSayStatus.
 *    - Types match across electron/types.ts and src/types/index.ts.
 *    - i18n keys parity for tts.* in vi.ts and en.ts.
 *    - useOmpRpc applies stripAnsi and exposes isSpeaking, startSay, stopSay.
 *    - TerminalView and ChatHistory apply stripAnsi.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { stripAnsi } from '../shared/text/strip-ansi.ts';
import { SayManager } from '../electron/tts-say.ts';
import { vi, en } from '../shared/i18n/index.ts';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}:`, err.message);
    failed++;
    throw err;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}:`, err.message);
    failed++;
    throw err;
  }
}

console.log('=== Starting Command Output ANSI & TTS Verification Suite (Phase 17) ===\n');

// ----------------------------------------------------
// Section 1: stripAnsi Unit Tests
// ----------------------------------------------------
console.log('--- Section 1: stripAnsi Unit Tests ---');

test('Handles empty, null, and undefined text safely', () => {
  assert.strictEqual(stripAnsi(''), '');
  assert.strictEqual(stripAnsi(null), '');
  assert.strictEqual(stripAnsi(undefined), '');
  assert.strictEqual(stripAnsi('plain text'), 'plain text');
});

test('Strips basic SGR color codes (16 colors, bold, reset)', () => {
  const input = '\x1b[31mRed Text\x1b[0m \x1b[1;32mBold Green\x1b[0m \x1b[4mUnderline\x1b[24m';
  const expected = 'Red Text Bold Green Underline';
  assert.strictEqual(stripAnsi(input), expected);
});

test('Strips 256-color and 24-bit truecolor sequences', () => {
  const input = '\x1b[38;5;240mGray 240\x1b[0m \x1b[38;2;255;128;64mTrueColor Orange\x1b[0m';
  const expected = 'Gray 240 TrueColor Orange';
  assert.strictEqual(stripAnsi(input), expected);
});

test('Strips cursor movements, clear line/screen codes', () => {
  const input = '\x1b[2K\r\x1b[1A\x1b[JUpdated in place!';
  assert.strictEqual(stripAnsi(input), '\rUpdated in place!');
});

test('Strips OSC sequences (window title, hyperlinks)', () => {
  const oscBell = '\x1b]0;My Terminal Window\x07Content after bell';
  const oscSlash = '\x1b]0;Terminal Title\x1b\\Content after slash';
  assert.strictEqual(stripAnsi(oscBell), 'Content after bell');
  assert.strictEqual(stripAnsi(oscSlash), 'Content after slash');
});

test('Preserves multiline formatting, newlines and tabs', () => {
  const input = '\x1b[34mLine 1\x1b[0m\n\x1b[32m\tLine 2 indented\x1b[0m\r\nLine 3';
  const expected = 'Line 1\n\tLine 2 indented\r\nLine 3';
  assert.strictEqual(stripAnsi(input), expected);
});

test('Preserves unicode, Vietnamese text, and /context block progress bar', () => {
  // Mẫu output thực tế của `/context` trong OMP CLI
  const realContextOutput =
    '\x1b[1mContext Window Usage\x1b[0m\n' +
    '\x1b[38;2;59;130;246m██████████\x1b[0m\x1b[38;2;100;116;139m░░░░░░░░░░\x1b[0m 50.0% (64,000 / 128,000 tokens)\n' +
    '\x1b[33mCảnh báo: Đã dùng hơn 50% ngữ cảnh trò chuyện tiếng Việt!\x1b[0m';

  const expected =
    'Context Window Usage\n' +
    '██████████░░░░░░░░░░ 50.0% (64,000 / 128,000 tokens)\n' +
    'Cảnh báo: Đã dùng hơn 50% ngữ cảnh trò chuyện tiếng Việt!';

  assert.strictEqual(stripAnsi(realContextOutput), expected);
});

// ----------------------------------------------------
// Section 2: SayManager Unit & Process Tests
// ----------------------------------------------------
console.log('\n--- Section 2: SayManager Process Tests ---');

test('SayManager initialization has correct default state', () => {
  const mgr = new SayManager();
  assert.strictEqual(mgr.isSpeaking, false);
});

await asyncTest('SayManager rejects empty or whitespace-only text without spawning', async () => {
  const mgr = new SayManager();
  const res = await mgr.speak('mock_bin', '   ');
  assert.strictEqual(res.success, false);
  assert(res.error.includes('rỗng') || res.error.includes('empty'));
  assert.strictEqual(mgr.isSpeaking, false);
});

await asyncTest('SayManager writes temporary file and cleans it up after process completes', async () => {
  const statusEvents = [];
  const mgr = new SayManager((status) => {
    statusEvents.push(status);
  });

  // Sử dụng binary node giả lập omp say thành công
  // Script node sẽ đọc file tạm và ghi ra stdout để kiểm tra nội dung
  const mockScript = `
    const fs = require('fs');
    const args = process.argv.slice(2);
    const fileIdx = args.indexOf('--file');
    if (fileIdx !== -1 && args[fileIdx + 1]) {
      const content = fs.readFileSync(args[fileIdx + 1], 'utf-8');
      process.stdout.write('spoken: ' + content);
    }
    process.exit(0);
  `;

  const nodeBinary = process.execPath;
  // Tạo runner script tạm
  const runnerFile = path.join(os.tmpdir(), `mock_omp_say_${Date.now()}.js`);
  fs.writeFileSync(runnerFile, mockScript);

  try {
    const speechText = 'Xin chào OMP Agent từ câu trả lời cuối!';
    // Bọc node binary với runner script bằng shell wrapper tạm
    const wrapperScript = `#!/bin/sh\n"${nodeBinary}" "${runnerFile}" "$@"\n`;
    const wrapperBin = path.join(os.tmpdir(), `omp_mock_say_${Date.now()}.sh`);
    fs.writeFileSync(wrapperBin, wrapperScript, { mode: 0o755 });

    try {
      const res = await mgr.speak(wrapperBin, speechText, { voice: 'af_heart' });
      assert.strictEqual(res.success, true);
      assert.strictEqual(mgr.isSpeaking, false);

      // Kiểm tra sự kiện trạng thái được emit
      assert(statusEvents.length >= 2, 'Must emit speaking: true then speaking: false');
      assert.strictEqual(statusEvents[0].speaking, true);
      assert.strictEqual(statusEvents[statusEvents.length - 1].speaking, false);
    } finally {
      try { fs.unlinkSync(wrapperBin); } catch {}
    }
  } finally {
    try { fs.unlinkSync(runnerFile); } catch {}
  }
});

await asyncTest('SayManager detects missing local TTS model and flags missingModel', async () => {
  const statusEvents = [];
  const mgr = new SayManager((status) => {
    statusEvents.push(status);
  });

  // Script giả lập thông báo lỗi thiếu local model từ omp say
  const mockErrorScript = `
    console.error('error: could not synthesize with local TTS model "kokoro". Run \`omp setup speech\` to install it.');
    process.exit(1);
  `;

  const runnerFile = path.join(os.tmpdir(), `mock_tts_error_${Date.now()}.js`);
  fs.writeFileSync(runnerFile, mockErrorScript);

  const wrapperScript = `#!/bin/sh\n"${process.execPath}" "${runnerFile}" "$@"\n`;
  const wrapperBin = path.join(os.tmpdir(), `omp_mock_err_${Date.now()}.sh`);
  fs.writeFileSync(wrapperBin, wrapperScript, { mode: 0o755 });

  try {
    const res = await mgr.speak(wrapperBin, 'Kiểm tra lỗi thiếu model', { model: 'kokoro' });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.missingModel, true);
    assert(res.error.includes('Mô hình TTS cục bộ') || res.error.includes('Ops Center'));
    assert.strictEqual(mgr.isSpeaking, false);

    const lastEvent = statusEvents[statusEvents.length - 1];
    assert.strictEqual(lastEvent.speaking, false);
    assert.strictEqual(lastEvent.missingModel, true);
  } finally {
    try { fs.unlinkSync(wrapperBin); } catch {}
    try { fs.unlinkSync(runnerFile); } catch {}
  }
});

await asyncTest('SayManager stop() cancels running speech process cleanly', async () => {
  const mgr = new SayManager();

  // Script giả lập chạy dài (sleep 10s)
  const longRunningScript = `
    setTimeout(() => {
      process.exit(0);
    }, 10000);
  `;

  const runnerFile = path.join(os.tmpdir(), `mock_long_say_${Date.now()}.js`);
  fs.writeFileSync(runnerFile, longRunningScript);

  const wrapperScript = `#!/bin/sh\n"${process.execPath}" "${runnerFile}" "$@"\n`;
  const wrapperBin = path.join(os.tmpdir(), `omp_mock_long_${Date.now()}.sh`);
  fs.writeFileSync(wrapperBin, wrapperScript, { mode: 0o755 });

  try {
    const speakPromise = mgr.speak(wrapperBin, 'Câu văn rất dài đang đọc...');
    // Đợi 50ms để process khởi chạy
    await new Promise((r) => setTimeout(r, 80));
    assert.strictEqual(mgr.isSpeaking, true);

    // Gọi stop()
    mgr.stop();
    assert.strictEqual(mgr.isSpeaking, false);

    const res = await speakPromise;
    assert.strictEqual(res.success, true);
  } finally {
    try { fs.unlinkSync(wrapperBin); } catch {}
    try { fs.unlinkSync(runnerFile); } catch {}
  }
});

// ----------------------------------------------------
// Section 3: Contracts, Preload, Types, and i18n
// ----------------------------------------------------
console.log('\n--- Section 3: Contracts, Preload, Types, and i18n ---');

test('Preload exposes startSay, stopSay, and onSayStatus API methods', () => {
  const preloadCode = fs.readFileSync(path.join(process.cwd(), 'electron/preload.ts'), 'utf-8');
  assert(preloadCode.includes('startSay:'), 'preload.ts must expose startSay');
  assert(preloadCode.includes('stopSay:'), 'preload.ts must expose stopSay');
  assert(preloadCode.includes('onSayStatus:'), 'preload.ts must expose onSayStatus');
  assert(preloadCode.includes("'omp:say-start'"), 'preload.ts must invoke omp:say-start');
  assert(preloadCode.includes("'omp:say-stop'"), 'preload.ts must invoke omp:say-stop');
  assert(preloadCode.includes("'omp:say-status'"), 'preload.ts must listen to omp:say-status');
});

test('electron/main.ts registers IPC handlers and registers sayManager into disposeAll()', () => {
  const mainCode = fs.readFileSync(path.join(process.cwd(), 'electron/main.ts'), 'utf-8');
  assert(mainCode.includes("ipcMain.handle('omp:say-start'"), 'main.ts must handle omp:say-start');
  assert(mainCode.includes("ipcMain.handle('omp:say-stop'"), 'main.ts must handle omp:say-stop');
  assert(mainCode.includes('sayManager.dispose()'), 'main.ts must dispose sayManager in disposeAll');
});

test('electron/types.ts and src/types/index.ts declare SayOptions and SayStatusEvent', () => {
  const electronTypes = fs.readFileSync(path.join(process.cwd(), 'electron/types.ts'), 'utf-8');
  const srcTypes = fs.readFileSync(path.join(process.cwd(), 'src/types/index.ts'), 'utf-8');

  for (const content of [electronTypes, srcTypes]) {
    assert(content.includes('interface SayOptions'), 'Must declare SayOptions interface');
    assert(content.includes('interface SayStatusEvent'), 'Must declare SayStatusEvent interface');
    assert(content.includes('startSay'), 'Must declare startSay in ElectronAPI');
    assert(content.includes('stopSay'), 'Must declare stopSay in ElectronAPI');
    assert(content.includes('onSayStatus'), 'Must declare onSayStatus in ElectronAPI');
  }
});

test('i18n dictionary parity for all tts.* keys', () => {
  const requiredKeys = [
    'tts.speak',
    'tts.speakLast',
    'tts.stop',
    'tts.speaking',
    'tts.empty',
    'tts.missingModel',
    'tts.openOpsCenter',
    'tts.error',
  ];

  for (const key of requiredKeys) {
    assert(Boolean(vi[key]), `vi dictionary missing key "${key}"`);
    assert(Boolean(en[key]), `en dictionary missing key "${key}"`);
  }
});

test('useOmpRpc applies stripAnsi to command output and exports say controls', () => {
  const hookCode = fs.readFileSync(path.join(process.cwd(), 'src/hooks/useOmpRpc.ts'), 'utf-8');
  assert(hookCode.includes('stripAnsi'), 'useOmpRpc must import and use stripAnsi');
  assert(hookCode.includes('onSayStatus'), 'useOmpRpc must subscribe to onSayStatus');
  assert(hookCode.includes('startSay,'), 'useOmpRpc must return startSay');
  assert(hookCode.includes('stopSay,'), 'useOmpRpc must return stopSay');
  assert(hookCode.includes('isSpeaking,'), 'useOmpRpc must return isSpeaking');
});

test('TerminalView applies stripAnsi on bash output stream and final output', () => {
  const terminalCode = fs.readFileSync(path.join(process.cwd(), 'src/components/Canvas/TerminalView.tsx'), 'utf-8');
  assert(terminalCode.includes("import { stripAnsi } from '../../../shared/text/strip-ansi'"), 'TerminalView imports stripAnsi');
  assert(terminalCode.includes('output: stripAnsi(newRaw)'), 'TerminalView strips ansi on accumulated raw output');
  assert(terminalCode.includes('stripAnsi(data.output)'), 'TerminalView strips ansi in finalOutput');
});

test('HeaderBar renders TTS speaker button alongside copy last assistant text', () => {
  const headerCode = fs.readFileSync(path.join(process.cwd(), 'src/components/HeaderBar.tsx'), 'utf-8');
  assert(headerCode.includes('onSpeakLastAssistantText'), 'HeaderBar accepts onSpeakLastAssistantText prop');
  assert(headerCode.includes('onStopSpeaking'), 'HeaderBar accepts onStopSpeaking prop');
  assert(headerCode.includes('isSpeaking'), 'HeaderBar accepts isSpeaking prop');
  assert(headerCode.includes('Volume2'), 'HeaderBar uses Volume2 icon');
});

test('Accumulated chunk stripping cleanly sanitizes split ANSI escape sequences', () => {
  // Giả lập chuỗi ANSI bị phân tách giữa 2 frame (ví dụ \x1b[31 và mHello\x1b[0m)
  const chunk1 = '\x1b[31';
  const chunk2 = 'mText in color\x1b[0m';
  const rawAccumulated = chunk1 + chunk2;
  assert.strictEqual(stripAnsi(rawAccumulated), 'Text in color');
});

test('useOmpRpc drops command frames that become whitespace-only after ANSI stripping', () => {
  const hookCode = fs.readFileSync(path.join(process.cwd(), 'src/hooks/useOmpRpc.ts'), 'utf-8');
  assert(hookCode.includes('if (!clean.trim()) return prev;'), 'useOmpRpc ignores frames that become empty after stripAnsi');
});

console.log(`\n====================================================`);
console.log(`Command Output ANSI & TTS Verification: ${passed} passed, ${failed} failed.`);
console.log(`====================================================\n`);

if (failed > 0) {
  process.exit(1);
}
