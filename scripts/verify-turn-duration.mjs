/**
 * Verification Suite: Turn Duration & Processing Time Observability (Phase 4)
 *
 * Requirements:
 * 1. Format Duration Boundary Suite:
 *    - 0ms, 450ms, 999ms -> '0ms', '450ms', '999ms'
 *    - 1000ms, 14250ms, 59900ms -> '1.0s', '14.3s', '59.9s'
 *    - 60000ms, 75000ms, 125000ms -> '1m 00s', '1m 15s', '2m 05s'
 *    - negative, NaN, undefined, null -> '--'
 * 2. Multi-Runtime Live Demux Suite:
 *    - Parallel runtimes (rt-1 active, rt-2 background).
 *    - rt-2 completes turn, patches its assistant message with measured duration.
 *    - rt-1 state and messages remain completely untouched.
 * 3. Pure patchAssistantTurnDuration & Demux Wiring Suite:
 *    - Accurate patching, immutability, role guard (skips fileMention/user), no-op on missing id.
 * 4. Abort-Before-First-Message Suite:
 *    - Abort before any assistant message arrives does not mutate prior turn messages.
 * 5. Session History Aggregation & Provenance Suite:
 *    - Translating history merges modelDurationMs across assistant blocks (3812.5 + 1540.2 = 5352.7).
 *    - Assigns durationKind: 'estimated'.
 *    - Queued user message suppresses estimated duration to avoid skewed wait times.
 * 6. File-Attachment Turn Role Guard Suite:
 *    - File attachment card (role: 'fileMention') is never stamped with turn duration.
 */

import { OmpBridge } from '../electron/omp-bridge.ts';
import { formatDuration, patchAssistantTurnDuration } from '../src/utils/timeFormat.ts';
import {
  handleRuntimeEnvelope,
  createEmptyRuntimeSession,
  saveActiveSessionToMap,
  restoreSessionFromMap,
} from '../src/utils/runtimeDemux.ts';

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

console.log('=== Starting Turn Duration Verification Suite ===\n');

// ----------------------------------------------------
// Test 1: Format Duration Boundary Suite
// ----------------------------------------------------
console.log('[Test 1] formatDuration Boundary & Formatting Suite');
{
  assert(formatDuration(0) === '0ms', 'formatDuration(0) returns "0ms"');
  assert(formatDuration(450) === '450ms', 'formatDuration(450) returns "450ms"');
  assert(formatDuration(999) === '999ms', 'formatDuration(999) returns "999ms"');

  assert(formatDuration(1000) === '1.0s', 'formatDuration(1000) returns "1.0s"');
  assert(formatDuration(14250) === '14.3s', 'formatDuration(14250) returns "14.3s"');
  assert(formatDuration(59900) === '59.9s', 'formatDuration(59900) returns "59.9s"');

  assert(formatDuration(60000) === '1m 00s', 'formatDuration(60000) returns "1m 00s"');
  assert(formatDuration(75000) === '1m 15s', 'formatDuration(75000) returns "1m 15s"');
  assert(formatDuration(125000) === '2m 05s', 'formatDuration(125000) returns "2m 05s"');
  assert(formatDuration(3661000) === '61m 01s', 'formatDuration(3661000) returns "61m 01s"');

  // Invalid / non-numeric edge cases
  assert(formatDuration(-1) === '--', 'formatDuration(-1) returns "--"');
  assert(formatDuration(-5000) === '--', 'formatDuration(-5000) returns "--"');
  assert(formatDuration(NaN) === '--', 'formatDuration(NaN) returns "--"');
  assert(formatDuration(null) === '--', 'formatDuration(null) returns "--"');
  assert(formatDuration(undefined) === '--', 'formatDuration(undefined) returns "--"');
}

