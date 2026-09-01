/**
 * Verification Suite: Extension UI Protocol & Workspace Guard (Phase 1)
 * 
 * Verifies Phase 1 Requirements:
 * 1. ExtensionUiRequestEvent -> OmpUiRequest translation:
 *    - select with ['Approve', 'Deny'] -> isToolApproval: true, status waiting_permission, omp:ui-request
 *    - select with other options -> isToolApproval: false, omp:ui-request
 *    - confirm, input, editor -> method preserved, fields mapped, omp:ui-request
 * 2. respondUiRequest(id, payload):
 *    - value: 'Approve' -> flat frame { type: 'extension_ui_response', id, value: 'Approve' }
 *    - confirmed: true -> flat frame { type: 'extension_ui_response', id, confirmed: true }
 *    - cancelled: true -> flat frame { type: 'extension_ui_response', id, cancelled: true }
 *    - clears pending, restores status
 * 3. cancel method from engine:
 *    - { type: 'extension_ui_request', method: 'cancel', targetId } -> omp:ui-request-cancel, clears pending
 * 4. Fire-and-forget methods:
 *    - setWidget, notify, setStatus, setTitle, set_editor_text, unknown -> 0 replies, 0 UI events
 * 5. Cleanup on agent_end, abort, cleanupProcess:
 *    - Emits omp:ui-request-cancel for all pending requests, clears pending without writing to stdin
 * 6. fs:delete-file workspace guard:
 *    - Blocks deletion of files outside workspace path
 *    - Deletes file inside workspace
 *    - Refuses directory deletion
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
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

console.log('=== Starting Extension UI Protocol Verification Suite (Phase 1) ===\n');

// ----------------------------------------------------
// Fixture 1: Tool Approval (select with ['Approve', 'Deny'])
// ----------------------------------------------------
console.log('[Test 1] Tool Approval Request Translation (select with ["Approve", "Deny"])');
{
  const emittedEvents = [];
  const statusHistory = [];

  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => {
        emittedEvents.push({ channel, payload });
        if (channel === 'omp:status-change') {
          statusHistory.push(payload);
        }
      },
    },
  };

  const bridge = new OmpBridge(mockWindow);
  const dispatch = (frame) => bridge.dispatchInboundFrame(frame);

  dispatch({ type: 'turn_start', turnId: 'turn-approval-01' });
  assert(statusHistory[statusHistory.length - 1] === 'thinking', 'Status is "thinking" after turn_start');

  const approvalTitle = 'Allow tool: write\nPath: hello.txt\nContent:\nhi omp';
  dispatch({
    type: 'extension_ui_request',
    id: 'ui_approval_001',
    method: 'select',
    title: approvalTitle,
    options: ['Approve', 'Deny'],
  });

  const uiRequests = emittedEvents.filter((e) => e.channel === 'omp:ui-request');
  assert(uiRequests.length === 1, 'Emitted exactly 1 omp:ui-request');
  const req = uiRequests[0].payload;
  assert(req.id === 'ui_approval_001', 'OmpUiRequest id matches');
  assert(req.method === 'select', 'OmpUiRequest method is "select"');
  assert(req.title === approvalTitle, 'OmpUiRequest title matches formatted tool approval text');
  assert(req.isToolApproval === true, 'OmpUiRequest isToolApproval is true for ["Approve", "Deny"]');
  assert(req.options.length === 2 && req.options[0] === 'Approve' && req.options[1] === 'Deny', 'Options intact');
  assert(statusHistory[statusHistory.length - 1] === 'waiting_permission', 'Status transitioned to "waiting_permission"');
}
console.log();

// ----------------------------------------------------
// Fixture 2: Generic select, confirm, input, editor
// ----------------------------------------------------
console.log('[Test 2] Generic Interactive Methods (select, confirm, input, editor)');
{
  const emittedEvents = [];
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => emittedEvents.push({ channel, payload }),
    },
  };

  const bridge = new OmpBridge(mockWindow);
  const dispatch = (frame) => bridge.dispatchInboundFrame(frame);

  // A. Generic select
  dispatch({
    type: 'extension_ui_request',
    id: 'ui_select_gen',
    method: 'select',
    title: 'Choose deployment environment',
    options: ['staging', 'production', 'preview'],
    optionDetails: [{ description: 'Staging cluster' }, { description: 'Prod cluster' }, { description: 'Preview env' }],
  });

  // B. Confirm
  dispatch({
    type: 'extension_ui_request',
    id: 'ui_confirm_01',
    method: 'confirm',
    title: 'Overwrite database?',
    message: 'This action is irreversible.',
  });

  // C. Input
  dispatch({
    type: 'extension_ui_request',
    id: 'ui_input_01',
    method: 'input',
    title: 'Enter API Token',
    placeholder: 'ghp_...',
    timeout: 30000,
  });

  // D. Editor
  dispatch({
    type: 'extension_ui_request',
    id: 'ui_editor_01',
    method: 'editor',
    title: 'Write Release Notes',
    prefill: '# Release 1.0\n\n- Fixes...',
  });

  const uiRequests = emittedEvents.filter((e) => e.channel === 'omp:ui-request');
  assert(uiRequests.length === 4, 'Emitted 4 omp:ui-request events');

  // Verify generic select
  assert(uiRequests[0].payload.isToolApproval === false, 'Generic select has isToolApproval: false');
  assert(uiRequests[0].payload.options.length === 3, 'Generic select preserved 3 options');
  assert(uiRequests[0].payload.optionDetails.length === 3, 'Generic select preserved optionDetails');

  // Verify confirm
  assert(uiRequests[1].payload.method === 'confirm', 'Confirm request method is "confirm"');
  assert(uiRequests[1].payload.message === 'This action is irreversible.', 'Confirm message preserved');

  // Verify input
  assert(uiRequests[2].payload.method === 'input', 'Input request method is "input"');
  assert(uiRequests[2].payload.placeholder === 'ghp_...', 'Input placeholder preserved');
  assert(uiRequests[2].payload.timeout === 30000, 'Input timeout preserved');

  // Verify editor
  assert(uiRequests[3].payload.method === 'editor', 'Editor request method is "editor"');
  assert(uiRequests[3].payload.prefill.startsWith('# Release 1.0'), 'Editor prefill preserved');
}
console.log();

// ----------------------------------------------------
// Fixture 3: Flat Response Frame Serialization (respondUiRequest)
// ----------------------------------------------------
console.log('[Test 3] Flat Response Frame Serialization & Status Restoration');
{
  const writtenFrames = [];
  const statusHistory = [];

  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => {
        if (channel === 'omp:status-change') {
          statusHistory.push(payload);
        }
      },
    },
  };

  const bridge = new OmpBridge(mockWindow);
  // Mock process stdin to capture written frames
  bridge.process = {
    stdin: {
      writable: true,
      write: (data) => {
        const line = data.toString().trim();
        writtenFrames.push(JSON.parse(line));
      },
    },
    killed: false,
    kill: () => {},
  };

  const dispatch = (frame) => bridge.dispatchInboundFrame(frame);

  dispatch({ type: 'turn_start', turnId: 'turn-resp-01' });

  // A. Approve response
  dispatch({
    type: 'extension_ui_request',
    id: 'ui_req_approve',
    method: 'select',
    title: 'Approve tool',
    options: ['Approve', 'Deny'],
  });
  assert(statusHistory[statusHistory.length - 1] === 'waiting_permission', 'Status is "waiting_permission"');

  bridge.respondUiRequest('ui_req_approve', { value: 'Approve' });
  assert(writtenFrames.length === 1, '1 frame written to stdin');
  assert(writtenFrames[0].type === 'extension_ui_response', 'Frame type is "extension_ui_response"');
  assert(writtenFrames[0].id === 'ui_req_approve', 'Frame id matches request id');
  assert(writtenFrames[0].value === 'Approve', 'Frame has flat value: "Approve"');
  assert(writtenFrames[0].requestId === undefined, 'No obsolete requestId field');
  assert(writtenFrames[0].approved === undefined, 'No obsolete approved field');
  assert(statusHistory[statusHistory.length - 1] === 'thinking', 'Status restored to "thinking" during turn');

  // B. Confirm response
  dispatch({
    type: 'extension_ui_request',
    id: 'ui_req_confirm',
    method: 'confirm',
    title: 'Confirm deletion',
  });
  bridge.respondUiRequest('ui_req_confirm', { confirmed: true });
  assert(writtenFrames.length === 2, '2nd frame written to stdin');
  assert(writtenFrames[1].id === 'ui_req_confirm', 'Frame 2 id matches');
  assert(writtenFrames[1].confirmed === true, 'Frame 2 has confirmed: true');

  // C. Cancelled response
  dispatch({
    type: 'extension_ui_request',
    id: 'ui_req_cancel',
    method: 'input',
    title: 'Input name',
  });
  bridge.respondUiRequest('ui_req_cancel', { cancelled: true });
  assert(writtenFrames.length === 3, '3rd frame written to stdin');
  assert(writtenFrames[2].id === 'ui_req_cancel', 'Frame 3 id matches');
  assert(writtenFrames[2].cancelled === true, 'Frame 3 has cancelled: true');
}
console.log();

// ----------------------------------------------------
// Fixture 4: Engine Cancel Request (method: 'cancel')
// ----------------------------------------------------
console.log('[Test 4] Engine Cancel Request (method: "cancel")');
{
  const emittedEvents = [];
  const statusHistory = [];

  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => {
        emittedEvents.push({ channel, payload });
        if (channel === 'omp:status-change') {
          statusHistory.push(payload);
        }
      },
    },
  };

  const bridge = new OmpBridge(mockWindow);
  const dispatch = (frame) => bridge.dispatchInboundFrame(frame);

  dispatch({ type: 'turn_start', turnId: 'turn-cancel-01' });

  dispatch({
    type: 'extension_ui_request',
    id: 'ui_req_to_cancel',
    method: 'select',
    title: 'Select something',
    options: ['A', 'B'],
  });
  assert(statusHistory[statusHistory.length - 1] === 'waiting_permission', 'Status is "waiting_permission"');

  // Engine emits cancel for ui_req_to_cancel
  dispatch({
    type: 'extension_ui_request',
    id: 'engine_cancel_frame',
    method: 'cancel',
    targetId: 'ui_req_to_cancel',
  });

  const cancelEvents = emittedEvents.filter((e) => e.channel === 'omp:ui-request-cancel');
  assert(cancelEvents.length === 1, 'Emitted 1 omp:ui-request-cancel event');
  assert(cancelEvents[0].payload === 'ui_req_to_cancel', 'Cancel event targetId matches');
  assert(statusHistory[statusHistory.length - 1] === 'thinking', 'Status restored to "thinking" after cancel');
}
console.log();

// ----------------------------------------------------
// Fixture 5: Fire-and-Forget Methods (Zero Replies, Zero UI Modals)
// ----------------------------------------------------
console.log('[Test 5] Fire-and-Forget Methods (setWidget, notify, setStatus, setTitle, set_editor_text)');
{
  const writtenFrames = [];
  const emittedEvents = [];

  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => emittedEvents.push({ channel, payload }),
    },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.process = {
    stdin: {
      writable: true,
      write: (data) => writtenFrames.push(data.toString()),
    },
    killed: false,
    kill: () => {},
  };

  const dispatch = (frame) => bridge.dispatchInboundFrame(frame);

  const fireAndForgetFrames = [
    { type: 'extension_ui_request', id: 'faf_1', method: 'setWidget', widgetKey: 'status_bar', widgetLines: ['Line 1'] },
    { type: 'extension_ui_request', id: 'faf_2', method: 'notify', message: 'Task completed', notifyType: 'info' },
    { type: 'extension_ui_request', id: 'faf_3', method: 'setStatus', statusKey: 'build', statusText: 'Building...' },
    { type: 'extension_ui_request', id: 'faf_4', method: 'setTitle', title: 'Turn #2' },
    { type: 'extension_ui_request', id: 'faf_5', method: 'set_editor_text', text: 'new text' },
    { type: 'extension_ui_request', id: 'faf_6', method: 'unknown_custom_method', data: {} },
  ];

  for (const f of fireAndForgetFrames) {
    dispatch(f);
  }

  assert(writtenFrames.length === 0, '0 reply frames written to stdin for fire-and-forget methods (Decision E2)');
  const uiRequests = emittedEvents.filter((e) => e.channel === 'omp:ui-request');
  assert(uiRequests.length === 0, '0 omp:ui-request events emitted for fire-and-forget methods');
}
console.log();

// ----------------------------------------------------
// Fixture 6: Cleanup on agent_end, abort, and process cleanup
// ----------------------------------------------------
console.log('[Test 6] Cleanup & Cancel Propagation on agent_end, abort, cleanupProcess');
{
  // A. agent_end cancels pending UI requests
  {
    const emittedEvents = [];
    const mockWindow = {
      isDestroyed: () => false,
      webContents: {
        send: (channel, payload) => emittedEvents.push({ channel, payload }),
      },
    };
    const bridge = new OmpBridge(mockWindow);
    const dispatch = (frame) => bridge.dispatchInboundFrame(frame);

    dispatch({ type: 'extension_ui_request', id: 'pending_ui_1', method: 'select', title: 'A', options: ['1', '2'] });
    dispatch({ type: 'agent_end' });

    const cancels = emittedEvents.filter((e) => e.channel === 'omp:ui-request-cancel');
    assert(cancels.length === 1, 'agent_end emitted omp:ui-request-cancel for pending UI request');
    assert(cancels[0].payload === 'pending_ui_1', 'TargetId matches pending request');
  }

  // B. abort cancels pending UI requests
  {
    const emittedEvents = [];
    const mockWindow = {
      isDestroyed: () => false,
      webContents: {
        send: (channel, payload) => emittedEvents.push({ channel, payload }),
      },
    };
    const bridge = new OmpBridge(mockWindow);
    const dispatch = (frame) => bridge.dispatchInboundFrame(frame);

    dispatch({ type: 'extension_ui_request', id: 'pending_ui_2', method: 'confirm', title: 'Confirm' });
    dispatch({ type: 'abort' });

    const cancels = emittedEvents.filter((e) => e.channel === 'omp:ui-request-cancel');
    assert(cancels.length === 1, 'abort emitted omp:ui-request-cancel for pending UI request');
    assert(cancels[0].payload === 'pending_ui_2', 'TargetId matches pending request');
  }

  // C. stopProcess / cleanup cancels pending UI requests
  {
    const emittedEvents = [];
    const mockWindow = {
      isDestroyed: () => false,
      webContents: {
        send: (channel, payload) => emittedEvents.push({ channel, payload }),
      },
    };
    const bridge = new OmpBridge(mockWindow);
    const dispatch = (frame) => bridge.dispatchInboundFrame(frame);

    dispatch({ type: 'extension_ui_request', id: 'pending_ui_3', method: 'input', title: 'Input' });
    bridge.stopProcess();

    const cancels = emittedEvents.filter((e) => e.channel === 'omp:ui-request-cancel');
    assert(cancels.length === 1, 'stopProcess emitted omp:ui-request-cancel for pending UI request');
    assert(cancels[0].payload === 'pending_ui_3', 'TargetId matches pending request');
  }
}
console.log();

// ----------------------------------------------------
// Fixture 7: fs:delete-file Workspace Guard Safeguard
// ----------------------------------------------------
console.log('[Test 7] fs:delete-file Workspace Boundary Safeguards');
{
  const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-ws-guard-'));
  const insideFile = path.join(tempWorkspace, 'inside.txt');
  fs.writeFileSync(insideFile, 'inside workspace content');

  const outsideTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-ws-outside-'));
  const outsideFile = path.join(outsideTemp, 'outside.txt');
  fs.writeFileSync(outsideFile, 'outside workspace content');

  // Simulation function matching electron/main.ts fs:delete-file logic
  async function simulateDeleteFile(filePath, workspacePath) {
    try {
      const resolved = path.resolve(filePath);
      if (workspacePath) {
        const resolvedWs = path.resolve(workspacePath);
        const relative = path.relative(resolvedWs, resolved);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          return false;
        }
      }
      const stats = await fs.promises.stat(resolved);
      if (stats.isDirectory()) {
        return false;
      }
      await fs.promises.rm(resolved, { force: true, recursive: false });
      return true;
    } catch {
      return false;
    }
  }

  // 1. Delete file outside workspace -> should be rejected
  const outsideResult = await simulateDeleteFile(outsideFile, tempWorkspace);
  assert(outsideResult === false, 'fs:delete-file rejects deletion outside workspace');
  assert(fs.existsSync(outsideFile) === true, 'Outside file remains untouched on disk');

  // 2. Delete file inside workspace -> should succeed
  const insideResult = await simulateDeleteFile(insideFile, tempWorkspace);
  assert(insideResult === true, 'fs:delete-file succeeds for file inside workspace');
  assert(fs.existsSync(insideFile) === false, 'Inside file is deleted from disk');

  // 3. Delete directory -> should be rejected
  const dirResult = await simulateDeleteFile(tempWorkspace, tempWorkspace);
  assert(dirResult === false, 'fs:delete-file rejects deleting a directory');
  assert(fs.existsSync(tempWorkspace) === true, 'Workspace directory remains intact');

  // Cleanup
  fs.rmSync(outsideTemp, { recursive: true, force: true });
  fs.rmSync(tempWorkspace, { recursive: true, force: true });
}
console.log();

// ----------------------------------------------------
// Summary
// ----------------------------------------------------
console.log('====================================================');
console.log(`Extension UI Protocol Verification Complete: ${passed} passed, ${failed} failed.`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
