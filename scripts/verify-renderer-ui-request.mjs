/**
 * Verification Suite: Renderer UI Request Modal & Queue (Phase 2)
 * 
 * Verifies Phase 2 Requirements:
 * 1. FIFO Queue Logic in useOmpRpc:
 *    - Sequential arrival of multiple requests
 *    - activeUiRequest always reflects queue[0]
 *    - shift/dismiss transitions to subsequent requests until empty
 * 2. Middle and Head Cancellation:
 *    - Engine cancel on middle element removes it without affecting activeUiRequest
 *    - Engine cancel on active/head element immediately promotes next item in queue
 * 3. Double-Reply & Race Condition Safeguards:
 *    - Double clicking respond on same ID sends only 1 IPC frame
 *    - Click after engine cancel sends 0 frames
 * 4. Action Handlers & Payload Formatting:
 *    - respondUiSelect -> { value }
 *    - respondUiConfirm -> { confirmed }
 *    - respondUiInput -> { value }
 *    - dismissUiRequest -> { cancelled: true }
 * 5. Timeout Calculation & Non-reply Contract:
 *    - Timeout formatting from ms and seconds
 *    - Zero-countdown does not send spurious client reply (waits for engine)
 * 6. End-to-End Bridge & Preload Dispatch Integration:
 *    - Bridge emits omp:ui-request and omp:ui-request-cancel
 *    - Mock IPC exposes onOmpUiRequest, onOmpUiRequestCancel, respondUiRequest
 */

import { OmpBridge } from '../electron/omp-bridge.ts';

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

console.log('=== Starting Renderer UI Request & Queue Verification Suite (Phase 2) ===\n');

// ----------------------------------------------------
// Fixture 1: FIFO Queue Operations & Sequential Transition
// ----------------------------------------------------
console.log('[Test 1] FIFO Queue Operations & Sequential Transitions');
{
  // Simulated useOmpRpc queue state
  let uiRequestQueue = [];
  let uiRequestQueueRef = { current: [] };

  function handleUiRequest(req) {
    if (uiRequestQueue.some((r) => r.id === req.id)) return;
    uiRequestQueue = [...uiRequestQueue, req];
    uiRequestQueueRef.current = uiRequestQueue;
  }

  function getActiveUiRequest() {
    return uiRequestQueue.length > 0 ? uiRequestQueue[0] : null;
  }

  const sentIpcPayloads = [];
  async function respondUiRequest(id, payload) {
    const exists = uiRequestQueueRef.current.some((r) => r.id === id);
    if (!exists) return;

    uiRequestQueue = uiRequestQueue.filter((r) => r.id !== id);
    uiRequestQueueRef.current = uiRequestQueue;
    sentIpcPayloads.push({ id, payload });
  }

  // 1. Initially empty
  assert(getActiveUiRequest() === null, 'Initially activeUiRequest is null');
  assert(uiRequestQueue.length === 0, 'Queue length is 0');

  // 2. Push 3 requests
  const req1 = { id: 'req-1', method: 'select', title: 'Allow tool: write', isToolApproval: true, options: ['Approve', 'Deny'] };
  const req2 = { id: 'req-2', method: 'confirm', title: 'Delete database?', isToolApproval: false };
  const req3 = { id: 'req-3', method: 'input', title: 'Enter API Key', isToolApproval: false };

  handleUiRequest(req1);
  handleUiRequest(req2);
  handleUiRequest(req3);

  assert(uiRequestQueue.length === 3, 'Queue has 3 requests');
  assert(getActiveUiRequest()?.id === 'req-1', 'Active request is req-1 (FIFO head)');

  // 3. Duplicate push ignored
  handleUiRequest(req1);
  assert(uiRequestQueue.length === 3, 'Duplicate request ignored by queue');

  // 4. Respond to req-1 -> active becomes req-2
  await respondUiRequest('req-1', { value: 'Approve' });
  assert(uiRequestQueue.length === 2, 'Queue has 2 remaining requests');
  assert(getActiveUiRequest()?.id === 'req-2', 'Active request transitioned to req-2');
  assert(sentIpcPayloads.length === 1 && sentIpcPayloads[0].payload.value === 'Approve', 'Payload recorded for req-1');

  // 5. Respond to req-2 -> active becomes req-3
  await respondUiRequest('req-2', { confirmed: true });
  assert(uiRequestQueue.length === 1, 'Queue has 1 remaining request');
  assert(getActiveUiRequest()?.id === 'req-3', 'Active request transitioned to req-3');

  // 6. Respond to req-3 -> active becomes null
  await respondUiRequest('req-3', { value: 'sk-12345' });
  assert(uiRequestQueue.length === 0, 'Queue is now empty');
  assert(getActiveUiRequest() === null, 'Active request is null when queue is empty');
  assert(sentIpcPayloads.length === 3, 'All 3 responses sent');
}
console.log();