// ----------------------------------------------------
// Test 2: Pure patchAssistantTurnDuration & Immutability Suite
// ----------------------------------------------------
console.log('\n[Test 2] Pure patchAssistantTurnDuration & Immutability Suite');
{
  const initialMessages = [
    { id: 'user-1', role: 'user', content: 'Do something', timestamp: 1000 },
    { id: 'asst-1', role: 'assistant', content: 'Done!', timestamp: 2000 },
    { id: 'file-1', role: 'fileMention', content: '', timestamp: 2500, files: [] },
  ];

  // 2.1 Patch matching assistant message
  const patched = patchAssistantTurnDuration(initialMessages, 'asst-1', 1450, 'measured');
  assert(patched !== initialMessages, 'patchAssistantTurnDuration returns new array reference');
  assert(patched.length === 3, 'Length remains identical');
  assert(patched[1].id === 'asst-1', 'Target message id matches');
  assert(patched[1].durationMs === 1450, 'Patches durationMs correctly');
  assert(patched[1].durationKind === 'measured', 'Patches durationKind as "measured"');
  assert(initialMessages[1].durationMs === undefined, 'Original message object is unmutated (pure function)');
  assert(patched[0] === initialMessages[0], 'Unaffected messages retain exact object identity');
  assert(patched[2] === initialMessages[2], 'Unaffected fileMention retains object identity');

  // 2.2 Null or undefined assistantId -> returns original array
  const unchangedNull = patchAssistantTurnDuration(initialMessages, null, 1450, 'measured');
  assert(unchangedNull === initialMessages, 'Returns same array reference if assistantId is null');
  const unchangedUndef = patchAssistantTurnDuration(initialMessages, undefined, 1450, 'measured');
  assert(unchangedUndef === initialMessages, 'Returns same array reference if assistantId is undefined');

  // 2.3 Non-existent assistantId -> returns original array
  const unchangedNotFound = patchAssistantTurnDuration(initialMessages, 'non-existent', 1450, 'measured');
  assert(unchangedNotFound === initialMessages, 'Returns same array reference if assistantId is not found');

  // 2.4 Role guard: if target id is a fileMention or user, do NOT patch
  const targetFileMention = patchAssistantTurnDuration(initialMessages, 'file-1', 1450, 'measured');
  assert(targetFileMention === initialMessages, 'Refuses to patch duration on non-assistant role');
  const targetUser = patchAssistantTurnDuration(initialMessages, 'user-1', 1450, 'measured');
  assert(targetUser === initialMessages, 'Refuses to patch duration on user role');
}

