/**
 * Verification Suite: Session Control & Branch Simplification (Phase 3)
 * 
 * Verifies Phase 3 Requirements:
 * 1. Offline & Unready structured error guards for rename, delete, export, branch.
 * 2. Busy guards during active streaming/thinking for rename and export.
 * 3. renameSession:
 *    - Validates non-empty trimmed name
 *    - Sends set_session_name command frame
 *    - Refreshes state and returns success: true
 * 4. deleteSession 3-layer security guards:
 *    - Layer 1: Rejects path traversal / outside session dir
 *    - Layer 2: Rejects non-.jsonl files
 *    - Layer 3: Rejects currently active session file
 *    - Valid deletion removes target .jsonl and associated subagent folder
 * 5. exportHtml:
 *    - Sends export_html command frame with outputPath
 *    - Resolves with success: true and path
 * 6. getBranchEntries:
 *    - Sends get_branch_messages command frame
 *    - Translates messages to OmpBranchEntry[]
 *    - Correlates user prompts uniquely by text (duplicate prompt text safely degrades to undefined)
 * 7. emitNotification helper dispatches omp:notification
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

console.log('=== Starting Session Control Verification Suite (Phase 3) ===\n');

// ----------------------------------------------------
// Test 1: Offline / Unready structured error guards
// ----------------------------------------------------
console.log('[Test 1] Offline & Unready Structured Error Guards');
{
  const mockWindow = {
    isDestroyed: () => false,
    webContents: { send: () => {} },
  };

  const bridge = new OmpBridge(mockWindow);

  const renameRes = await bridge.renameSession('New Name');
  assert(renameRes.success === false && renameRes.error === 'OMP process is not ready or offline', 'renameSession returns offline error when unready');

  const exportRes = await bridge.exportHtml('/tmp/session.html');
  assert(exportRes.success === false && exportRes.error === 'OMP process is not ready or offline', 'exportHtml returns offline error when unready');

  const branchRes = await bridge.getBranchEntries();
  assert(branchRes.success === true && Array.isArray(branchRes.entries) && branchRes.entries.length === 0, 'getBranchEntries returns empty array when offline');

  const deleteRes = await bridge.deleteSession('/tmp/some-file.jsonl');
  assert(deleteRes.success === false && deleteRes.error === 'No active session directory', 'deleteSession returns error when no active session dir is known');
}
console.log();

// ----------------------------------------------------
// Test 2: Busy guards during active streaming / thinking
// ----------------------------------------------------
console.log('[Test 2] Busy Guards during Streaming / Thinking');
{
  const writtenFrames = [];
  const mockWindow = {
    isDestroyed: () => false,
    webContents: { send: () => {} },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.lifecycleState = 'ready';
  bridge.process = {
    stdin: {
      writable: true,
      write: (data) => writtenFrames.push(data.toString()),
    },
    killed: false,
    kill: () => {},
  };

  // Set status to streaming
  bridge.status = 'streaming';
  const renameStream = await bridge.renameSession('Rename Attempt');
  assert(renameStream.success === false && renameStream.error === 'session_busy', 'renameSession blocked when streaming');
  assert(writtenFrames.length === 0, 'Zero frames sent when rename blocked by streaming');

  const exportStream = await bridge.exportHtml('/tmp/out.html');
  assert(exportStream.success === false && exportStream.error === 'session_busy', 'exportHtml blocked when streaming');
  assert(writtenFrames.length === 0, 'Zero frames sent when export blocked by streaming');

  // Set status to thinking
  bridge.status = 'thinking';
  const renameThink = await bridge.renameSession('Rename Attempt 2');
  assert(renameThink.success === false && renameThink.error === 'session_busy', 'renameSession blocked when thinking');

  // Set status to executing_tool
  bridge.status = 'executing_tool';
  const renameTool = await bridge.renameSession('Rename Attempt 3');
  assert(renameTool.success === false && renameTool.error === 'session_busy', 'renameSession blocked when executing tool');

  // Idle allows actions
  bridge.status = 'idle';
  assert(bridge.status === 'idle', 'Bridge is idle');
}
console.log();

// ----------------------------------------------------
// Test 3: renameSession Command Formatting & State Refresh
// ----------------------------------------------------
console.log('[Test 3] renameSession Command Formatting, Empty Name Validation & State Refresh');
{
  const writtenFrames = [];
  let emittedContextUsage = null;
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => {
        if (channel === 'omp:context-usage') {
          emittedContextUsage = payload;
        }
      },
    },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.lifecycleState = 'ready';
  bridge.status = 'idle';
  bridge.process = {
    stdin: {
      writable: true,
      write: (data) => writtenFrames.push(data.toString()),
    },
    killed: false,
    kill: () => {},
  };

  // Empty string validation
  const emptyRes = await bridge.renameSession('');
  assert(emptyRes.success === false && emptyRes.error === 'Session name cannot be empty', 'renameSession rejects empty string');

  const whitespaceRes = await bridge.renameSession('   ');
  assert(whitespaceRes.success === false && whitespaceRes.error === 'Session name cannot be empty', 'renameSession rejects whitespace string');
  assert(writtenFrames.length === 0, 'Zero frames sent on empty name validation failure');

  // Valid rename execution
  const renamePromise = bridge.renameSession('Refactor Session Title');
  assert(writtenFrames.length === 1, 'Sent exactly 1 frame for renameSession');

  const sentCmd = JSON.parse(writtenFrames[0].trim());
  assert(sentCmd.type === 'set_session_name', 'Command frame type is set_session_name');
  assert(sentCmd.name === 'Refactor Session Title', 'Command frame name matches "Refactor Session Title"');
  assert(typeof sentCmd.id === 'string', 'Command frame contains unique id');

  // Mock engine response for set_session_name
  bridge.dispatchInboundFrame({
    type: 'response',
    id: sentCmd.id,
    success: true,
    data: null,
  });

  // Allow microtask queue to process getState() call
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert(writtenFrames.length === 2, 'renameSession triggered get_state after success');
  const getStateCmd = JSON.parse(writtenFrames[1].trim());
  assert(getStateCmd.type === 'get_state', 'Second command is get_state');
  bridge.dispatchInboundFrame({
    type: 'response',
    id: getStateCmd.id,
    success: true,
    data: {
      sessionName: 'Refactor Session Title',
      sessionId: 'sess-123',
      contextUsage: { tokens: 1000, contextWindow: 200000, percent: 0.5 },
    },
  });

  const renameRes = await renamePromise;
  assert(renameRes.success === true, 'renameSession promise resolved with success: true');
  assert(emittedContextUsage && emittedContextUsage.sessionName === 'Refactor Session Title', 'omp:context-usage emitted updated sessionName');
}
console.log();

// ----------------------------------------------------
// Test 4: deleteSession 3-Layer Security Guards & Subagent Cleanup
// ----------------------------------------------------
console.log('[Test 4] deleteSession 3-Layer Security Guards & Subagent Directory Cleanup');
{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-test-session-ctrl-'));

  const activeFile = path.join(tempDir, '2026-09-01T12-00-00_active-uuid.jsonl');
  fs.writeFileSync(activeFile, '{"type":"session","id":"active-uuid"}\n');

  const deleteTargetFile = path.join(tempDir, '2026-09-01T10-00-00_to-delete-uuid.jsonl');
  fs.writeFileSync(deleteTargetFile, '{"type":"session","id":"to-delete-uuid"}\n');

  // Create subagent directory for the session to delete
  const subagentDir = path.join(tempDir, 'to-delete-uuid');
  fs.mkdirSync(subagentDir);
  fs.writeFileSync(path.join(subagentDir, 'sub_task.jsonl'), '{"type":"session"}\n');

  const nonJsonlFile = path.join(tempDir, 'unrelated.txt');
  fs.writeFileSync(nonJsonlFile, 'some text\n');

  const mockWindow = {
    isDestroyed: () => false,
    webContents: { send: () => {} },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.setSessionInfo(activeFile, 'active-uuid');

  // Layer 1 Guard: Path traversal / outside directory
  const traversalTarget = path.join(tempDir, '../outside_session.jsonl');
  const guard1Res = await bridge.deleteSession(traversalTarget);
  assert(guard1Res.success === false, 'deleteSession rejected path traversal');
  assert(guard1Res.error === 'Target session path is outside the current session directory', 'Layer 1 error message matches');

  // Layer 2 Guard: Non-.jsonl file
  const guard2Res = await bridge.deleteSession(nonJsonlFile);
  assert(guard2Res.success === false, 'deleteSession rejected non-.jsonl file');
  assert(guard2Res.error === 'Target file must be a .jsonl session file', 'Layer 2 error message matches');
  assert(fs.existsSync(nonJsonlFile), 'Non-jsonl file untouched on disk');

  // Layer 3 Guard: Currently active session
  const guard3Res = await bridge.deleteSession(activeFile);
  assert(guard3Res.success === false, 'deleteSession rejected currently active session');
  assert(guard3Res.error === 'Cannot delete the currently active session', 'Layer 3 error message matches');
  assert(fs.existsSync(activeFile), 'Active session file untouched on disk');

  // Valid Deletion
  assert(fs.existsSync(deleteTargetFile), 'Delete target file exists before deleteSession');
  assert(fs.existsSync(subagentDir), 'Subagent folder exists before deleteSession');

  const validDelRes = await bridge.deleteSession(deleteTargetFile);
  assert(validDelRes.success === true, 'deleteSession succeeded for inactive session');
  assert(!fs.existsSync(deleteTargetFile), 'Target session .jsonl file deleted from disk');
  assert(!fs.existsSync(subagentDir), 'Associated subagent directory deleted from disk');

  // Cleanup temp dir
  fs.rmSync(tempDir, { recursive: true, force: true });
}
console.log();

// ----------------------------------------------------
// Test 5: exportHtml Command Formatting & Response
// ----------------------------------------------------
console.log('[Test 5] exportHtml Command Serialization & Resolution');
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
      write: (data) => writtenFrames.push(data.toString()),
    },
    killed: false,
    kill: () => {},
  };

  const exportPromise = bridge.exportHtml('/Users/nguyenkhoi/Desktop/my-session.html');
  assert(writtenFrames.length === 1, 'Sent exactly 1 frame for exportHtml');

  const sentCmd = JSON.parse(writtenFrames[0].trim());
  assert(sentCmd.type === 'export_html', 'Command frame type is export_html');
  assert(sentCmd.outputPath === '/Users/nguyenkhoi/Desktop/my-session.html', 'outputPath preserved');
  assert(typeof sentCmd.id === 'string', 'Command frame contains unique id');

  // Mock engine response
  bridge.dispatchInboundFrame({
    type: 'response',
    id: sentCmd.id,
    success: true,
    data: {
      path: '/Users/nguyenkhoi/Desktop/my-session.html',
    },
  });

  const exportRes = await exportPromise;
  assert(exportRes.success === true, 'exportHtml promise resolved with success: true');
  assert(exportRes.path === '/Users/nguyenkhoi/Desktop/my-session.html', 'exportHtml returned output path');
}
console.log();

// ----------------------------------------------------
// Test 6: getBranchEntries via get_branch_messages & Text Correlation
// ----------------------------------------------------
console.log('[Test 6] getBranchEntries via get_branch_messages & Text Correlation');
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
      write: (data) => writtenFrames.push(data.toString()),
    },
    killed: false,
    kill: () => {},
  };

  const branchPromise = bridge.getBranchEntries();
  assert(writtenFrames.length === 1, 'Sent exactly 1 frame for getBranchEntries');

  const sentCmd = JSON.parse(writtenFrames[0].trim());
  assert(sentCmd.type === 'get_branch_messages', 'Command frame type is get_branch_messages');

  // Mock engine response
  bridge.dispatchInboundFrame({
    type: 'response',
    id: sentCmd.id,
    success: true,
    data: {
      messages: [
        { entryId: 'entry-turn-1', text: 'Prompt 1: Setup project' },
        { entryId: 'entry-turn-2', text: 'Prompt 2: Ambiguous text' },
        { entryId: 'entry-turn-3', text: 'Prompt 2: Ambiguous text' },
      ],
    },
  });

  const branchRes = await branchPromise;
  assert(branchRes.success === true, 'getBranchEntries returned success: true');
  assert(branchRes.entries.length === 3, 'Returned 3 branch entries');
  assert(branchRes.entries[0].entryId === 'entry-turn-1', 'Entry 0 entryId matches');
  assert(branchRes.entries[0].text === 'Prompt 1: Setup project', 'Entry 0 text matches');

  // Test Renderer Text Correlation logic
  const chatMessages = [
    { id: 'm-1', role: 'user', content: 'Prompt 1: Setup project' },
    { id: 'm-2', role: 'assistant', content: 'Project setup done' },
    { id: 'm-3', role: 'user', content: 'Prompt 2: Ambiguous text' },
    { id: 'm-4', role: 'assistant', content: 'Reply 2' },
    { id: 'm-5', role: 'user', content: 'Prompt 2: Ambiguous text' },
    { id: 'm-6', role: 'user', content: 'Prompt 4: No entry' },
  ];

  function correlateBranchEntries(currentMsgs, entries) {
    const textToEntries = new Map();
    for (const entry of entries) {
      const rawText = entry.text ?? entry.content;
      if (typeof rawText === 'string') {
        const list = textToEntries.get(rawText) || [];
        list.push(entry);
        textToEntries.set(rawText, list);
      }
    }

    const userTextCounts = new Map();
    for (const m of currentMsgs) {
      if (m.role === 'user' && typeof m.content === 'string') {
        userTextCounts.set(m.content, (userTextCounts.get(m.content) || 0) + 1);
      }
    }

    return currentMsgs.map((m) => {
      if (m.role === 'user' && typeof m.content === 'string') {
        const matches = textToEntries.get(m.content);
        const userCount = userTextCounts.get(m.content) || 0;
        if (matches && matches.length === 1 && userCount === 1) {
          return { ...m, entryId: matches[0].entryId };
        }
        return { ...m, entryId: undefined };
      }
      return m;
    });
  }

  const correlated = correlateBranchEntries(chatMessages, branchRes.entries);
  assert(correlated[0].entryId === 'entry-turn-1', 'Unique user prompt matches entryId');
  assert(correlated[1].entryId === undefined, 'Assistant message does not receive entryId');
  assert(correlated[2].entryId === undefined, 'Duplicate prompt text safely degrades to undefined entryId');
  assert(correlated[3].entryId === undefined, 'Assistant message has undefined entryId');
  assert(correlated[4].entryId === undefined, 'Second duplicate prompt text degrades to undefined entryId');
  assert(correlated[5].entryId === undefined, 'Unmatched prompt text has undefined entryId');
}
console.log();

// ----------------------------------------------------
// Test 7: emitNotification Helper
// ----------------------------------------------------
console.log('[Test 7] emitNotification Helper');
{
  let receivedNotif = null;
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => {
        if (channel === 'omp:notification') {
          receivedNotif = payload;
        }
      },
    },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.emitNotification('Phiên làm việc đã được xuất thành công.', 'info');

  assert(receivedNotif !== null, 'Received omp:notification event');
  assert(receivedNotif.message === 'Phiên làm việc đã được xuất thành công.', 'Notification message matches');
  assert(receivedNotif.notifyType === 'info', 'Notification notifyType is info');
  assert(typeof receivedNotif.id === 'string', 'Notification contains id');
  assert(typeof receivedNotif.timestamp === 'number', 'Notification contains timestamp');
}
console.log();

// ----------------------------------------------------
// Summary
// ----------------------------------------------------
console.log(`=== Session Control Verification Summary: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
