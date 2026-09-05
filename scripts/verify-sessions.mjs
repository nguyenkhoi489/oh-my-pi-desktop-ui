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
  // Test trailing tool call without toolResult or with alternative tool_call_id property
  const trailingToolRaw = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Check system info' }],
      timestamp: 1000,
    },
    {
      role: 'assistant',
      content: [
        { type: 'toolCall', id: 'call_uname_01', name: 'bash', arguments: { command: 'uname -a' } },
      ],
      timestamp: 2000,
    },
    {
      role: 'toolResult',
      tool_call_id: 'call_uname_01', // alternative field name from some LLM providers
      content: [{ type: 'text', text: 'Darwin Kernel Version' }],
      isError: false,
      timestamp: 2500,
    },
    {
      role: 'assistant',
      content: [
        { type: 'toolCall', id: 'call_trailing_read', name: 'read', arguments: { path: 'package.json' } },
      ],
      timestamp: 3000,
    },
    // Note: No toolResult for call_trailing_read (trailing tool)
  ];

  const trailingMessages = bridge.translateHistoryMessages(trailingToolRaw);
  assert(trailingMessages.length === 2, 'Trailing tool history translated to 2 messages');
  const trailingAssistant = trailingMessages[1];
  assert(trailingAssistant.toolCalls && trailingAssistant.toolCalls.length === 2, 'Trailing assistant has 2 tool calls');
  assert(trailingAssistant.toolCalls[0].status === 'completed', 'Tool with tool_call_id matched and marked completed');
  assert(trailingAssistant.toolCalls[1].status === 'completed', 'Trailing tool without toolResult is safely normalized to completed');

  // Test assistant plain string content after bash tool & system messages
  const bashAndTextRaw = [
    {
      role: 'system',
      content: 'System initialization complete.',
      timestamp: 500,
    },
    {
      role: 'user',
      content: 'Run build command',
      timestamp: 1000,
    },
    {
      role: 'assistant',
      content: [
        { type: 'toolCall', id: 'call_bash_build', name: 'bash', arguments: { command: 'npm run build' } },
      ],
      timestamp: 1500,
    },
    {
      role: 'toolResult',
      toolCallId: 'call_bash_build',
      content: 'Build completed with 0 errors.',
      isError: false,
      timestamp: 2000,
    },
    {
      role: 'assistant',
      content: 'Đã hoàn tất build dự án thành công. Sẵn sàng cho bước tiếp theo.', // Plain string content!
      timestamp: 2500,
    },
  ];

  const bashAndTextMessages = bridge.translateHistoryMessages(bashAndTextRaw);
  assert(bashAndTextMessages.length === 3, `bashAndText translated to 3 ChatMessages (system, user, assistant) - got ${bashAndTextMessages.length}`);
  assert(bashAndTextMessages[0].role === 'system' && bashAndTextMessages[0].content === 'System initialization complete.', 'System message captured');
  assert(bashAndTextMessages[1].role === 'user' && bashAndTextMessages[1].content === 'Run build command', 'User message captured');
  assert(bashAndTextMessages[2].role === 'assistant', 'Third message is assistant');
  assert(bashAndTextMessages[2].toolCalls?.length === 1 && bashAndTextMessages[2].toolCalls[0].name === 'bash', 'Assistant contains bash tool');
  assert(bashAndTextMessages[2].content.includes('Đã hoàn tất build dự án thành công'), 'Assistant text after bash tool preserved');
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

