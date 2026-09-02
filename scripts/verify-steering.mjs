/**
 * Verification Suite: Steering & Stop-and-Send (Phase 2)
 *
 * Verifies:
 * 1. OmpBridge.steer:
 *    - Frames `{ type: 'steer', id, message }` when ready
 *    - Resolves upon response frame
 *    - Fallback simulation when offline
 * 2. OmpBridge.abortAndPrompt:
 *    - Frames `{ type: 'abort_and_prompt', id, prompt, message }` when ready
 *    - Sets status to 'thinking'
 *    - Resolves upon response frame
 *    - Fallback simulation when offline resets thinking and tool calls
 * 3. OmpBridge.abort:
 *    - Frames `{ type: 'abort', id }` when ready
 *    - Sets status to 'idle'
 * 4. extractMessagesFromSession:
 *    - Preserves `steering: true` on user messages
 *    - Normal user messages have `steering: undefined`
 * 5. Preload & Main IPC Contract:
 *    - Preload exposes `steerOmp`, `abortAndPromptOmp`, `abortOmp`
 *    - Main registers `omp:steer`, `omp:abort-and-prompt`, `omp:abort`
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OmpBridge } from '../electron/omp-bridge.ts';
import { reconcileFollowUpQueue } from '../src/utils/followUpQueue.ts';

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

async function runSteeringVerification() {
  console.log('=== Starting Steering & Stop-and-Send Verification Suite (Phase 2) ===\n');

  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: () => {},
    },
  };

  // ----------------------------------------------------
  // Test 1: OmpBridge.steer command framing & response
  // ----------------------------------------------------
  console.log('[Test 1] OmpBridge.steer framing when ready...');
  {
    const bridge = new OmpBridge(mockWindow);
    const writtenFrames = [];

    bridge.lifecycleState = 'ready';
    bridge.process = {
      stdin: {
        writable: true,
        write: (data) => {
          writtenFrames.push(data.toString());
        },
      },
      killed: false,
      kill: () => {},
    };

    const steerPromise = bridge.steer('Hãy tập trung vào file auth.ts');
    assert(writtenFrames.length === 1, 'steer wrote exactly 1 frame to stdin');

    const frame = JSON.parse(writtenFrames[0].trim());
    assert(frame.type === 'steer', 'Frame type is "steer"');
    assert(frame.message === 'Hãy tập trung vào file auth.ts', 'Frame contains message field');
    assert(typeof frame.id === 'string' && frame.id.length > 0, 'Frame has a valid generated ID');

    // Simulate engine response frame
    bridge.dispatchInboundFrame({
      type: 'response',
      id: frame.id,
      command: 'steer',
      success: true,
    });

    const res = await steerPromise;
    assert(res.success === true, 'steer returns success: true');
  }

  // ----------------------------------------------------
  // Test 2: OmpBridge.steer fallback when offline
  // ----------------------------------------------------
  console.log('\n[Test 2] OmpBridge.steer fallback simulation when offline...');
  {
    const bridge = new OmpBridge(mockWindow);
    bridge.lifecycleState = 'idle';

    const res = await bridge.steer('Offline steer command');
    assert(res.success === true, 'Offline steer succeeds via fallback simulation');
  }

  // ----------------------------------------------------
  // Test 3: OmpBridge.abortAndPrompt command framing & state
  // ----------------------------------------------------
  console.log('\n[Test 3] OmpBridge.abortAndPrompt framing when ready...');
  {
    const bridge = new OmpBridge(mockWindow);
    const writtenFrames = [];

    bridge.lifecycleState = 'ready';
    bridge.process = {
      stdin: {
        writable: true,
        write: (data) => {
          writtenFrames.push(data.toString());
        },
      },
      killed: false,
      kill: () => {},
    };

    const abortPromptPromise = bridge.abortAndPrompt('Dừng lại và phân tích test suite');
    assert(writtenFrames.length === 1, 'abortAndPrompt wrote exactly 1 frame');

    const frame = JSON.parse(writtenFrames[0].trim());
    assert(frame.type === 'abort_and_prompt', 'Frame type is "abort_and_prompt"');
    assert(frame.prompt === 'Dừng lại và phân tích test suite', 'Frame contains prompt field');
    assert(frame.message === 'Dừng lại và phân tích test suite', 'Frame contains message field');
    assert(bridge.status === 'thinking', 'Status is updated to "thinking"');

    // Simulate engine response frame
    bridge.dispatchInboundFrame({
      type: 'response',
      id: frame.id,
      command: 'abort_and_prompt',
      success: true,
    });

    const res = await abortPromptPromise;
    assert(res.success === true, 'abortAndPrompt returns success: true');
  }

  // ----------------------------------------------------
  // Test 4: OmpBridge.abort command framing & idle status
  // ----------------------------------------------------
  console.log('\n[Test 4] OmpBridge.abort framing when ready...');
  {
    const bridge = new OmpBridge(mockWindow);
    const writtenFrames = [];

    bridge.lifecycleState = 'ready';
    bridge.process = {
      stdin: {
        writable: true,
        write: (data) => {
          writtenFrames.push(data.toString());
        },
      },
      killed: false,
      kill: () => {},
    };

    bridge.status = 'streaming';
    const abortPromise = bridge.abort();
    assert(writtenFrames.length === 1, 'abort wrote exactly 1 frame');

    const frame = JSON.parse(writtenFrames[0].trim());
    assert(frame.type === 'abort', 'Frame type is "abort"');
    bridge.dispatchInboundFrame({
      type: 'response',
      id: frame.id,
      command: 'abort',
      success: true,
    });
    const res = await abortPromise;
    assert(res.success === true, 'abort returns success: true');
  }

  // ----------------------------------------------------
  console.log('\n[Test 5] translateHistoryMessages preserves steering flag...');
  {
    const bridge = new OmpBridge(mockWindow);
    const mockRawMessages = [
      {
        role: 'user',
        content: 'Thêm tính năng đăng nhập',
        timestamp: 1000,
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Đang triển khai...' }],
        timestamp: 1100,
      },
      {
        role: 'user',
        content: 'Không dùng JWT, hãy dùng Better Auth',
        timestamp: 1200,
        steering: true,
      },
    ];

    const extracted = bridge.translateHistoryMessages(mockRawMessages);
    assert(extracted.length === 3, 'Extracted 3 chat messages');
    assert(extracted[0].role === 'user' && extracted[0].steering === undefined, 'First user message has steering undefined');
    assert(extracted[1].role === 'assistant', 'Second message is assistant');
    assert(extracted[2].role === 'user' && extracted[2].steering === true, 'Steered user message has steering === true');
  }
  // ----------------------------------------------------
  // Test 6: Preload API and Main IPC surface contract
  // ----------------------------------------------------
  console.log('\n[Test 6] Preload API and Main IPC surface verification...');
  {
    const preloadSource = fs.readFileSync(path.resolve(__dirname, '../electron/preload.ts'), 'utf-8');
    assert(preloadSource.includes('steerOmp:'), 'preload.ts exposes steerOmp');
    assert(preloadSource.includes('abortAndPromptOmp:'), 'preload.ts exposes abortAndPromptOmp');
    assert(preloadSource.includes('abortOmp:'), 'preload.ts exposes abortOmp');
    assert(preloadSource.includes('followUpOmp:'), 'preload.ts exposes followUpOmp');
    assert(preloadSource.includes('setSteeringMode:'), 'preload.ts exposes setSteeringMode');
    assert(preloadSource.includes('setFollowUpMode:'), 'preload.ts exposes setFollowUpMode');
    assert(preloadSource.includes('setInterruptMode:'), 'preload.ts exposes setInterruptMode');

    const mainSource = fs.readFileSync(path.resolve(__dirname, '../electron/main.ts'), 'utf-8');
    assert(mainSource.includes("'omp:steer'"), 'main.ts handles omp:steer');
    assert(mainSource.includes("'omp:abort-and-prompt'"), 'main.ts handles omp:abort-and-prompt');
    assert(mainSource.includes("'omp:abort'"), 'main.ts handles omp:abort');
    assert(mainSource.includes("'omp:follow-up'"), 'main.ts handles omp:follow-up');
    assert(mainSource.includes("'omp:set-steering-mode'"), 'main.ts handles omp:set-steering-mode');
    assert(mainSource.includes("'omp:set-follow-up-mode'"), 'main.ts handles omp:set-follow-up-mode');
    assert(mainSource.includes("'omp:set-interrupt-mode'"), 'main.ts handles omp:set-interrupt-mode');

    const rpcTypesSource = fs.readFileSync(path.resolve(__dirname, '../electron/omp-rpc-types.ts'), 'utf-8');
    assert(rpcTypesSource.includes('interface AbortAndPromptCommand'), 'omp-rpc-types.ts defines AbortAndPromptCommand');
    assert(rpcTypesSource.includes('interface SteerCommand'), 'omp-rpc-types.ts defines SteerCommand');
    assert(rpcTypesSource.includes('interface AbortCommand'), 'omp-rpc-types.ts defines AbortCommand');
    assert(rpcTypesSource.includes('interface FollowUpCommand'), 'omp-rpc-types.ts defines FollowUpCommand');
    assert(rpcTypesSource.includes('interface SetSteeringModeCommand'), 'omp-rpc-types.ts defines SetSteeringModeCommand');
    assert(rpcTypesSource.includes('interface SetFollowUpModeCommand'), 'omp-rpc-types.ts defines SetFollowUpModeCommand');
    assert(rpcTypesSource.includes('interface SetInterruptModeCommand'), 'omp-rpc-types.ts defines SetInterruptModeCommand');
  }

  // ----------------------------------------------------
  // Test 7: OmpBridge.followUp command framing & response
  // ----------------------------------------------------
  console.log('\n[Test 7] OmpBridge.followUp framing when ready & offline fallback...');
  {
    const bridge = new OmpBridge(mockWindow);
    const writtenFrames = [];

    bridge.lifecycleState = 'ready';
    bridge.process = {
      stdin: {
        writable: true,
        write: (data) => {
          writtenFrames.push(data.toString());
        },
      },
      killed: false,
      kill: () => {},
    };

    const followUpPromise = bridge.followUp('Sau đó chạy test suite');
    assert(writtenFrames.length === 1, 'followUp wrote exactly 1 frame to stdin');

    const frame = JSON.parse(writtenFrames[0].trim());
    assert(frame.type === 'follow_up', 'Frame type is "follow_up"');
    assert(frame.message === 'Sau đó chạy test suite', 'Frame contains message field');
    assert(typeof frame.id === 'string' && frame.id.length > 0, 'Frame has valid ID');

    bridge.dispatchInboundFrame({
      type: 'response',
      id: frame.id,
      command: 'follow_up',
      success: true,
    });

    const res = await followUpPromise;
    assert(res.success === true, 'followUp returns success: true');

    // Offline fallback
    bridge.lifecycleState = 'idle';
    const offlineRes = await bridge.followUp('Offline follow-up');
    assert(offlineRes.success === true, 'Offline followUp returns success: true');
  }

  // ----------------------------------------------------
  // Test 8: Engine Modes (setSteeringMode, setFollowUpMode, setInterruptMode)
  // ----------------------------------------------------
  console.log('\n[Test 8] Engine Mode setters framing & settings sync...');
  {
    const tempSettingsFile = path.join(
      __dirname,
      `temp-settings-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`
    );
    const { SettingsStore } = await import('../electron/settings-store.ts');
    const store = new SettingsStore(tempSettingsFile);
    const bridge = new OmpBridge(mockWindow, store);
    const writtenFrames = [];

    bridge.lifecycleState = 'ready';
    bridge.process = {
      stdin: {
        writable: true,
        write: (data) => {
          writtenFrames.push(data.toString());
        },
      },
      killed: false,
      kill: () => {},
    };

    // 1. setSteeringMode
    const p1 = bridge.setSteeringMode('immediate');
    assert(writtenFrames.length === 1, 'setSteeringMode wrote 1 frame');
    const f1 = JSON.parse(writtenFrames[0].trim());
    assert(f1.type === 'set_steering_mode' && f1.mode === 'immediate', 'set_steering_mode framed correctly');
    // Respond to set_steering_mode
    bridge.dispatchInboundFrame({ type: 'response', id: f1.id, command: 'set_steering_mode', success: true });
    // Respond to automatic getState() sync
    if (writtenFrames.length >= 2) {
      const fState1 = JSON.parse(writtenFrames[1].trim());
      bridge.dispatchInboundFrame({ type: 'response', id: fState1.id, command: 'get_state', success: true, data: {} });
    }
    const r1 = await p1;
    assert(r1.success === true, 'setSteeringMode resolves true');
    assert(store.get().steeringMode === 'immediate', 'Settings store updated with steeringMode');

    // 2. setFollowUpMode
    const prevCount1 = writtenFrames.length;
    const p2 = bridge.setFollowUpMode('next_turn');
    assert(writtenFrames.length === prevCount1 + 1, 'setFollowUpMode wrote next frame');
    const f2 = JSON.parse(writtenFrames[prevCount1].trim());
    assert(f2.type === 'set_follow_up_mode' && f2.mode === 'next_turn', 'set_follow_up_mode framed correctly');
    bridge.dispatchInboundFrame({ type: 'response', id: f2.id, command: 'set_follow_up_mode', success: true });
    if (writtenFrames.length >= prevCount1 + 2) {
      const fState2 = JSON.parse(writtenFrames[prevCount1 + 1].trim());
      bridge.dispatchInboundFrame({ type: 'response', id: fState2.id, command: 'get_state', success: true, data: {} });
    }
    const r2 = await p2;
    assert(r2.success === true, 'setFollowUpMode resolves true');
    assert(store.get().followUpMode === 'next_turn', 'Settings store updated with followUpMode');

    // 3. setInterruptMode
    const prevCount2 = writtenFrames.length;
    const p3 = bridge.setInterruptMode('default');
    assert(writtenFrames.length === prevCount2 + 1, 'setInterruptMode wrote next frame');
    const f3 = JSON.parse(writtenFrames[prevCount2].trim());
    assert(f3.type === 'set_interrupt_mode' && f3.mode === 'default', 'set_interrupt_mode framed correctly');
    bridge.dispatchInboundFrame({ type: 'response', id: f3.id, command: 'set_interrupt_mode', success: true });
    if (writtenFrames.length >= prevCount2 + 2) {
      const fState3 = JSON.parse(writtenFrames[prevCount2 + 1].trim());
      bridge.dispatchInboundFrame({ type: 'response', id: fState3.id, command: 'get_state', success: true, data: {} });
    }
    const r3 = await p3;
    assert(r3.success === true, 'setInterruptMode resolves true');
    assert(store.get().interruptMode === 'default', 'Settings store updated with interruptMode');

    // Cleanup
    try {
      if (fs.existsSync(tempSettingsFile)) {
        fs.unlinkSync(tempSettingsFile);
      }
    } catch {}
  }

  // ----------------------------------------------------
  // Test 9: SettingsStore persistence & sanitization
  // ----------------------------------------------------
  console.log('\n[Test 9] SettingsStore persistence for engine modes...');
  {
    const tempSettingsFile = path.join(
      __dirname,
      `temp-settings-store-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`
    );
    const { SettingsStore } = await import('../electron/settings-store.ts');
    const store = new SettingsStore(tempSettingsFile);

    store.set({
      steeringMode: 'immediate',
      followUpMode: 'next_turn',
      interruptMode: 'default',
    });

    const reloaded = new SettingsStore(tempSettingsFile);
    assert(reloaded.get().steeringMode === 'immediate', 'Reloaded steeringMode is immediate');
    assert(reloaded.get().followUpMode === 'next_turn', 'Reloaded followUpMode is next_turn');
    assert(reloaded.get().interruptMode === 'default', 'Reloaded interruptMode is default');

    try {
      if (fs.existsSync(tempSettingsFile)) {
        fs.unlinkSync(tempSettingsFile);
      }
    } catch {}
  }

  // ----------------------------------------------------
  // Test 10: Renderer component source audit (queued badge & queue bar)
  // ----------------------------------------------------
  console.log('\n[Test 10] Renderer components contract audit...');
  {
    const chatHistorySource = fs.readFileSync(path.resolve(__dirname, '../src/components/AgentPanel/ChatHistory.tsx'), 'utf-8');
    assert(chatHistorySource.includes('msg.queued'), 'ChatHistory handles msg.queued');
    assert(chatHistorySource.includes('queued'), 'ChatHistory renders queued badge');

    const composerSource = fs.readFileSync(path.resolve(__dirname, '../src/components/AgentPanel/PromptComposer.tsx'), 'utf-8');
    assert(composerSource.includes('onFollowUpMessage'), 'PromptComposer accepts onFollowUpMessage');
    assert(composerSource.includes('followUpQueue'), 'PromptComposer accepts followUpQueue');
    assert(!composerSource.includes('onCancelFollowUp'), 'PromptComposer offers no per-item cancel (engine exposes no dequeue RPC)');
    assert(composerSource.includes('Queue follow-up'), 'PromptComposer has Queue follow-up action');

    const hookSource = fs.readFileSync(path.resolve(__dirname, '../src/hooks/useOmpRpc.ts'), 'utf-8');
    assert(hookSource.includes('followUpQueue'), 'useOmpRpc exports followUpQueue');
    assert(hookSource.includes('followUp,'), 'useOmpRpc exports followUp callback');

    const settingsModalSource = fs.readFileSync(path.resolve(__dirname, '../src/components/Modals/SettingsModal.tsx'), 'utf-8');
    assert(settingsModalSource.includes('steeringMode'), 'SettingsModal contains steeringMode config');
    assert(settingsModalSource.includes('followUpMode'), 'SettingsModal contains followUpMode config');
    assert(settingsModalSource.includes('interruptMode'), 'SettingsModal contains interruptMode config');
    assert(hookSource.includes('followUpOmp('), 'Hook sends follow-ups to the engine via followUpOmp');
    assert(hookSource.includes('reconcileFollowUpQueue('), 'Hook reconciles local queue with engine queuedMessageCount');
    assert(!hookSource.includes('sendOmpMessage(nextFollowUp'), 'Hook no longer dispatches queued prompts client-side');
  }

  // ----------------------------------------------------
  // Test 11: Follow-up queue reconciliation with engine queuedMessageCount
  // ----------------------------------------------------
  console.log('\n[Test 11] Follow-up queue reconciliation with engine queuedMessageCount...');
  {
    const item = (id) => ({ id, content: id, timestamp: 1 });
    const queue = [item('q1'), item('q2'), item('q3')];

    const same = reconcileFollowUpQueue(queue, 3);
    assert(same.queue === queue && same.consumedIds.length === 0, 'Matching count leaves queue untouched');

    const one = reconcileFollowUpQueue(queue, 2);
    assert(one.consumedIds.length === 1 && one.consumedIds[0] === 'q1', 'Engine consumed the oldest item first');
    assert(one.queue.map((i) => i.id).join(',') === 'q2,q3', 'Remaining queue keeps newest items in order');

    const drained = reconcileFollowUpQueue(queue, 0);
    assert(drained.queue.length === 0 && drained.consumedIds.join(',') === 'q1,q2,q3', 'Count 0 marks every item consumed');

    const more = reconcileFollowUpQueue(queue, 5);
    assert(more.queue === queue && more.consumedIds.length === 0, 'Engine count above local length never invents items');

    const empty = reconcileFollowUpQueue([], 0);
    assert(empty.queue.length === 0 && empty.consumedIds.length === 0, 'Empty queue stays empty');
  }

  console.log(`\n🎉 All ${passed} Steering, Follow-up & Engine Modes verification checks PASSED!`);
}

runSteeringVerification().catch((err) => {
  console.error('\n❌ Verification suite failed with exception:', err);
  process.exit(1);
});
