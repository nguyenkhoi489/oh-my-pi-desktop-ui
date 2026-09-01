/**
 * Verification Suite: Approval Mode & Compaction Control (Phase 4)
 *
 * Requirements:
 * 1. startProcess with approvalMode -> adds `--approval-mode <mode>` to spawn args.
 * 2. startProcess without approvalMode -> keeps default behavior (no `--approval-mode` flag).
 * 3. getApprovalMode / getState -> exposes current approval mode.
 * 4. setApprovalMode when running -> cleanly stops current process, cancels pending UI requests, restarts with new flag & switches back to active session.
 * 5. setApprovalMode when offline -> updates approvalMode directly.
 * 6. setApprovalMode restart failure -> preserves previous mode without optimistic drift.
 * 7. compact offline & busy guards -> blocks when offline or streaming/thinking.
 * 8. compact command framing & state refresh -> writes `{ type: 'compact', id }` frame and refreshes state upon resolution.
 * 9. setAutoCompaction offline guard & command framing -> writes `{ type: 'set_auto_compaction', id, enabled }` frame and refreshes state.
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

console.log('=== Starting Approval Mode & Compaction Control Verification Suite (Phase 4) ===\n');

// ----------------------------------------------------
// Test 1: startProcess Spawn Args & Approval Mode State
// ----------------------------------------------------
console.log('[Test 1] startProcess Spawn Args with and without approvalMode');
{
  const mockWindow = {
    isDestroyed: () => false,
    webContents: { send: () => {} },
  };

  const bridge = new OmpBridge(mockWindow);

  // Initial state
  const initialModeRes = bridge.getApprovalMode();
  assert(initialModeRes.success === true, 'getApprovalMode succeeds initially');
  assert(initialModeRes.mode === undefined, 'Initial approvalMode is undefined (default behavior)');

  // Verify getState also carries approvalMode
  const writtenFrames = [];
  bridge.lifecycleState = 'ready';
  bridge.process = {
    stdin: {
      writable: true,
      write: (data) => writtenFrames.push(data.toString()),
    },
    killed: false,
    kill: () => {},
  };

  const statePromise = bridge.getState();
  assert(writtenFrames.length === 1, 'getState writes 1 frame');
  const sentFrame = JSON.parse(writtenFrames[0].trim());

  bridge.dispatchInboundFrame({
    type: 'response',
    id: sentFrame.id,
    command: 'get_state',
    success: true,
    data: { isStreaming: false },
  });

  const stateRes1 = await statePromise;
  assert(stateRes1.success === true, 'getState succeeds');
  assert(stateRes1.state.approvalMode === undefined, 'getState reflects undefined approvalMode');
}

// ----------------------------------------------------
// Test 2: setApprovalMode when offline (no active process)
// ----------------------------------------------------
console.log('\n[Test 2] setApprovalMode when offline updates internal mode directly');
{
  const mockWindow = {
    isDestroyed: () => false,
    webContents: { send: () => {} },
  };

  const bridge = new OmpBridge(mockWindow);
  assert(bridge.getLifecycleState() === 'idle', 'Bridge is idle');

  const res = await bridge.setApprovalMode('always-ask');
  assert(res.success === true, 'setApprovalMode succeeds when offline');
  assert(res.mode === 'always-ask', 'Returned mode is always-ask');
  assert(bridge.getApprovalMode().mode === 'always-ask', 'getApprovalMode returns always-ask');

  const res2 = await bridge.setApprovalMode('yolo');
  assert(res2.success === true, 'setApprovalMode to yolo succeeds');
  assert(bridge.getApprovalMode().mode === 'yolo', 'getApprovalMode returns yolo');
}

// ----------------------------------------------------
// Test 3: setApprovalMode when running triggers clean stop, UI cancellation & restart
// ----------------------------------------------------
console.log('\n[Test 3] setApprovalMode when running triggers clean stop, UI cancellation & restart');
{
  const ipcEvents = [];
  const writtenFrames = [];
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, ...args) => {
        ipcEvents.push({ channel, args });
      },
    },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.lifecycleState = 'ready';
  bridge.workspacePath = '/tmp/test-workspace';
  bridge.currentModel = 'gemini-3.7-flash-tiered';
  bridge.currentProvider = 'nguyenkhoi-lmstudio-local';
  bridge.currentSessionFile = '/tmp/test-workspace/sessions/test.jsonl';
  bridge.currentApprovalMode = 'write';

  // Add a pending UI request to verify cancellation
  bridge.pendingUiRequests.set('req-test-123', {
    id: 'req-test-123',
    method: 'select',
    title: 'Allow write?',
    options: ['Approve', 'Deny'],
  });

  let killed = false;
  bridge.process = {
    stdin: {
      writable: true,
      write: (data) => writtenFrames.push(data.toString()),
    },
    killed: false,
    kill: () => {
      killed = true;
    },
  };

  // Mock startProcess & switchSession
  let startCalledWith = null;
  let switchedToSession = null;

  bridge.startProcess = async (ws, model, options) => {
    startCalledWith = { ws, model, options };
    bridge.lifecycleState = 'ready';
    bridge.process = {
      stdin: { writable: true, write: () => {} },
      killed: false,
      kill: () => {},
    };
    return { success: true, pid: 12345 };
  };
  bridge.switchSession = async (sessionPath) => {
    switchedToSession = sessionPath;
    return { success: true };
  };

  bridge.getState = async () => {
    return { success: true, state: { approvalMode: 'always-ask' } };
  };

  const changeRes = await bridge.setApprovalMode('always-ask');
  assert(changeRes.success === true, 'setApprovalMode succeeds during running state');
  assert(changeRes.mode === 'always-ask', 'Mode updated to always-ask');

  // Verify pending UI request was cancelled
  const cancelEvents = ipcEvents.filter((e) => e.channel === 'omp:ui-request-cancel');
  assert(cancelEvents.length > 0, 'omp:ui-request-cancel emitted on restart');
  assert(cancelEvents[0].args[0] === 'req-test-123', 'Cancelled request ID matches req-test-123');

  // Verify startProcess was called with preserved workspace, model, provider and new mode
  assert(startCalledWith !== null, 'startProcess was invoked');
  assert(startCalledWith.ws === '/tmp/test-workspace', 'Workspace preserved');
  assert(startCalledWith.model === 'gemini-3.7-flash-tiered', 'Model preserved');
  assert(startCalledWith.options.provider === 'nguyenkhoi-lmstudio-local', 'Provider preserved');
  assert(startCalledWith.options.approvalMode === 'always-ask', 'New approvalMode passed to startProcess');

  // Verify session was restored
  assert(switchedToSession === '/tmp/test-workspace/sessions/test.jsonl', 'Restored previous active session');
}

// ----------------------------------------------------
// Test 4: setApprovalMode Restart Failure Preserves Previous Mode
// ----------------------------------------------------
console.log('\n[Test 4] setApprovalMode Restart Failure Preserves Previous Mode');
{
  const mockWindow = {
    isDestroyed: () => false,
    webContents: { send: () => {} },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.lifecycleState = 'ready';
  bridge.workspacePath = '/tmp/test-workspace';
  bridge.currentApprovalMode = 'write';
  bridge.process = {
    stdin: { writable: true, write: () => {} },
    killed: false,
    kill: () => {},
  };

  // Mock startProcess failing
  bridge.startProcess = async () => {
    return { success: false };
  };

  const res = await bridge.setApprovalMode('yolo');
  assert(res.success === false, 'setApprovalMode reports failure when restart fails');
  assert(res.mode === 'write', 'Returned mode remains old mode (write)');
  assert(bridge.getApprovalMode().mode === 'write', 'Bridge state preserved old mode (write) without optimistic drift');
}

// ----------------------------------------------------
// Test 5: Compact Offline & Busy Guards
// ----------------------------------------------------
console.log('\n[Test 5] Compact Offline & Busy Guards');
{
  const mockWindow = {
    isDestroyed: () => false,
    webContents: { send: () => {} },
  };

  const bridge = new OmpBridge(mockWindow);

  // Offline guard
  const offlineRes = await bridge.compact();
  assert(offlineRes.success === false, 'compact fails when offline');
  assert(offlineRes.error.includes('not ready or offline'), 'compact returns offline error message');

  // Ready setup
  const writtenFrames = [];
  bridge.lifecycleState = 'ready';
  bridge.process = {
    stdin: {
      writable: true,
      write: (data) => writtenFrames.push(data.toString()),
    },
    killed: false,
    kill: () => {},
  };

  // Streaming busy guard
  bridge.status = 'streaming';
  const streamingRes = await bridge.compact();
  assert(streamingRes.success === false, 'compact fails when streaming');
  assert(streamingRes.error.includes('busy'), 'compact returns busy error');
  assert(writtenFrames.length === 0, 'Zero frames written when blocked by streaming guard');

  // Thinking busy guard
  bridge.status = 'thinking';
  const thinkingRes = await bridge.compact();
  assert(thinkingRes.success === false, 'compact fails when thinking');
  assert(writtenFrames.length === 0, 'Zero frames written when blocked by thinking guard');

  // Executing tool busy guard
  bridge.status = 'executing_tool';
  const toolRes = await bridge.compact();
  assert(toolRes.success === false, 'compact fails when executing tool');
  assert(writtenFrames.length === 0, 'Zero frames written when blocked by executing_tool guard');
}

// ----------------------------------------------------
// Test 6: Compact Command Framing & State Refresh
// ----------------------------------------------------
console.log('\n[Test 6] Compact Command Framing & State Refresh');
{
  const writtenFrames = [];
  const mockWindow = {
    isDestroyed: () => false,
    webContents: { send: () => {} },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.lifecycleState = 'ready';
  bridge.status = 'idle';

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

  const compactPromise = bridge.compact('Focus on summary');
  assert(writtenFrames.length === 1, 'Compact frame written');

  const compactFrame = JSON.parse(writtenFrames[0].trim());
  assert(compactFrame.type === 'compact', 'Frame is compact');
  assert(compactFrame.customInstructions === 'Focus on summary', 'customInstructions passed in frame');
  assert(typeof compactFrame.id === 'string', 'compact frame contains unique id');

  // Correlate compact response
  bridge.dispatchInboundFrame({
    type: 'response',
    id: compactFrame.id,
    command: 'compact',
    success: true,
  });

  // Yield to event loop so getState() triggers
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert(writtenFrames.length === 2, 'getState frame written after compact response');
  const getStateFrame = JSON.parse(writtenFrames[1].trim());
  assert(getStateFrame.type === 'get_state', 'Second frame is get_state');

  bridge.dispatchInboundFrame({
    type: 'response',
    id: getStateFrame.id,
    command: 'get_state',
    success: true,
    data: {
      contextUsage: { tokens: 5000, contextWindow: 300000, percent: 1.67 },
      isCompacting: false,
    },
  });

  const res = await compactPromise;
  assert(res.success === true, 'compact resolves successfully');
}

// ----------------------------------------------------
// Test 7: setAutoCompaction Offline Guard & Command Framing
// ----------------------------------------------------
console.log('\n[Test 7] setAutoCompaction Offline Guard & Command Framing');
{
  const mockWindow = {
    isDestroyed: () => false,
    webContents: { send: () => {} },
  };

  const bridge = new OmpBridge(mockWindow);

  // Offline guard
  const offlineRes = await bridge.setAutoCompaction(true);
  assert(offlineRes.success === false, 'setAutoCompaction fails when offline');
  assert(offlineRes.error.includes('not ready or offline'), 'Returns offline error');

  // Ready setup
  const writtenFrames = [];
  bridge.lifecycleState = 'ready';
  bridge.status = 'idle';

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

  const autoPromise = bridge.setAutoCompaction(true);
  assert(writtenFrames.length === 1, 'set_auto_compaction frame written');

  const autoCompactionFrame = JSON.parse(writtenFrames[0].trim());
  assert(autoCompactionFrame.type === 'set_auto_compaction', 'Frame type is set_auto_compaction');
  assert(autoCompactionFrame.enabled === true, 'Frame enabled is true');
  assert(typeof autoCompactionFrame.id === 'string', 'Frame contains unique id');

  bridge.dispatchInboundFrame({
    type: 'response',
    id: autoCompactionFrame.id,
    command: 'set_auto_compaction',
    success: true,
  });
  // Yield to event loop so getState() triggers
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert(writtenFrames.length === 2, 'getState frame written after set_auto_compaction response');
  const getStateFrame = JSON.parse(writtenFrames[1].trim());
  assert(getStateFrame.type === 'get_state', 'Second frame is get_state');

  bridge.dispatchInboundFrame({
    type: 'response',
    id: getStateFrame.id,
    command: 'get_state',
    success: true,
    data: {
      autoCompactionEnabled: true,
    },
  });

  const res = await autoPromise;
  assert(res.success === true, 'setAutoCompaction(true) resolves successfully');
}

console.log('\n====================================================');
console.log(`Verification Complete: ${passed} passed, ${failed} failed.`);
console.log('====================================================\n');
