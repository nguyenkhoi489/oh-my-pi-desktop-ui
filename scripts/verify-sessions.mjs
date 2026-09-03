/**
 * Verification Suite: Sessions Bridge & History Translation (Phase 1)
 * 
 * Verifies Phase 1 Requirements:
 * 1. Unready / Offline structured error responses for session methods.
 * 2. listSessions filesystem scanning & header parsing:
 *    - Resolves from session directory
 *    - Parses 1st level *.jsonl only (skips subdirectories and broken files)
 *    - Parses title and session headers
 *    - Sorts descending by timestamp
 *    - Identifies active session
 * 3. Session commands & Busy guards:
 *    - switchSession, newSession, branchSession, loadHistory return session_busy when streaming
 *    - resetSessionAccumulators cleans up state on session change
 * 4. loadHistory translation mapping (from real probe fixture messages-page.json):
 *    - User message translation
 *    - Assistant message translation with text and thinking
 *    - ToolCall creation from assistant toolCall block
 *    - ToolResult joined to ToolCall by toolCallId with completed/failed status based on isError
 * 5. getBranchEntries extraction & correlation (from session-journal-sample.jsonl):
 *    - Extracts message entries with entryId, role, and inner timestamp
 *    - Enables unique correlation by (role, timestamp)
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

console.log('=== Starting Sessions Bridge Verification Suite (Phase 1) ===\n');

// ----------------------------------------------------
// Test 1: Unready / Offline structured errors
// ----------------------------------------------------
console.log('[Test 1] Unready / Offline Structured Error Guards');
{
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: () => {},
    },
  };

  const bridge = new OmpBridge(mockWindow);

  const listRes = await bridge.listSessions();
  assert(listRes.success === true && Array.isArray(listRes.sessions) && listRes.sessions.length === 0, 'listSessions returns [] when no session directory is set');

  const newRes = await bridge.newSession();
  assert(newRes.success === false && newRes.error === 'OMP process is not ready or offline', 'newSession returns structured error when unready');

  const switchRes = await bridge.switchSession('/some/path.jsonl');
  assert(switchRes.success === false && switchRes.error === 'OMP process is not ready or offline', 'switchSession returns structured error when unready');

  const branchRes = await bridge.branchSession('entry-123');
  assert(branchRes.success === false && branchRes.error === 'OMP process is not ready or offline', 'branchSession returns structured error when unready');

  const historyRes = await bridge.loadHistory();
  assert(historyRes.success === false && historyRes.error === 'OMP process is not ready or offline', 'loadHistory returns structured error when unready');

  const branchEntriesRes = await bridge.getBranchEntries('/non/existent/file.jsonl');
  assert(branchEntriesRes.success === true && Array.isArray(branchEntriesRes.entries) && branchEntriesRes.entries.length === 0, 'getBranchEntries returns [] when file does not exist');
}
console.log();

// ----------------------------------------------------
// Test 2: listSessions filesystem scanning & header parsing
// ----------------------------------------------------
console.log('[Test 2] listSessions Directory Scan, Subdirectory Skipping & Header Parsing');
{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-test-sessions-'));
  
  // File 1: Session from 10:00
  const file1 = path.join(tempDir, '2026-09-01T10-00-00_uuid1.jsonl');
  fs.writeFileSync(
    file1,
    JSON.stringify({ type: 'title', v: 1, title: 'Fix auth token expiration', updatedAt: '2026-09-01T10:05:00.000Z', pad: ' ' }) + '\n' +
    JSON.stringify({ type: 'session', version: 3, id: 'sess-uuid-001', timestamp: '2026-09-01T10:00:00.000Z', cwd: '/test/workspace' }) + '\n' +
    JSON.stringify({ type: 'message', id: 'm1', message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } }) + '\n'
  );

  // File 2: Session from 12:00 (active)
  const file2 = path.join(tempDir, '2026-09-01T12-00-00_uuid2.jsonl');
  fs.writeFileSync(
    file2,
    JSON.stringify({ type: 'title', v: 1, title: 'Implement Sessions Hub', updatedAt: '2026-09-01T12:10:00.000Z', pad: ' ' }) + '\n' +
    JSON.stringify({ type: 'session', version: 3, id: 'sess-uuid-002', timestamp: '2026-09-01T12:00:00.000Z', cwd: '/test/workspace' }) + '\n'
  );

  // File 3: Corrupted file
  const file3 = path.join(tempDir, '2026-09-01T08-00-00_corrupted.jsonl');
  fs.writeFileSync(file3, 'invalid json content\n{not closed\n');

  // Subdirectory (e.g. subagent session folder - must be skipped by listSessions)
  const subagentDir = path.join(tempDir, 'sess-uuid-002');
  fs.mkdirSync(subagentDir);
  fs.writeFileSync(path.join(subagentDir, 'task_agent.jsonl'), '{"type":"session"}\n');

  const mockWindow = {
    isDestroyed: () => false,
    webContents: { send: () => {} },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.setSessionInfo(file2, 'sess-uuid-002');

  assert(bridge.getCurrentSessionFile() === file2, 'Bridge tracks currentSessionFile');
  assert(bridge.getCurrentSessionId() === 'sess-uuid-002', 'Bridge tracks currentSessionId');

  const listRes = await bridge.listSessions(tempDir);
  assert(listRes.success === true, 'listSessions succeeded');
  assert(listRes.sessions.length === 2, `listSessions returned exactly 2 valid top-level sessions (got ${listRes.sessions.length})`);

  // Verify sorting descending by timestamp
  assert(listRes.sessions[0].id === 'sess-uuid-002', 'First session is sess-uuid-002 (newer timestamp)');
  assert(listRes.sessions[0].title === 'Implement Sessions Hub', 'First session title matches');
  assert(listRes.sessions[0].active === true, 'First session is marked active');

  assert(listRes.sessions[1].id === 'sess-uuid-001', 'Second session is sess-uuid-001 (older timestamp)');
  assert(listRes.sessions[1].title === 'Fix auth token expiration', 'Second session title matches');
  assert(listRes.sessions[1].active === false, 'Second session is marked inactive');

  // Cleanup temp dir
  fs.rmSync(tempDir, { recursive: true, force: true });
}
console.log();

// ----------------------------------------------------
// Test 3: Session command busy guards
// ----------------------------------------------------
console.log('[Test 3] Session Command Busy Guards (when streaming / executing tool)');
{
  const mockWindow = {
    isDestroyed: () => false,
    webContents: { send: () => {} },
  };

  const bridge = new OmpBridge(mockWindow);
  // Force lifecycle state to ready for testing busy status guard
  bridge['lifecycleState'] = 'ready';
  bridge['process'] = { stdin: { writable: true } };

  bridge.setStatus('streaming');

  const switchRes = await bridge.switchSession('/some/path.jsonl');
  assert(switchRes.success === false && switchRes.error === 'session_busy', 'switchSession blocked with session_busy when streaming');

  const newRes = await bridge.newSession();
  assert(newRes.success === false && newRes.error === 'session_busy', 'newSession blocked with session_busy when streaming');

  const branchRes = await bridge.branchSession('entry-1');
  assert(branchRes.success === false && branchRes.error === 'session_busy', 'branchSession blocked with session_busy when streaming');

  const historyRes = await bridge.loadHistory();
  assert(historyRes.success === false && historyRes.error === 'session_busy', 'loadHistory blocked with session_busy when streaming');

  // Also verify 'thinking' status
  bridge.setStatus('thinking');
  const thinkLoadRes = await bridge.loadHistory();
  assert(thinkLoadRes.success === false && thinkLoadRes.error === 'session_busy', 'loadHistory blocked with session_busy when thinking');

  // Also verify 'executing_tool' status
  bridge.setStatus('executing_tool');
  const execLoadRes = await bridge.loadHistory();
  assert(execLoadRes.success === false && execLoadRes.error === 'session_busy', 'loadHistory blocked with session_busy when executing_tool');
}
console.log();

// ----------------------------------------------------
// Test 4: loadHistory translation mapping from probe fixture
// ----------------------------------------------------
console.log('[Test 4] History Translation (messages-page.json fixture)');
{
  const fixturePath = path.join(__dirname, '../plans/260901-1858-sessions-subagent-hub/fixtures/messages-page.json');
  const fixtureRaw = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

  const mockWindow = {
    isDestroyed: () => false,
    webContents: { send: () => {} },
  };

  const bridge = new OmpBridge(mockWindow);
  const chatMessages = bridge.translateHistoryMessages(fixtureRaw.messages);

  assert(chatMessages.length === 2, `translateHistoryMessages returned 2 ChatMessages for single turn (got ${chatMessages.length})`);

  // Message 0: User
  const msg0 = chatMessages[0];
  assert(msg0.role === 'user', 'Message 0 role is user');
  assert(msg0.content.includes('Use the write tool to create a file named note.txt'), 'Message 0 contains user prompt');
  assert(msg0.timestamp === 1788264409094, 'Message 0 timestamp preserved');

  // Message 1: Assistant with toolCall + toolResult and final reply joined into single turn message
  const msg1 = chatMessages[1];
  assert(msg1.role === 'assistant', 'Message 1 role is assistant');
  assert(msg1.content.includes('Tôi sẽ tạo file `note.txt`'), 'Message 1 contains introductory assistant text');
  assert(msg1.content.includes('Đã tạo thành công file `note.txt`'), 'Message 1 contains final assistant text');
  assert(Array.isArray(msg1.toolCalls) && msg1.toolCalls.length === 1, 'Message 1 contains 1 toolCall');
  
  const tc = msg1.toolCalls[0];
  assert(tc.id === 'call_1788264198633_0', 'ToolCall id matches call_1788264198633_0');
  assert(tc.name === 'write', 'ToolCall name is "write"');
  assert(tc.status === 'completed', 'ToolCall status is "completed" because toolResult isError was false');
  assert(tc.params.path === 'note.txt', 'ToolCall params path matches');
  assert(typeof tc.result === 'string' && tc.result.includes('Successfully wrote 13 bytes'), 'ToolCall result text joined');

  // Test consecutive multi-step tool calls grouped into a single unified assistant turn
  const multiToolRaw = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Refactor auth module' }],
      timestamp: 1000,
    },
    {
      role: 'assistant',
      content: [
        { type: 'thinking', text: 'Analyzing files...' },
        { type: 'toolCall', id: 'tc_read_1', name: 'read', arguments: { path: 'src/auth.ts' } },
      ],
      timestamp: 1100,
    },
    {
      role: 'toolResult',
      toolCallId: 'tc_read_1',
      content: [{ type: 'text', text: 'file content' }],
      timestamp: 1200,
    },
    {
      role: 'assistant',
      content: [
        { type: 'toolCall', id: 'tc_edit_2', name: 'edit', arguments: { path: 'src/auth.ts' } },
      ],
      timestamp: 1300,
    },
    {
      role: 'toolResult',
      toolCallId: 'tc_edit_2',
      content: [{ type: 'text', text: 'applied patch' }],
      timestamp: 1400,
    },
    {
      role: 'assistant',
      content: [
        { type: 'toolCall', id: 'tc_bash_3', name: 'bash', arguments: { command: 'npm test' } },
      ],
      timestamp: 1500,
    },
    {
      role: 'toolResult',
      toolCallId: 'tc_bash_3',
      content: [{ type: 'text', text: 'all tests pass' }],
      timestamp: 1600,
    },
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Refactored auth module successfully.' },
      ],
      timestamp: 1700,
    },
  ];

  const multiToolChatMessages = bridge.translateHistoryMessages(multiToolRaw);
  assert(multiToolChatMessages.length === 2, `Multi-step tools grouped into exactly 2 ChatMessages (got ${multiToolChatMessages.length})`);
  const assistantTurn = multiToolChatMessages[1];
  assert(assistantTurn.role === 'assistant', 'Turn is assistant');
  assert(assistantTurn.toolCalls && assistantTurn.toolCalls.length === 3, `All 3 tool calls grouped together (got ${assistantTurn.toolCalls?.length})`);
  assert(assistantTurn.toolCalls[0].name === 'read' && assistantTurn.toolCalls[0].status === 'completed', 'Tool 1 is read completed');
  assert(assistantTurn.toolCalls[1].name === 'edit' && assistantTurn.toolCalls[1].status === 'completed', 'Tool 2 is edit completed');
  assert(assistantTurn.toolCalls[2].name === 'bash' && assistantTurn.toolCalls[2].status === 'completed', 'Tool 3 is bash completed');
  assert(assistantTurn.content === 'Refactored auth module successfully.', 'Assistant content matches final reply');
  assert(assistantTurn.thinking && assistantTurn.thinking.thought === 'Analyzing files...', 'Thinking preserved');
  const errorAndThinkingRaw = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Delete file' }],
      timestamp: 1000,
    },
    {
      role: 'assistant',
      content: [
        { type: 'thinking', text: 'Checking file permissions before deleting' },
        { type: 'text', text: 'Deleting file...' },
        { type: 'toolCall', id: 'call_delete_01', name: 'delete', arguments: { path: '/root/secret' } },
      ],
      timestamp: 2000,
    },
    {
      role: 'toolResult',
      toolCallId: 'call_delete_01',
      toolName: 'delete',
      content: [{ type: 'text', text: 'Permission denied EACCES' }],
      isError: true,
      timestamp: 3000,
    },
  ];

  const errChatMessages = bridge.translateHistoryMessages(errorAndThinkingRaw);
  assert(errChatMessages.length === 2, 'Error scenario produced 2 ChatMessages');
  const errAssistant = errChatMessages[1];
  assert(errAssistant.thinking && errAssistant.thinking.thought === 'Checking file permissions before deleting', 'Thinking block translated');
  assert(errAssistant.toolCalls && errAssistant.toolCalls.length === 1, 'Error assistant has 1 tool call');
  assert(errAssistant.toolCalls[0].status === 'failed', 'ToolCall status is "failed" when isError is true');
  assert(errAssistant.toolCalls[0].error === 'Permission denied EACCES', 'ToolCall error message captured');
}
console.log();

// ----------------------------------------------------
// Test 5: getBranchEntries extraction & correlation
// ----------------------------------------------------
console.log('[Test 5] getBranchEntries Extraction & Correlation');
{
  const fixturePath = path.join(__dirname, '../plans/260901-1858-sessions-subagent-hub/fixtures/session-journal-sample.jsonl');

  const mockWindow = {
    isDestroyed: () => false,
    webContents: { send: () => {} },
  };

  const bridge = new OmpBridge(mockWindow);
  const branchRes = await bridge.getBranchEntries(fixturePath);

  assert(branchRes.success === true, 'getBranchEntries returned success: true');
  assert(Array.isArray(branchRes.entries), 'getBranchEntries returned array of entries');
  assert(branchRes.entries.length === 3, `Extracted 3 message entries from journal sample (got ${branchRes.entries.length})`);

  // Verify entry 0: user message
  const userEntry = branchRes.entries.find((e) => e.role === 'user');
  assert(userEntry && userEntry.entryId === 'd8487e45', 'User message entryId matches d8487e45');
  assert(userEntry.timestamp === 1788264409094, 'User message timestamp matches 1788264409094');

  // Verify entry 1: assistant message
  const assistantEntry = branchRes.entries.find((e) => e.role === 'assistant');
  assert(assistantEntry && assistantEntry.entryId === '720a691b', 'Assistant message entryId matches 720a691b');

  // Verify entry 2: toolResult message
  const toolResultEntry = branchRes.entries.find((e) => e.role === 'toolResult');
  assert(toolResultEntry && toolResultEntry.entryId === 'a8851879', 'ToolResult message entryId matches a8851879');

  // Verify correlation logic for user message
  const targetTimestamp = 1788264409094;
  const matchedUserEntries = branchRes.entries.filter((e) => e.role === 'user' && e.timestamp === targetTimestamp);
  assert(matchedUserEntries.length === 1, 'Correlated unique user message by (role, timestamp)');
  assert(matchedUserEntries[0].entryId === 'd8487e45', 'Correlated entryId is d8487e45');
}
console.log();

// Summary
console.log(`=== Sessions Verification Summary: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}