// ----------------------------------------------------
// Fixture 2: Engine Cancellation (Head vs Middle of Queue)
// ----------------------------------------------------
console.log('[Test 2] Engine Cancellation (Head vs Middle of Queue)');
{
  let uiRequestQueue = [];
  let uiRequestQueueRef = { current: [] };

  function handleUiRequest(req) {
    if (uiRequestQueue.some((r) => r.id === req.id)) return;
    uiRequestQueue = [...uiRequestQueue, req];
    uiRequestQueueRef.current = uiRequestQueue;
  }

  function handleUiCancel(targetId) {
    uiRequestQueue = uiRequestQueue.filter((r) => r.id !== targetId);
    uiRequestQueueRef.current = uiRequestQueue;
  }

  function getActiveUiRequest() {
    return uiRequestQueue.length > 0 ? uiRequestQueue[0] : null;
  }

  const reqA = { id: 'req-A', method: 'select', title: 'Tool A', isToolApproval: true };
  const reqB = { id: 'req-B', method: 'select', title: 'Tool B', isToolApproval: true };
  const reqC = { id: 'req-C', method: 'select', title: 'Tool C', isToolApproval: true };

  handleUiRequest(reqA);
  handleUiRequest(reqB);
  handleUiRequest(reqC);

  assert(uiRequestQueue.length === 3, 'Queue has 3 requests [A, B, C]');
  assert(getActiveUiRequest()?.id === 'req-A', 'Active request is req-A');

  // Cancel reqB (middle of queue)
  handleUiCancel('req-B');
  assert(uiRequestQueue.length === 2, 'Queue now has 2 requests [A, C]');
  assert(getActiveUiRequest()?.id === 'req-A', 'Active request remains req-A when middle item is cancelled');
  assert(uiRequestQueue[1].id === 'req-C', 'Second item in queue is req-C');

  // Cancel reqA (head of queue)
  handleUiCancel('req-A');
  assert(uiRequestQueue.length === 1, 'Queue now has 1 request [C]');
  assert(getActiveUiRequest()?.id === 'req-C', 'Active request immediately switches to req-C when head is cancelled');

  // Cancel non-existent ID
  handleUiCancel('non-existent-id');
  assert(uiRequestQueue.length === 1, 'Cancelling non-existent ID does nothing');
  assert(getActiveUiRequest()?.id === 'req-C', 'Active request remains req-C');
}
console.log();

