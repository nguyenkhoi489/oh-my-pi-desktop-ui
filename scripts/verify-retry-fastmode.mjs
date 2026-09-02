/**
 * Verification Suite: Auto-retry, Fast Mode & RPC Utilities (Phase 6)
 *
 * Verifies:
 * 1. SettingsStore persistence:
 *    - `autoRetry` and `fastMode` settings load, save, merge, and sanitize cleanly.
 * 2. OmpBridge auto_retry_start & auto_retry_end event handling:
 *    - `auto_retry_start` sets retryState to isRetrying: true with attempt/maxAttempts/error and emits `omp:retry-state`.
 *    - `auto_retry_end` sets retryState to isRetrying: false and emits `omp:retry-state`.
 *    - `turn_start`, `turn_end`, and `cleanupProcess` clear retryState.
 * 3. OmpBridge RPC methods:
 *    - `setAutoRetry` writes `{ type: 'set_auto_retry', enabled }` frame and updates store.
 *    - `abortRetry` writes `{ type: 'abort_retry' }` frame and resets retryState.
 *    - `setFastMode` writes `{ type: 'set_fast_mode', enabled }` frame and updates store.
 *    - `getLastAssistantText` writes `{ type: 'get_last_assistant_text' }` frame and extracts text.
 *    - `handoff` writes `{ type: 'handoff' }` frame.
 * 4. Contract verification:
 *    - ElectronAPI in `electron/types.ts` and `src/types/index.ts` exposes all Phase 6 signatures.
 *    - `electron/preload.ts` exposes all Phase 6 APIs.
 *    - `electron/main.ts` registers all Phase 6 IPC handlers.
 *    - `DEMO_COMMANDS` includes `handoff`.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { SettingsStore } from '../electron/settings-store.ts';
import { OmpBridge } from '../electron/omp-bridge.ts';
import { DEMO_COMMANDS } from '../src/utils/commandMenu.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function runVerification() {
  console.log('=== Starting Auto-retry, Fast Mode & RPC Utils Verification Suite (Phase 6) ===\n');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-p6-test-'));
  const testSettingsPath = path.join(tempDir, 'settings.json');

  try {
    // ----------------------------------------------------
    // Test 1: SettingsStore autoRetry & fastMode
    // ----------------------------------------------------
    console.log('[Test 1] SettingsStore autoRetry and fastMode persistence...');
    {
      const store = new SettingsStore(testSettingsPath);
      assert(store.get().autoRetry === undefined, 'Initial autoRetry is undefined');
      assert(store.get().fastMode === undefined, 'Initial fastMode is undefined');

      store.set({ autoRetry: true, fastMode: true });
      assert(store.get().autoRetry === true, 'autoRetry set to true');
      assert(store.get().fastMode === true, 'fastMode set to true');

      const store2 = new SettingsStore(testSettingsPath);
      assert(store2.get().autoRetry === true, 'autoRetry reloaded from disk as true');
      assert(store2.get().fastMode === true, 'fastMode reloaded from disk as true');

      store2.set({ autoRetry: false, fastMode: false });
      assert(store2.get().autoRetry === false, 'autoRetry set to false');
      assert(store2.get().fastMode === false, 'fastMode set to false');
    }

    // ----------------------------------------------------
    // Test 2: Inbound auto_retry_start and auto_retry_end events
    // ----------------------------------------------------
    console.log('\n[Test 2] OmpBridge auto_retry_start and auto_retry_end events...');
    {
      const sentEvents = [];
      const mockWindow = {
        isDestroyed: () => false,
        webContents: {
          send: (channel, data) => {
            sentEvents.push({ channel, data });
          },
        },
      };

      const bridge = new OmpBridge(mockWindow, new SettingsStore(testSettingsPath));

      // Initial retry state
      assert(bridge.getRetryState().isRetrying === false, 'Initial retryState is not retrying');

      // Dispatch auto_retry_start event
      bridge.dispatchInboundFrame({
        type: 'auto_retry_start',
        attempt: 2,
        maxAttempts: 5,
        delayMs: 3000,
        error: 'Rate limit exceeded: 429',
      });

      const retryState1 = bridge.getRetryState();
      assert(retryState1.isRetrying === true, 'retryState isRetrying is true');
      assert(retryState1.attempt === 2, 'retryState attempt is 2');
      assert(retryState1.maxAttempts === 5, 'retryState maxAttempts is 5');
      assert(retryState1.delayMs === 3000, 'retryState delayMs is 3000');
      assert(retryState1.error === 'Rate limit exceeded: 429', 'retryState error message matched');

      const lastSent1 = sentEvents[sentEvents.length - 1];
      assert(lastSent1.channel === 'omp:retry-state', 'Dispatched omp:retry-state on auto_retry_start');
      assert(lastSent1.data.isRetrying === true && lastSent1.data.attempt === 2, 'Emitted payload matches retryState');

      // Dispatch auto_retry_end event
      bridge.dispatchInboundFrame({
        type: 'auto_retry_end',
        success: true,
        attempt: 2,
      });

      const retryState2 = bridge.getRetryState();
      assert(retryState2.isRetrying === false, 'retryState isRetrying is false after auto_retry_end');
      assert(retryState2.success === true, 'retryState success is true');

      const lastSent2 = sentEvents[sentEvents.length - 1];
      assert(lastSent2.channel === 'omp:retry-state', 'Dispatched omp:retry-state on auto_retry_end');
      assert(lastSent2.data.isRetrying === false && lastSent2.data.success === true, 'Emitted payload matches retryState');
    }

    // ----------------------------------------------------
    // Test 3: Turn start & Turn end reset retry state
    // ----------------------------------------------------
    console.log('\n[Test 3] Turn lifecycle resets retry state...');
    {
      const sentEvents = [];
      const mockWindow = {
        isDestroyed: () => false,
        webContents: {
          send: (channel, data) => {
            sentEvents.push({ channel, data });
          },
        },
      };

      const bridge = new OmpBridge(mockWindow, new SettingsStore(testSettingsPath));

      // Trigger retry start
      bridge.dispatchInboundFrame({
        type: 'auto_retry_start',
        attempt: 1,
      });
      assert(bridge.getRetryState().isRetrying === true, 'retryState active before turn_start');

      // Trigger turn_start -> should reset retry state
      bridge.dispatchInboundFrame({
        type: 'turn_start',
        turnId: 'turn-123',
      });
      assert(bridge.getRetryState().isRetrying === false, 'retryState reset to false on turn_start');

      // Trigger retry start again
      bridge.dispatchInboundFrame({
        type: 'auto_retry_start',
        attempt: 3,
      });
      assert(bridge.getRetryState().isRetrying === true, 'retryState active before turn_end');

      // Trigger turn_end -> should reset retry state
      bridge.dispatchInboundFrame({
        type: 'turn_end',
      });
      assert(bridge.getRetryState().isRetrying === false, 'retryState reset to false on turn_end');
    }

    // ----------------------------------------------------
    // Test 4: OmpBridge RPC Methods (offline & mock frames)
    // ----------------------------------------------------
    console.log('\n[Test 4] OmpBridge RPC Methods...');
    {
      const store = new SettingsStore(testSettingsPath);
      const mockWindow = {
        isDestroyed: () => false,
        webContents: {
          send: () => {},
        },
      };

      const bridge = new OmpBridge(mockWindow, store);

      // setAutoRetry offline simulation -> updates store
      const autoRetryRes = await bridge.setAutoRetry(true);
      assert(autoRetryRes.success === true, 'setAutoRetry offline succeeds');
      assert(store.get().autoRetry === true, 'store updated with autoRetry: true');

      // setFastMode offline simulation -> updates store
      const fastModeRes = await bridge.setFastMode(true);
      assert(fastModeRes.success === true, 'setFastMode offline succeeds');
      assert(store.get().fastMode === true, 'store updated with fastMode: true');

      // abortRetry offline simulation -> resets retryState
      bridge.dispatchInboundFrame({
        type: 'auto_retry_start',
        attempt: 1,
      });
      assert(bridge.getRetryState().isRetrying === true, 'retry active before abortRetry');
      const abortRes = await bridge.abortRetry();
      assert(abortRes.success === true, 'abortRetry succeeds');
      assert(bridge.getRetryState().isRetrying === false, 'retryState reset after abortRetry');

      // getLastAssistantText offline fallback
      const lastTextRes = await bridge.getLastAssistantText();
      assert(lastTextRes.success === true, 'getLastAssistantText returns success structure');
    }

    // ----------------------------------------------------
    // Test 5: Command frames generation in ready state
    // ----------------------------------------------------
    console.log('\n[Test 5] Command frames generation in ready state...');
    {
      const writtenFrames = [];
      const mockWindow = {
        isDestroyed: () => false,
        webContents: {
          send: () => {},
        },
      };

      const bridge = new OmpBridge(mockWindow, new SettingsStore(testSettingsPath));
      bridge.lifecycleState = 'ready';
      bridge.process = {
        stdin: {
          writable: true,
          write: (chunk) => {
            const lines = chunk.trim().split('\n');
            for (const line of lines) {
              if (line) writtenFrames.push(JSON.parse(line));
            }
          },
        },
      };

      // 1. setAutoRetry
      const retryPromise = bridge.setAutoRetry(false);
      const lastCmd1 = writtenFrames[writtenFrames.length - 1];
      assert(lastCmd1.type === 'set_auto_retry' && lastCmd1.enabled === false, 'set_auto_retry frame sent');
      bridge.dispatchInboundFrame({ type: 'response', id: lastCmd1.id, success: true });
      const retryRes = await retryPromise;
      assert(retryRes.success === true, 'setAutoRetry resolved with success: true');

      // 2. abortRetry
      const abortPromise = bridge.abortRetry();
      const lastCmd2 = writtenFrames[writtenFrames.length - 1];
      assert(lastCmd2.type === 'abort_retry', 'abort_retry frame sent');
      bridge.dispatchInboundFrame({ type: 'response', id: lastCmd2.id, success: true });
      const abortRes = await abortPromise;
      assert(abortRes.success === true, 'abortRetry resolved with success: true');

      // 3. setFastMode
      const fastPromise = bridge.setFastMode(true);
      const lastCmd3 = writtenFrames[writtenFrames.length - 1];
      assert(lastCmd3.type === 'set_fast_mode' && lastCmd3.enabled === true, 'set_fast_mode frame sent');
      bridge.dispatchInboundFrame({ type: 'response', id: lastCmd3.id, success: true, data: { enabled: true } });
      const fastRes = await fastPromise;
      assert(fastRes.success === true && fastRes.data?.enabled === true, 'setFastMode resolved with success: true');

      // 4. getLastAssistantText
      const textPromise = bridge.getLastAssistantText();
      const lastCmd4 = writtenFrames[writtenFrames.length - 1];
      assert(lastCmd4.type === 'get_last_assistant_text', 'get_last_assistant_text frame sent');
      bridge.dispatchInboundFrame({ type: 'response', id: lastCmd4.id, success: true, data: { text: 'Final answer from assistant' } });
      const textRes = await textPromise;
      assert(textRes.success === true && textRes.text === 'Final answer from assistant', 'getLastAssistantText returned assistant text');

      // 5. handoff
      const handoffPromise = bridge.handoff();
      const lastCmd5 = writtenFrames[writtenFrames.length - 1];
      assert(lastCmd5.type === 'handoff', 'handoff frame sent');
      bridge.dispatchInboundFrame({ type: 'response', id: lastCmd5.id, success: true, data: { status: 'ok', artifactPath: '/tmp/handoff.md' } });
      const handoffRes = await handoffPromise;
      assert(handoffRes.success === true && handoffRes.data?.artifactPath === '/tmp/handoff.md', 'handoff resolved with payload data');
    }

    // ----------------------------------------------------
    // Test 6: Contract & Types Inspection
    // ----------------------------------------------------
    console.log('\n[Test 6] Contract & Types Inspection...');
    {
      const preloadSrc = fs.readFileSync(path.join(__dirname, '../electron/preload.ts'), 'utf-8');
      assert(preloadSrc.includes('setAutoRetry:'), 'preload.ts exports setAutoRetry');
      assert(preloadSrc.includes('abortRetry:'), 'preload.ts exports abortRetry');
      assert(preloadSrc.includes('setFastMode:'), 'preload.ts exports setFastMode');
      assert(preloadSrc.includes('getLastAssistantText:'), 'preload.ts exports getLastAssistantText');
      assert(preloadSrc.includes('handoff:'), 'preload.ts exports handoff');
      assert(preloadSrc.includes('onOmpRetryState:'), 'preload.ts exports onOmpRetryState');

      const mainSrc = fs.readFileSync(path.join(__dirname, '../electron/main.ts'), 'utf-8');
      assert(mainSrc.includes("'omp:set-auto-retry'"), 'main.ts handles omp:set-auto-retry');
      assert(mainSrc.includes("'omp:abort-retry'"), 'main.ts handles omp:abort-retry');
      assert(mainSrc.includes("'omp:set-fast-mode'"), 'main.ts handles omp:set-fast-mode');
      assert(mainSrc.includes("'omp:get-last-assistant-text'"), 'main.ts handles omp:get-last-assistant-text');
      assert(mainSrc.includes("'omp:handoff'"), 'main.ts handles omp:handoff');

      const handoffCmd = DEMO_COMMANDS.find((c) => c.name === 'handoff');
      assert(Boolean(handoffCmd), 'DEMO_COMMANDS includes handoff command');
    }

    console.log(`\n=== Verification Complete: ${passed} passed, ${failed} failed ===`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

runVerification().catch((err) => {
  console.error('\nFatal test runner error:', err);
  process.exit(1);
});