// ----------------------------------------------------
// Test 3: Multi-Runtime Live Demux Suite
// ----------------------------------------------------
console.log('\n[Test 3] Multi-Runtime Live Demux Suite');
{
  let runtimeMap = {
    'rt-1': createEmptyRuntimeSession('rt-1'),
    'rt-2': createEmptyRuntimeSession('rt-2'),
  };

  const activeRuntimeId = 'rt-1'; // rt-2 is background

  // 3.1 Both start turns
  runtimeMap = handleRuntimeEnvelope(runtimeMap, {
    runtimeId: 'rt-1',
    channel: 'omp:status-change',
    payload: 'thinking',
  }, activeRuntimeId);

  const t0 = Date.now() - 500;
  runtimeMap = handleRuntimeEnvelope(runtimeMap, {
    runtimeId: 'rt-2',
    channel: 'omp:status-change',
    payload: 'thinking',
  }, activeRuntimeId);

  // Manually backdate rt-2 turnStartedAt to simulate 500ms elapsed
  runtimeMap['rt-2'].turnStartedAt = t0;

  assert(runtimeMap['rt-1'].status === 'thinking', 'rt-1 status is thinking');
  assert(runtimeMap['rt-2'].status === 'thinking', 'rt-2 status is thinking');
  assert(typeof runtimeMap['rt-1'].turnStartedAt === 'number', 'rt-1 has turnStartedAt recorded');
  assert(runtimeMap['rt-2'].turnStartedAt === t0, 'rt-2 has turnStartedAt backdated');

  // 3.2 rt-2 emits assistant message
  runtimeMap = handleRuntimeEnvelope(runtimeMap, {
    runtimeId: 'rt-2',
    channel: 'omp:message-complete',
    payload: {
      id: 'asst-rt2-1',
      role: 'assistant',
      content: 'Background result',
      timestamp: Date.now(),
    },
  }, activeRuntimeId);

  assert(runtimeMap['rt-2'].messages.length === 1, 'rt-2 message recorded in background');
  assert(runtimeMap['rt-2'].currentTurnAssistantId === 'asst-rt2-1', 'rt-2 recorded currentTurnAssistantId');
  assert(runtimeMap['rt-1'].messages.length === 0, 'rt-1 messages unaffected');

  // 3.3 rt-2 transitions to idle
  runtimeMap = handleRuntimeEnvelope(runtimeMap, {
    runtimeId: 'rt-2',
    channel: 'omp:status-change',
    payload: 'idle',
  }, activeRuntimeId);

  assert(runtimeMap['rt-2'].status === 'idle', 'rt-2 is idle');
  assert(runtimeMap['rt-2'].turnStartedAt === null, 'rt-2 turnStartedAt cleared');
  assert(runtimeMap['rt-2'].currentTurnAssistantId === null, 'rt-2 currentTurnAssistantId cleared');

  const rt2Msg = runtimeMap['rt-2'].messages[0];
  assert(typeof rt2Msg.durationMs === 'number' && rt2Msg.durationMs >= 400, 'rt-2 assistant message has measured durationMs');
  assert(rt2Msg.durationKind === 'measured', 'rt-2 assistant message durationKind is "measured"');

  // 3.4 Verify rt-1 was completely untouched
  assert(runtimeMap['rt-1'].status === 'thinking', 'rt-1 remains in thinking state');
  assert(typeof runtimeMap['rt-1'].turnStartedAt === 'number', 'rt-1 retains ongoing turnStartedAt');
  assert(runtimeMap['rt-1'].messages.length === 0, 'rt-1 messages remain empty');

  // 3.5 Test saveActiveSessionToMap & restoreSessionFromMap preserves timing properties
  const savedMap = saveActiveSessionToMap(runtimeMap, 'rt-1', {
    messages: [{ id: 'asst-rt1-1', role: 'assistant', content: 'Active', timestamp: Date.now() }],
    currentThinking: null,
    activeToolCalls: [],
    currentStreamText: '',
    activeDiff: null,
    status: 'thinking',
    turnStartedAt: 999888777,
    currentTurnAssistantId: 'asst-rt1-1',
  });

  assert(savedMap['rt-1'].turnStartedAt === 999888777, 'saveActiveSessionToMap preserved turnStartedAt');
  assert(savedMap['rt-1'].currentTurnAssistantId === 'asst-rt1-1', 'saveActiveSessionToMap preserved currentTurnAssistantId');

  const restored = restoreSessionFromMap(savedMap, 'rt-1');
  assert(restored.turnStartedAt === 999888777, 'restoreSessionFromMap restored turnStartedAt');
  assert(restored.currentTurnAssistantId === 'asst-rt1-1', 'restoreSessionFromMap restored currentTurnAssistantId');
}

// ----------------------------------------------------
// Test 4: Abort-Before-First-Message Suite
// ----------------------------------------------------
console.log('\n[Test 4] Abort-Before-First-Message Suite');
{
  let runtimeMap = {
    'rt-1': createEmptyRuntimeSession('rt-1'),
  };

  // Turn 1 completes normally
  runtimeMap['rt-1'].messages = [
    { id: 'asst-old-1', role: 'assistant', content: 'Old answer', timestamp: 1000, durationMs: 2500, durationKind: 'measured' },
  ];

  // Turn 2 starts
  runtimeMap = handleRuntimeEnvelope(runtimeMap, {
    runtimeId: 'rt-1',
    channel: 'omp:status-change',
    payload: 'thinking',
  }, 'rt-1');

  // User immediately aborts without any message-complete
  runtimeMap = handleRuntimeEnvelope(runtimeMap, {
    runtimeId: 'rt-1',
    channel: 'omp:status-change',
    payload: 'idle',
  }, 'rt-1');

  assert(runtimeMap['rt-1'].messages.length === 1, 'Only old message remains');
  assert(runtimeMap['rt-1'].messages[0].durationMs === 2500, 'Old message duration is strictly unchanged');
  assert(runtimeMap['rt-1'].turnStartedAt === null, 'turnStartedAt is cleared');
  assert(runtimeMap['rt-1'].currentTurnAssistantId === null, 'currentTurnAssistantId is cleared');
}