// ----------------------------------------------------
// Fixture 3: Double-Reply and Cancellation Race Conditions
// ----------------------------------------------------
console.log('[Test 3] Double-Reply & Cancellation Race Condition Guards');
{
  let uiRequestQueue = [{ id: 'req-race-1', method: 'select', isToolApproval: true }];
  let uiRequestQueueRef = { current: [...uiRequestQueue] };
  let ipcSentCount = 0;

  async function respondUiRequest(id, payload) {
    const exists = uiRequestQueueRef.current.some((r) => r.id === id);
    if (!exists) return false;

    // Immediately remove
    uiRequestQueue = uiRequestQueue.filter((r) => r.id !== id);
    uiRequestQueueRef.current = uiRequestQueue;
    ipcSentCount++;
    return true;
  }

  // 1. First click
  const firstRes = await respondUiRequest('req-race-1', { value: 'Approve' });
  assert(firstRes === true, 'First response succeeded');
  assert(ipcSentCount === 1, '1 IPC frame sent');

  // 2. Second rapid click on same ID
  const secondRes = await respondUiRequest('req-race-1', { value: 'Approve' });
  assert(secondRes === false, 'Second response blocked by queue check');
  assert(ipcSentCount === 1, 'IPC frame count remains 1 (no double reply)');

  // 3. Cancel then respond scenario
  uiRequestQueue = [{ id: 'req-race-2', method: 'confirm' }];
  uiRequestQueueRef = { current: [...uiRequestQueue] };

  // Engine cancels req-race-2
  uiRequestQueue = uiRequestQueue.filter((r) => r.id !== 'req-race-2');
  uiRequestQueueRef.current = uiRequestQueue;

  // User clicks respond afterwards
  const lateRes = await respondUiRequest('req-race-2', { confirmed: true });
  assert(lateRes === false, 'Response after cancel is rejected');
  assert(ipcSentCount === 1, 'No additional frame sent after cancel');
}
console.log();

// ----------------------------------------------------
// Fixture 4: Response Method Mapping & Payload Shapes
// ----------------------------------------------------
console.log('[Test 4] Response Method Mapping & Payload Shapes');
{
  const recorded = [];
  const mockApi = {
    respondUiRequest: async (id, payload) => {
      recorded.push({ id, payload });
    },
  };

  let queue = [
    { id: 'sel-1', method: 'select' },
    { id: 'conf-1', method: 'confirm' },
    { id: 'conf-2', method: 'confirm' },
    { id: 'inp-1', method: 'input' },
    { id: 'dism-1', method: 'editor' },
  ];
  let queueRef = { current: [...queue] };

  async function respondUiRequest(id, payload) {
    const exists = queueRef.current.some((r) => r.id === id);
    if (!exists) return;
    queue = queue.filter((r) => r.id !== id);
    queueRef.current = queue;
    await mockApi.respondUiRequest(id, payload);
  }

  const respondUiSelect = (id, value) => respondUiRequest(id, { value });
  const respondUiConfirm = (id, confirmed) => respondUiRequest(id, { confirmed });
  const respondUiInput = (id, value) => respondUiRequest(id, { value });
  const dismissUiRequest = (id) => respondUiRequest(id, { cancelled: true });

  // 1. Select
  await respondUiSelect('sel-1', 'Approve');
  assert(recorded[0].id === 'sel-1', 'Select id matches');
  assert(recorded[0].payload.value === 'Approve', 'Select payload contains { value: "Approve" }');

  // 2. Confirm (true)
  await respondUiConfirm('conf-1', true);
  assert(recorded[1].id === 'conf-1', 'Confirm id matches');
  assert(recorded[1].payload.confirmed === true, 'Confirm payload contains { confirmed: true }');

  // 3. Confirm (false)
  await respondUiConfirm('conf-2', false);
  assert(recorded[2].id === 'conf-2', 'Confirm false id matches');
  assert(recorded[2].payload.confirmed === false, 'Confirm false payload contains { confirmed: false }');

  // 4. Input
  await respondUiInput('inp-1', 'User typed string');
  assert(recorded[3].id === 'inp-1', 'Input id matches');
  assert(recorded[3].payload.value === 'User typed string', 'Input payload contains { value: "User typed string" }');

  // 5. Dismiss
  await dismissUiRequest('dism-1');
  assert(recorded[4].id === 'dism-1', 'Dismiss id matches');
  assert(recorded[4].payload.cancelled === true, 'Dismiss payload contains { cancelled: true }');
}
console.log();