// ----------------------------------------------------
// Test 6: repairSession & Assistant Error Frame Translation
// ----------------------------------------------------
console.log('[Test 6] repairSession & Assistant Error Frame Translation');
{
  const mockWindow = {
    isDestroyed: () => false,
    webContents: { send: () => {} },
  };
  const bridge = new OmpBridge(mockWindow);

  // 1. Test translateHistoryMessages preserves error details
  const errorRawMessages = [
    {
      role: 'user',
      content: 'Run failing command',
      timestamp: 1700000001000,
    },
    {
      role: 'assistant',
      content: [],
      stopReason: 'error',
      errorMessage: 'HTTP 400 Bad Request',
      timestamp: 1700000002000,
    },
  ];
  const translated = bridge.translateHistoryMessages(errorRawMessages);
  assert(translated.length === 2, 'Translated both messages including empty content error assistant');
  assert(translated[1].role === 'assistant', 'Second message is assistant');
  assert(translated[1].isError === true, 'Assistant message marked as isError: true');
  assert(translated[1].stopReason === 'error', 'Assistant stopReason is error');
  assert(translated[1].errorMessage === 'HTTP 400 Bad Request', 'Assistant errorMessage preserved');

  // 2. Test repairSession self-healing
  const tempDir = fs.mkdtempSync(path.join(__dirname, '../plans/temp-repair-'));
  const tempSessionFile = path.join(tempDir, 'broken-session.jsonl');
  const initialLines = [
    JSON.stringify({ type: 'session', id: 'sess-repair-1', timestamp: 1700000000000 }),
    JSON.stringify({ type: 'message', id: 'msg-u1', message: { role: 'user', content: 'hello' } }),
    JSON.stringify({ type: 'message', id: 'msg-tr1', message: { role: 'toolResult', content: 'true' } }),
    JSON.stringify({ type: 'message', id: 'msg-err', message: { role: 'assistant', stopReason: 'error', errorMessage: 'HTTP 400', content: [] } }),
  ];
  fs.writeFileSync(tempSessionFile, initialLines.join('\n') + '\n', 'utf-8');

  const repairRes = await bridge.repairSession(tempSessionFile);
  assert(repairRes.success === true, 'repairSession returned success: true');
  assert((repairRes.repairedTurns || 0) >= 2, `repairSession repaired at least 2 items (got ${repairRes.repairedTurns})`);

  const repairedContent = fs.readFileSync(tempSessionFile, 'utf-8');
  const repairedLines = repairedContent.trim().split('\n').map((l) => JSON.parse(l));

  // Trailing error assistant should be pruned
  assert(repairedLines.length === 3, `Pruned trailing error assistant, remaining 3 lines (got ${repairedLines.length})`);
  // Tool result primitive "true" should be normalized to structured text JSON
  const trMsg = repairedLines[2].message;
  assert(Array.isArray(trMsg.content), 'toolResult content normalized to array');
  assert(trMsg.content[0].type === 'text' && trMsg.content[0].text.includes('result'), 'toolResult wrapped in valid JSON result');

  fs.rmSync(tempDir, { recursive: true, force: true });
}
console.log();