// ----------------------------------------------------
// Test 5: Session History Aggregation & Provenance Suite
// ----------------------------------------------------
console.log('\n[Test 5] Session History Aggregation & Provenance Suite');
{
  const bridge = new OmpBridge();

  const rawMessages = [
    {
      role: 'user',
      content: 'Run two tasks',
      timestamp: 10000,
    },
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'Step 1' }],
      duration: 3812.5,
      timestamp: 12000,
      completedAt: 14000,
    },
    {
      role: 'toolResult',
      toolCallId: 'call-1',
      content: 'ok',
      timestamp: 15000,
    },
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'Step 2 done' }],
      duration: 1540.2,
      timestamp: 16000,
      completedAt: 18000,
    },
  ];

  const translated = bridge.translateHistoryMessages(rawMessages);
  assert(translated.length === 2, 'Translates to 1 user and 1 merged assistant message');
  const asstMsg = translated[1];
  assert(asstMsg.role === 'assistant', 'Message role is assistant');
  assert(asstMsg.modelDurationMs === 5352.7, `modelDurationMs aggregated: expected 5352.7, got ${asstMsg.modelDurationMs}`);
  assert(asstMsg.durationKind === 'estimated', 'History durationKind is "estimated"');
  assert(asstMsg.durationMs === 8000, `durationMs calculated from user timestamp delta: expected 8000 (18000 - 10000), got ${asstMsg.durationMs}`);

  // Test queued user message suppresses estimated duration
  const rawWithQueued = [
    {
      role: 'user',
      content: 'Queued prompt',
      queued: true,
      timestamp: 5000, // Long time ago in queue
    },
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'Processed from queue' }],
      duration: 1200.0,
      timestamp: 25000,
      completedAt: 26000,
    },
  ];

  const translatedQueued = bridge.translateHistoryMessages(rawWithQueued);
  const queuedAsst = translatedQueued[1];
  assert(queuedAsst.modelDurationMs === 1200.0, 'Queued turn preserves modelDurationMs');
  assert(queuedAsst.durationMs === undefined, 'Queued turn suppresses durationMs to avoid skewed queue time');
  assert(queuedAsst.durationKind === undefined, 'Queued turn suppresses durationKind');
}

// ----------------------------------------------------
// Test 6: File-Attachment Turn Role Guard Suite
// ----------------------------------------------------
console.log('\n[Test 6] File-Attachment Turn Role Guard Suite');
{
  let runtimeMap = {
    'rt-bg': createEmptyRuntimeSession('rt-bg'),
  };

  // Start background turn
  runtimeMap = handleRuntimeEnvelope(runtimeMap, {
    runtimeId: 'rt-bg',
    channel: 'omp:status-change',
    payload: 'thinking',
  }, 'rt-main');

  // File mention arrives first
  runtimeMap = handleRuntimeEnvelope(runtimeMap, {
    runtimeId: 'rt-bg',
    channel: 'omp:message-complete',
    payload: {
      id: 'file-mention-1',
      role: 'fileMention',
      content: '',
      timestamp: Date.now(),
      files: [{ path: 'src/App.tsx', name: 'App.tsx' }],
    },
  }, 'rt-main');

  assert(runtimeMap['rt-bg'].currentTurnAssistantId === null, 'currentTurnAssistantId did NOT capture fileMention');

  // Assistant message arrives second
  runtimeMap = handleRuntimeEnvelope(runtimeMap, {
    runtimeId: 'rt-bg',
    channel: 'omp:message-complete',
    payload: {
      id: 'asst-final-1',
      role: 'assistant',
      content: 'I analyzed App.tsx',
      timestamp: Date.now(),
    },
  }, 'rt-main');

  assert(runtimeMap['rt-bg'].currentTurnAssistantId === 'asst-final-1', 'currentTurnAssistantId captured assistant message');

  // Turn completes
  runtimeMap = handleRuntimeEnvelope(runtimeMap, {
    runtimeId: 'rt-bg',
    channel: 'omp:status-change',
    payload: 'idle',
  }, 'rt-main');

  const fileMsg = runtimeMap['rt-bg'].messages.find((m) => m.id === 'file-mention-1');
  const asstMsg = runtimeMap['rt-bg'].messages.find((m) => m.id === 'asst-final-1');

  assert(fileMsg.durationMs === undefined, 'File mention card has NO durationMs');
  assert(fileMsg.durationKind === undefined, 'File mention card has NO durationKind');
  assert(typeof asstMsg.durationMs === 'number', 'Assistant message received durationMs');
  assert(asstMsg.durationKind === 'measured', 'Assistant message received durationKind: "measured"');
}

console.log(`\n====================================================`);
console.log(`Turn Duration Verification: ${passed} passed, ${failed} failed.`);
console.log(`====================================================\n`);

if (failed > 0) {
  process.exit(1);
}
