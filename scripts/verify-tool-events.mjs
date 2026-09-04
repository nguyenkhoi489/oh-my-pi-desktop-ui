/**
 * Verification Suite: Tool Execution Event Translation & Visual Diff Generation
 * 
 * Verifies Phase 1 Requirements:
 * 1. tool_execution_start -> ToolCall running, omp:tool-call, status executing_tool
 * 2. tool_execution_update -> partialResult merged, omp:tool-call
 * 3. tool_execution_end -> ToolCall completed/failed, status thinking, omp:tool-call
 * 4. FileDiffItem generation:
 *    - edit tool single file (oldText, newText, diff, path) -> 1 FileDiffItem (op: update)
 *    - edit tool delete (op: 'delete', oldText) -> 1 FileDiffItem (op: delete, modifiedContent: '')
 *    - edit tool perFileResults (2 files) -> 2 FileDiffItem events
 *    - edit tool snapshotsPruned: true -> 0 diffs
 *    - write tool with existing file snapshot -> 1 FileDiffItem (op: update)
 *    - write tool new file (no snapshot) -> 1 FileDiffItem (op: create)
 *    - write tool race condition (snapshot === args.content) -> fallback op: create
 *    - ast_edit, read, failed tool -> 0 diffs
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

console.log('=== Starting Tool Execution & Diff Translation Verification Suite ===\n');

// ----------------------------------------------------
// Fixture 1: Tool Execution Lifecycle (Start -> Update -> End)
// ----------------------------------------------------
console.log('[Test 1] Tool Execution Lifecycle (Start -> Update -> End)');
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

  // 1. turn_start
  dispatch({ type: 'turn_start', turnId: 'turn-101' });
  assert(statusHistory[statusHistory.length - 1] === 'thinking', 'Status is "thinking" after turn_start');

  // 2. tool_execution_start
  dispatch({
    type: 'tool_execution_start',
    toolCallId: 'call_read_01',
    toolName: 'read',
    args: { path: 'package.json' },
  });

  const toolCallsAfterStart = emittedEvents.filter((e) => e.channel === 'omp:tool-call');
  assert(toolCallsAfterStart.length === 1, 'Received 1 omp:tool-call at start');
  assert(toolCallsAfterStart[0].payload.id === 'call_read_01', 'ToolCall has correct ID');
  assert(toolCallsAfterStart[0].payload.name === 'read', 'ToolCall has correct name');
  assert(toolCallsAfterStart[0].payload.status === 'running', 'ToolCall status is "running"');
  assert(typeof toolCallsAfterStart[0].payload.startTime === 'number', 'ToolCall has startTime');
  assert(statusHistory[statusHistory.length - 1] === 'executing_tool', 'Bridge status transitioned to "executing_tool"');

  // 3. tool_execution_update with partialResult
  dispatch({
    type: 'tool_execution_update',
    toolCallId: 'call_read_01',
    toolName: 'read',
    args: { path: 'package.json' },
    partialResult: {
      content: [{ type: 'text', text: 'Reading 50 lines...' }],
      details: { totalLines: 50 },
    },
  });

  const toolCallsAfterUpdate = emittedEvents.filter((e) => e.channel === 'omp:tool-call');
  assert(toolCallsAfterUpdate.length === 2, 'Received 2nd omp:tool-call at update');
  assert(toolCallsAfterUpdate[1].payload.result.partial === 'Reading 50 lines...', 'ToolCall result contains partial text');
  assert(toolCallsAfterUpdate[1].payload.result.details.totalLines === 50, 'ToolCall result contains partial details');

  // 4. tool_execution_end
  dispatch({
    type: 'tool_execution_end',
    toolCallId: 'call_read_01',
    toolName: 'read',
    result: {
      content: [{ type: 'text', text: 'File read complete.' }],
      details: { totalLines: 60, fileSize: 1800 },
    },
    isError: false,
  });

  const toolCallsAfterEnd = emittedEvents.filter((e) => e.channel === 'omp:tool-call');
  assert(toolCallsAfterEnd.length === 3, 'Received 3rd omp:tool-call at end');
  assert(toolCallsAfterEnd[2].payload.status === 'completed', 'ToolCall status is "completed"');
  assert(typeof toolCallsAfterEnd[2].payload.endTime === 'number', 'ToolCall has endTime');
  assert(statusHistory[statusHistory.length - 1] === 'thinking', 'Status reverted to "thinking" after tool_execution_end');

  // Verify read tool does NOT emit diff
  const diffs = emittedEvents.filter((e) => e.channel === 'omp:diff-generated');
  assert(diffs.length === 0, '0 omp:diff-generated emitted for "read" tool');
}
console.log();

// ----------------------------------------------------
// Fixture 2: Tool Execution Failure (isError: true)
// ----------------------------------------------------
console.log('[Test 2] Tool Execution Failure (isError: true)');
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

  dispatch({
    type: 'tool_execution_start',
    toolCallId: 'call_fail_01',
    toolName: 'bash',
    args: { command: 'invalid_command' },
  });

  dispatch({
    type: 'tool_execution_end',
    toolCallId: 'call_fail_01',
    toolName: 'bash',
    isError: true,
    error: 'Command not found: invalid_command',
  });

  const toolCalls = emittedEvents.filter((e) => e.channel === 'omp:tool-call');
  assert(toolCalls.length === 2, 'Received 2 omp:tool-call events');
  assert(toolCalls[1].payload.status === 'failed', 'ToolCall status is "failed"');
  assert(toolCalls[1].payload.error === 'Command not found: invalid_command', 'ToolCall error message captured');

  const diffs = emittedEvents.filter((e) => e.channel === 'omp:diff-generated');
  assert(diffs.length === 0, '0 diffs emitted for failed tool execution');
}
console.log();

// ----------------------------------------------------
// Fixture 3: Edit Tool Single File Diff & Stats
// ----------------------------------------------------
console.log('[Test 3] Edit Tool Single File Diff Generation & Line Stats');
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

  const diffText = `--- src/app.ts
+++ src/app.ts
@@ -1,3 +1,4 @@
-const oldVersion = 1;
+const newVersion = 2;
+const extraFeature = true;
`;

  dispatch({
    type: 'tool_execution_start',
    toolCallId: 'call_edit_01',
    toolName: 'edit',
    args: { path: 'src/app.ts' },
  });

  dispatch({
    type: 'tool_execution_end',
    toolCallId: 'call_edit_01',
    toolName: 'edit',
    result: {
      content: [{ type: 'text', text: 'Edited src/app.ts' }],
      details: {
        path: 'src/app.ts',
        diff: diffText,
        oldText: 'const oldVersion = 1;\nconsole.log("ready");\n',
        newText: 'const newVersion = 2;\nconst extraFeature = true;\nconsole.log("ready");\n',
        op: 'update',
        firstChangedLine: 1,
      },
    },
    isError: false,
  });

  const diffs = emittedEvents.filter((e) => e.channel === 'omp:diff-generated');
  assert(diffs.length === 1, 'Emitted exactly 1 omp:diff-generated for single file edit');
  
  const diffItem = diffs[0].payload;
  assert(diffItem.id.startsWith('diff-call_edit_01'), 'Diff ID correlates with toolCallId');
  assert(diffItem.relativePath.endsWith('src/app.ts'), 'Diff relativePath is src/app.ts');
  assert(diffItem.originalContent === 'const oldVersion = 1;\nconsole.log("ready");\n', 'Diff originalContent matches oldText');
  assert(diffItem.modifiedContent.includes('const newVersion = 2;'), 'Diff modifiedContent matches newText');
  assert(diffItem.status === 'pending', 'Diff initial status is "pending"');
  assert(diffItem.op === 'update', 'Diff op is "update"');
  assert(diffItem.additions === 2, `Additions line count is 2 (actual: ${diffItem.additions})`);
  assert(diffItem.deletions === 1, `Deletions line count is 1 (actual: ${diffItem.deletions})`);
}
console.log();

// ----------------------------------------------------
// Fixture 4: Edit Tool op: 'delete'
// ----------------------------------------------------
console.log('[Test 4] Edit Tool op: "delete" Diff Generation');
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

  dispatch({
    type: 'tool_execution_start',
    toolCallId: 'call_edit_del',
    toolName: 'edit',
    args: { path: 'src/deprecated.ts' },
  });

  dispatch({
    type: 'tool_execution_end',
    toolCallId: 'call_edit_del',
    toolName: 'edit',
    result: {
      content: [{ type: 'text', text: 'Deleted src/deprecated.ts' }],
      details: {
        path: 'src/deprecated.ts',
        diff: '',
        oldText: 'export const legacy = true;\n',
        op: 'delete',
      },
    },
    isError: false,
  });

  const diffs = emittedEvents.filter((e) => e.channel === 'omp:diff-generated');
  assert(diffs.length === 1, 'Emitted 1 diff for op "delete"');
  
  const diffItem = diffs[0].payload;
  assert(diffItem.op === 'delete', 'Diff op is "delete"');
  assert(diffItem.originalContent === 'export const legacy = true;\n', 'originalContent preserved from oldText');
  assert(diffItem.modifiedContent === '', 'modifiedContent is empty string for delete');
  assert(diffItem.additions === 0, 'Additions is 0 for delete');
  assert(diffItem.deletions === 2, `Deletions matches deleted line count (actual: ${diffItem.deletions})`);
}
console.log();

// ----------------------------------------------------
// Fixture 5: Edit Tool Multi-File perFileResults
// ----------------------------------------------------
console.log('[Test 5] Edit Tool Multi-File perFileResults (2 files)');
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

  dispatch({
    type: 'tool_execution_start',
    toolCallId: 'call_edit_multi',
    toolName: 'edit',
    args: { path: 'src/a.ts' },
  });

  dispatch({
    type: 'tool_execution_end',
    toolCallId: 'call_edit_multi',
    toolName: 'edit',
    result: {
      content: [{ type: 'text', text: 'Edited 2 files' }],
      details: {
        perFileResults: [
          {
            path: 'src/a.ts',
            diff: '+const a = 1;',
            oldText: '',
            newText: 'const a = 1;',
            op: 'create',
          },
          {
            path: 'src/b.ts',
            diff: '-const oldB = 0;\n+const newB = 1;',
            oldText: 'const oldB = 0;',
            newText: 'const newB = 1;',
            op: 'update',
          },
        ],
      },
    },
    isError: false,
  });

  const diffs = emittedEvents.filter((e) => e.channel === 'omp:diff-generated');
  assert(diffs.length === 2, 'Emitted exactly 2 diff events for perFileResults');
  assert(diffs[0].payload.relativePath.endsWith('src/a.ts'), 'File 1 relativePath is src/a.ts');
  assert(diffs[0].payload.op === 'create', 'File 1 op is "create"');
  assert(diffs[1].payload.relativePath.endsWith('src/b.ts'), 'File 2 relativePath is src/b.ts');
  assert(diffs[1].payload.op === 'update', 'File 2 op is "update"');
}
console.log();

// ----------------------------------------------------
// Fixture 6: Edit Tool snapshotsPruned: true (No Diff Emitted)
// ----------------------------------------------------
console.log('[Test 6] Edit Tool snapshotsPruned: true (>32KB guard)');
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

  dispatch({
    type: 'tool_execution_start',
    toolCallId: 'call_edit_large',
    toolName: 'edit',
    args: { path: 'src/large.ts' },
  });

  dispatch({
    type: 'tool_execution_end',
    toolCallId: 'call_edit_large',
    toolName: 'edit',
    result: {
      content: [{ type: 'text', text: 'Edited large file' }],
      details: {
        path: 'src/large.ts',
        diff: '@@ huge diff @@',
        snapshotsPruned: true,
      },
    },
    isError: false,
  });

  const diffs = emittedEvents.filter((e) => e.channel === 'omp:diff-generated');
  assert(diffs.length === 0, '0 diffs emitted when snapshotsPruned is true');
  
  const toolCalls = emittedEvents.filter((e) => e.channel === 'omp:tool-call');
  assert(toolCalls.length === 2, 'ToolCallCard still generated at start and end');
}
console.log();

// ----------------------------------------------------
// Fixture 7: Write Tool with File Snapshot & New File
// ----------------------------------------------------
console.log('[Test 7] Write Tool Snapshot & Diff Creation');
{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-write-test-'));
  const existingFilePath = path.join(tempDir, 'existing.txt');
  fs.writeFileSync(existingFilePath, 'original line 1\noriginal line 2\n');

  const emittedEvents = [];
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => emittedEvents.push({ channel, payload }),
    },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.workspacePath = tempDir; // Set workspacePath

  const dispatch = (frame) => bridge.dispatchInboundFrame(frame);

  // A. Write to existing file -> should have snapshot -> op: update
  dispatch({
    type: 'tool_execution_start',
    toolCallId: 'call_write_update',
    toolName: 'write',
    args: { path: 'existing.txt', content: 'updated line 1\nupdated line 2\nupdated line 3\n' },
  });

  dispatch({
    type: 'tool_execution_end',
    toolCallId: 'call_write_update',
    toolName: 'write',
    result: {
      content: [{ type: 'text', text: 'Wrote to existing.txt' }],
      details: { resolvedPath: existingFilePath },
    },
    isError: false,
  });

  const diffs = emittedEvents.filter((e) => e.channel === 'omp:diff-generated');
  assert(diffs.length === 1, 'Emitted 1 diff for write update');
  assert(diffs[0].payload.op === 'update', 'Write to existing file op is "update"');
  assert(diffs[0].payload.originalContent === 'original line 1\noriginal line 2\n', 'originalContent matches pre-write snapshot');
  assert(diffs[0].payload.modifiedContent === 'updated line 1\nupdated line 2\nupdated line 3\n', 'modifiedContent matches args.content');

  // B. Write to new file -> no snapshot -> op: create
  const newFilePath = path.join(tempDir, 'brand_new.txt');
  dispatch({
    type: 'tool_execution_start',
    toolCallId: 'call_write_create',
    toolName: 'write',
    args: { path: 'brand_new.txt', content: 'hello new world\n' },
  });

  dispatch({
    type: 'tool_execution_end',
    toolCallId: 'call_write_create',
    toolName: 'write',
    result: {
      content: [{ type: 'text', text: 'Created brand_new.txt' }],
      details: { resolvedPath: newFilePath },
    },
    isError: false,
  });

  const diffsAfterNew = emittedEvents.filter((e) => e.channel === 'omp:diff-generated');
  assert(diffsAfterNew.length === 2, 'Emitted 2nd diff for new file write');
  assert(diffsAfterNew[1].payload.op === 'create', 'Write to new file op is "create"');
  assert(diffsAfterNew[1].payload.originalContent === '', 'originalContent is empty for create');
  assert(diffsAfterNew[1].payload.modifiedContent === 'hello new world\n', 'modifiedContent matches args.content');

  bridge.stopProcess();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
console.log();

// ----------------------------------------------------
// Fixture 8: Write Tool Race Condition Fallback (D2)
// ----------------------------------------------------
console.log('[Test 8] Write Tool Race Condition (snapshot === args.content -> op: create)');
{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-write-race-'));
  const fileContent = 'already written content\n';
  const filePath = path.join(tempDir, 'raced.txt');
  fs.writeFileSync(filePath, fileContent);

  const emittedEvents = [];
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => emittedEvents.push({ channel, payload }),
    },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.workspacePath = tempDir;
  const dispatch = (frame) => bridge.dispatchInboundFrame(frame);

  // Start captures snapshot that is identical to args.content (race where engine wrote before start reached bridge)
  dispatch({
    type: 'tool_execution_start',
    toolCallId: 'call_write_race',
    toolName: 'write',
    args: { path: 'raced.txt', content: fileContent },
  });

  dispatch({
    type: 'tool_execution_end',
    toolCallId: 'call_write_race',
    toolName: 'write',
    result: {
      content: [{ type: 'text', text: 'Wrote raced.txt' }],
      details: { resolvedPath: filePath },
    },
    isError: false,
  });

  const diffs = emittedEvents.filter((e) => e.channel === 'omp:diff-generated');
  assert(diffs.length === 1, 'Emitted diff for write race condition');
  assert(diffs[0].payload.op === 'create', 'Race condition gracefully falls back to op "create"');
  assert(diffs[0].payload.originalContent === '', 'originalContent reset to empty string on race fallback');
  assert(diffs[0].payload.modifiedContent === fileContent, 'modifiedContent preserved');

  bridge.stopProcess();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
console.log();

// ----------------------------------------------------
// Fixture 9: ast_edit (Decision D6 - 0 Diffs)
// ----------------------------------------------------
console.log('[Test 9] ast_edit Tool Execution (Decision D6 - No Diff Generated)');
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

  dispatch({
    type: 'tool_execution_start',
    toolCallId: 'call_ast_01',
    toolName: 'ast_edit',
    args: { query: 'fn_decl', replacement: 'new_fn' },
  });

  dispatch({
    type: 'tool_execution_end',
    toolCallId: 'call_ast_01',
    toolName: 'ast_edit',
    result: {
      content: [{ type: 'text', text: 'Replaced 4 symbols' }],
      details: {
        totalReplacements: 4,
        filesTouched: 2,
        fileReplacements: [{ path: 'a.ts', count: 2 }, { path: 'b.ts', count: 2 }],
      },
    },
    isError: false,
  });

  const toolCalls = emittedEvents.filter((e) => e.channel === 'omp:tool-call');
  assert(toolCalls.length === 2, 'ast_edit generates ToolCall events');
  assert(toolCalls[1].payload.status === 'completed', 'ast_edit completes successfully');

  const diffs = emittedEvents.filter((e) => e.channel === 'omp:diff-generated');
  assert(diffs.length === 0, 'ast_edit emits 0 omp:diff-generated events (D6)');
}

// ----------------------------------------------------
// Fixture 10: Virtual Device URIs (xd://browser, etc. - No Diff Generated)
// ----------------------------------------------------
console.log('[Test 10] Virtual Device Write (xd://browser - No Diff Generated)');
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

  dispatch({
    type: 'tool_execution_start',
    toolCallId: 'call_xd_browser_01',
    toolName: 'write',
    args: {
      path: 'xd://browser',
      content: JSON.stringify({ action: 'run', code: 'await tab.goto("https://example.com")' }),
    },
  });

  dispatch({
    type: 'tool_execution_end',
    toolCallId: 'call_xd_browser_01',
    toolName: 'write',
    result: {
      content: [{ type: 'text', text: 'Navigated to https://example.com' }],
    },
    isError: false,
  });

  const toolCalls = emittedEvents.filter((e) => e.channel === 'omp:tool-call');
  assert(toolCalls.length === 2, 'xd:// tool execution generates ToolCall events');
  assert(toolCalls[1].payload.status === 'completed', 'xd:// tool execution completes successfully');

  const diffs = emittedEvents.filter((e) => e.channel === 'omp:diff-generated');
  assert(diffs.length === 0, 'xd:// write emits 0 omp:diff-generated events');
}
console.log();

// ----------------------------------------------------
// Summary
// ----------------------------------------------------
console.log('====================================================');
console.log(`Tool Events Verification Complete: ${passed} passed, ${failed} failed.`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