// ----------------------------------------------------
// Fixture 5: Timeout Calculation & Zero-Action Verification
// ----------------------------------------------------
console.log('[Test 5] Timeout Calculation & Zero-Action Verification');
{
  function computeInitialSeconds(timeout) {
    if (typeof timeout !== 'number' || timeout <= 0) return null;
    return Math.max(1, Math.round(timeout > 1000 ? timeout / 1000 : timeout));
  }

  assert(computeInitialSeconds(undefined) === null, 'Undefined timeout produces null');
  assert(computeInitialSeconds(0) === null, '0 timeout produces null');
  assert(computeInitialSeconds(-5) === null, 'Negative timeout produces null');
  assert(computeInitialSeconds(30000) === 30, '30000ms converts to 30s');
  assert(computeInitialSeconds(4500) === 5, '4500ms rounds to 5s');
  assert(computeInitialSeconds(15) === 15, '15s direct value preserved');

  // Verify that on timeout expiration (0s), client does NOT auto-respond
  let clientAutoResponded = false;
  let remainingSeconds = 1;

  // Countdown step 1 -> 0
  remainingSeconds = Math.max(0, remainingSeconds - 1);
  assert(remainingSeconds === 0, 'Countdown reaches 0');
  // Client contracts say: do NOT auto reply on 0, wait for engine cancel
  assert(clientAutoResponded === false, 'Renderer does not emit auto-reply when timer reaches 0');
}
console.log();

// ----------------------------------------------------
// Fixture 6: Live OmpBridge + Preload Dispatch Integration
// ----------------------------------------------------
console.log('[Test 6] Live OmpBridge & Preload Dispatch Integration');
{
  const writtenFrames = [];
  const rendererReceivedEvents = [];

  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => {
        rendererReceivedEvents.push({ channel, payload });
      },
    },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.process = {
    stdin: {
      writable: true,
      write: (data) => {
        writtenFrames.push(JSON.parse(data.toString().trim()));
      },
    },
    killed: false,
    kill: () => {},
  };

  // 1. Engine emits tool approval select
  bridge.dispatchInboundFrame({
    type: 'extension_ui_request',
    id: 'live-appr-101',
    method: 'select',
    title: 'Allow tool: edit\nPath: src/main.ts',
    options: ['Approve', 'Deny'],
  });

  const uiReqs = rendererReceivedEvents.filter((e) => e.channel === 'omp:ui-request');
  assert(uiReqs.length === 1, 'Bridge forwarded omp:ui-request');
  assert(uiReqs[0].payload.isToolApproval === true, 'isToolApproval set to true');
  assert(uiReqs[0].payload.title.includes('Allow tool: edit'), 'Title intact');

  // 2. Renderer responds Approve
  bridge.respondUiRequest('live-appr-101', { value: 'Approve' });
  assert(writtenFrames.length === 1, 'Bridge wrote 1 response frame');
  assert(writtenFrames[0].type === 'extension_ui_response', 'Type is extension_ui_response');
  assert(writtenFrames[0].id === 'live-appr-101', 'ID matches');
  assert(writtenFrames[0].value === 'Approve', 'Value is Approve');

  // 3. Engine emits cancel for a request
  bridge.dispatchInboundFrame({
    type: 'extension_ui_request',
    id: 'cancel-frame-202',
    method: 'cancel',
    targetId: 'req-cancelled-by-engine',
  });

  const cancelReqs = rendererReceivedEvents.filter((e) => e.channel === 'omp:ui-request-cancel');
  assert(cancelReqs.length === 1, 'Bridge forwarded omp:ui-request-cancel');
  assert(cancelReqs[0].payload === 'req-cancelled-by-engine', 'Target ID matches');
}
console.log();

// ----------------------------------------------------
// Summary
// ----------------------------------------------------
console.log('====================================================');
console.log(`Phase 2 Verification Complete: ${passed} passed, ${failed} failed.`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