// ----------------------------------------------------
// Test 7: loadHistory Multi-page Pagination & Fallback
// ----------------------------------------------------
console.log('[Test 7] loadHistory Multi-page Pagination & Disk Fallback');
{
  const mockWindow = {
    isDestroyed: () => false,
    webContents: { send: () => {} },
  };
  const bridge = new OmpBridge(mockWindow);
  bridge.lifecycleState = 'ready';
  bridge.process = { stdin: { writable: true } };
  bridge.status = 'idle';

  const sentCommands = [];
  bridge.sendCommand = async (cmd) => {
    sentCommands.push(cmd);
    if (cmd.type === 'get_messages_page') {
      if (!cmd.cursor) {
        return {
          success: true,
          data: {
            messages: [
              { role: 'user', content: 'Prompt turn 1', timestamp: 1000 },
              { role: 'assistant', content: 'Reply turn 1', timestamp: 1100 },
            ],
            totalMessages: 5,
            nextCursor: 'token-page-2-abc',
          },
        };
      } else if (cmd.cursor === 'token-page-2-abc') {
        return {
          success: true,
          data: {
            messages: [
              { role: 'user', content: 'Prompt turn 2', timestamp: 2000 },
              { role: 'assistant', content: 'Reply turn 2', timestamp: 2100 },
            ],
            totalMessages: 5,
            nextCursor: 'token-page-3-xyz',
          },
        };
      } else if (cmd.cursor === 'token-page-3-xyz') {
        return {
          success: true,
          data: {
            messages: [
              { role: 'user', content: 'Prompt turn 3', timestamp: 3000 },
            ],
            totalMessages: 5,
          },
        };
      }
    }
    return { success: false, error: 'unknown_cmd' };
  };

  const pagedRes = await bridge.loadHistory();
  assert(pagedRes.success === true, 'loadHistory with multi-page pagination succeeded');
  assert(Array.isArray(pagedRes.messages) && pagedRes.messages.length === 5, `Aggregated all 5 messages across 3 pages (got ${pagedRes.messages?.length})`);
  assert(sentCommands.length === 3, `Sent 3 get_messages_page commands for pagination (got ${sentCommands.length})`);
  assert(sentCommands[0].cursor === undefined, 'First page command has undefined cursor');
  assert(sentCommands[1].cursor === 'token-page-2-abc', 'Second page command passed nextCursor string');
  assert(sentCommands[2].cursor === 'token-page-3-xyz', 'Third page command passed nextCursor string');

  // Fallback test: when RPC returns empty messages but session file exists on disk
  const tempDir = fs.mkdtempSync(path.join(__dirname, '../plans/temp-history-fallback-'));
  const tempFile = path.join(tempDir, 'fallback-session.jsonl');
  const diskLines = [
    JSON.stringify({ type: 'session', id: 'sess-fb-1', timestamp: 1000 }),
    JSON.stringify({
      type: 'custom_message',
      customType: 'skill-prompt',
      details: { name: 'ak-advise', args: 'User prompt via skill args' },
      attribution: 'user',
      timestamp: 1001,
    }),
    JSON.stringify({
      type: 'custom_message',
      customType: 'skill-prompt',
      content: '[IMPORTANT: User invoked skill]\n\nUser: User prompt via content regex',
      timestamp: 1002,
    }),
    JSON.stringify({ type: 'message', message: { role: 'assistant', content: 'Disk assistant msg', timestamp: 1003 } }),
  ];
  fs.writeFileSync(tempFile, diskLines.join('\n') + '\n', 'utf-8');

  bridge.currentSessionFile = tempFile;
  bridge.sendCommand = async () => ({
    success: true,
    data: { messages: [], totalMessages: 0 },
  });

  const fbRes = await bridge.loadHistory();
  assert(fbRes.success === true, 'loadHistory fallback succeeded');
  assert(Array.isArray(fbRes.messages) && fbRes.messages.length === 3, `Fallback loaded 3 messages including skill prompts (got ${fbRes.messages?.length})`);
  assert(fbRes.messages[0].role === 'user' && fbRes.messages[0].content === 'User prompt via skill args', 'Skill prompt with details.args translated to user role');
  assert(fbRes.messages[1].role === 'user' && fbRes.messages[1].content === 'User prompt via content regex', 'Skill prompt with content regex translated to user role');
  assert(fbRes.messages[2].role === 'assistant' && fbRes.messages[2].content === 'Disk assistant msg', 'Fallback assistant message content restored');

  // RPC failure fallback: when sendCommand rejects or returns success: false
  bridge.sendCommand = async () => {
    throw new Error('Command timed out after 30000ms: get_messages_page');
  };
  const timeoutFallbackRes = await bridge.loadHistory();
  assert(timeoutFallbackRes.success === true, 'loadHistory falls back to disk on RPC command timeout');
  assert(timeoutFallbackRes.messages?.length === 3, 'Timeout fallback restored disk messages');

  // Compaction summary translation test
  const compactionRaw = [
    {
      role: 'compactionSummary',
      summary: 'Archived prior discussion about database schema',
      timestamp: 1000,
    },
    {
      role: 'user',
      content: 'Let us proceed with migrations',
      timestamp: 2000,
    },
  ];
  const compactionTranslated = bridge.translateHistoryMessages(compactionRaw);
  assert(compactionTranslated.length === 2, 'Compaction summary translated to ChatMessages');
  assert(compactionTranslated[0].role === 'system', 'Compaction summary message role is system');
  assert(compactionTranslated[0].content.includes('Archived prior discussion'), 'Compaction summary content preserved');

  // Chunked RPC response resolution test via handleStdoutData
  const bridgeChunked = new OmpBridge(mockWindow);
  bridgeChunked.lifecycleState = 'ready';
  bridgeChunked.process = { stdin: { writable: true } };
  bridgeChunked.status = 'idle';

  const chunkedPayload = {
    id: 'req_chunk_page',
    type: 'response',
    command: 'get_messages_page',
    success: true,
    data: {
      messages: [{ role: 'user', content: 'Chunked test prompt', timestamp: 5000 }],
      totalMessages: 1,
    },
  };
  const chunkedBuf = Buffer.from(JSON.stringify(chunkedPayload), 'utf-8');
  const c1 = {
    type: 'rpc_chunk',
    chunkId: 'rpc-chunk-test',
    index: 0,
    count: 2,
    byteLength: chunkedBuf.length,
    data: chunkedBuf.subarray(0, 40).toString('base64'),
  };
  const c2 = {
    type: 'rpc_chunk',
    chunkId: 'rpc-chunk-test',
    index: 1,
    count: 2,
    byteLength: chunkedBuf.length,
    data: chunkedBuf.subarray(40).toString('base64'),
  };

  bridgeChunked.writeFrame = (frame) => {
    if (frame.type === 'get_messages_page') {
      setTimeout(() => {
        bridgeChunked['handleStdoutData'](JSON.stringify(c1) + '\n');
        bridgeChunked['handleStdoutData'](JSON.stringify(c2) + '\n');
      }, 10);
    }
  };
  bridgeChunked['generateId'] = () => 'req_chunk_page';

  const chunkedHistRes = await bridgeChunked.loadHistory();
  assert(chunkedHistRes.success === true, 'loadHistory succeeded with chunked RPC stream');
  assert(chunkedHistRes.messages?.[0]?.content === 'Chunked test prompt', 'Chunked messages parsed and translated');
  fs.rmSync(tempDir, { recursive: true, force: true });
}
console.log();
// Summary
console.log(`=== Sessions Verification Summary: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}
