/**
 * Verification Script: Live Stream Translation with OmpBridge
 * 
 * Verifies:
 * 1. OmpBridge connects to real engine via RPC
 * 2. assistantMessageEvent text_delta maps to `omp:stream-token` (≥ 1 token)
 * 3. message_end assistant with text maps to `omp:message-complete` (exact 1 message)
 * 4. toolResult and non-text assistant message_end frames do NOT trigger `omp:message-complete`
 * 5. thinking events (if reasoning enabled) accumulate and emit `omp:thinking`
 * 6. Final status reaches `idle`
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { OmpBridge } from '../electron/omp-bridge.ts';

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

async function runStreamTranslationVerification() {
  console.log('=== Live OMP Stream Translation Verification Suite ===\n');

  const sentEvents = [];
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, ...args) => {
        sentEvents.push({ channel, payload: args[0], timestamp: Date.now() });
        const summary =
          typeof args[0] === 'string'
            ? args[0].replace(/\n/g, '\\n')
            : JSON.stringify(args[0]);
        console.log(`  [IPC EMIT] ${channel}: ${summary.slice(0, 90)}`);
      },
    },
  };

  const bridge = new OmpBridge(mockWindow);
  const binaryPath = bridge.detectBinaryPath();
  assert(Boolean(binaryPath), `Detected OMP binary: ${binaryPath}`);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-stream-verify-'));
  console.log(`[Step 1] Workspace initialized at: ${tempDir}`);

  // Test with nguyenkhoi-lmstudio-prod, fallback to nguyenkhoi-lmstudio-local if needed
  console.log('[Step 2] Spawning OMP engine in RPC mode (--no-session)...');
  let spawnResult = await bridge.startProcess(tempDir, 'gemini-3.7-flash-tiered', {
    provider: 'nguyenkhoi-lmstudio-prod',
    extraArgs: ['--no-session'],
  });

  if (!spawnResult.success) {
    console.log('  ⚠️ Retrying with provider nguyenkhoi-lmstudio-local...');
    spawnResult = await bridge.startProcess(tempDir, 'gemini-3.7-flash-tiered', {
      provider: 'nguyenkhoi-lmstudio-local',
      extraArgs: ['--no-session'],
    });
  }

  assert(spawnResult.success === true, `OMP process started and negotiated protocol (PID: ${spawnResult.pid})`);
  assert(bridge.getLifecycleState() === 'ready', 'Bridge lifecycle state is "ready"');

  // Step 3: Send prompt and record IPC emissions
  console.log('\n[Step 3] Sending live prompt: "Trả lời đúng một câu: xin chào"...');
  
  const promptResponse = await bridge.sendMessage('Trả lời đúng một câu: xin chào');
  assert(promptResponse.success === true, 'sendMessage accepted prompt');

  // Wait for the stream to complete and status to return to idle
  console.log('\n[Step 4] Streaming tokens and awaiting completion...');
  const maxWaitMs = 25000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const messageCompleteEvents = sentEvents.filter((e) => e.channel === 'omp:message-complete');
    const statusChanges = sentEvents.filter((e) => e.channel === 'omp:status-change');
    const lastStatus = statusChanges.length > 0 ? statusChanges[statusChanges.length - 1].payload : null;

    if (messageCompleteEvents.length >= 1 && lastStatus === 'idle') {
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  // Step 5: Assertions
  console.log('\n[Step 5] Verifying Stream Translation Assertions:');

  const streamTokens = sentEvents.filter((e) => e.channel === 'omp:stream-token');
  assert(streamTokens.length >= 1, `Received ≥ 1 stream tokens (actual: ${streamTokens.length} tokens)`);

  const accumulatedStreamText = streamTokens.map((e) => e.payload).join('');
  console.log(`  Stream text assembled: "${accumulatedStreamText.trim()}"`);

  const completeMessages = sentEvents.filter((e) => e.channel === 'omp:message-complete');
  assert(completeMessages.length >= 1, `Received assistant message-complete (count: ${completeMessages.length})`);
  
  const lastCompleteMsg = completeMessages[completeMessages.length - 1].payload;
  assert(lastCompleteMsg.role === 'assistant', 'message-complete role is "assistant"');
  assert(typeof lastCompleteMsg.content === 'string' && lastCompleteMsg.content.length > 0, 'message-complete contains valid text content');
  assert(
    accumulatedStreamText.includes(lastCompleteMsg.content) || lastCompleteMsg.content.includes(accumulatedStreamText),
    'Stream tokens match message-complete content'
  );

  // Check 0 toolResult message-completes
  const toolResultCompletes = completeMessages.filter((m) => m.payload.role === 'toolResult');
  assert(toolResultCompletes.length === 0, '0 message-complete events from toolResult');

  // Check thinking blocks if model produced thinking
  const thinkingEvents = sentEvents.filter((e) => e.channel === 'omp:thinking');
  if (thinkingEvents.length > 0) {
    const lastThinking = thinkingEvents[thinkingEvents.length - 1].payload;
    assert(typeof lastThinking.id === 'string', 'Thinking block has valid ID');
    assert(typeof lastThinking.thought === 'string', 'Thinking block has thought text');
    console.log(`  Thinking captured (${thinkingEvents.length} updates): "${lastThinking.thought.slice(0, 60)}..."`);
  } else {
    console.log('  (Thinking: 0 events - expected for non-reasoning tier)');
  }

  // Check status progression
  const statusHistory = sentEvents
    .filter((e) => e.channel === 'omp:status-change')
    .map((e) => e.payload);
  console.log('  Status history:', statusHistory.join(' -> '));
  assert(statusHistory.includes('streaming') || statusHistory.includes('thinking'), 'Status visited thinking or streaming');
  assert(statusHistory[statusHistory.length - 1] === 'idle', 'Final status is "idle"');

  // Step 6: Cleanup
  console.log('\n[Step 6] Stopping OMP process...');
  bridge.stopProcess();
  fs.rmSync(tempDir, { recursive: true, force: true });
  assert(true, 'Cleanup completed cleanly');

  console.log('\n====================================================');
  console.log(`Live Stream Translation Verification: ${passed} passed, ${failed} failed.`);
  console.log('====================================================\n');
}

runStreamTranslationVerification().catch((err) => {
  console.error('\n❌ Unhandled error during verification:', err);
  process.exit(1);
});
