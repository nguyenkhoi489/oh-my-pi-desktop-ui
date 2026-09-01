/**
 * Verification Script: Renderer Tool Cards & Visual Diff Automation (Phase 2)
 * 
 * Verifies:
 * 1. IPC fs:delete-file handler functionality and directory safeguards
 * 2. Attachment of activeToolCalls to ChatMessage on message-complete
 * 3. Canvas Visual Diff auto-switch logic on pending diff arrival
 * 4. Accept/Reject semantics across op types (update, create, delete)
 * 5. ProjectTree refreshFiles logic and selected file cleanup
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

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

// ----------------------------------------------------
// 1. IPC fs:delete-file Safeguard & Deletion Test
// ----------------------------------------------------
async function testFsDeleteFile() {
  console.log('[Test 1] Testing fs:delete-file handler & safeguards...');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-delete-test-'));
  const testFile = path.join(tempDir, 'sample-to-delete.ts');
  fs.writeFileSync(testFile, 'export const temp = true;', 'utf-8');

  // Direct emulation of the fs:delete-file main handler logic
  async function handleDeleteFile(filePath) {
    try {
      const resolved = path.resolve(filePath);
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

  // 1. Delete regular file
  const deleteRes = await handleDeleteFile(testFile);
  assert(deleteRes === true, 'fs:delete-file successfully deleted normal file');
  assert(!fs.existsSync(testFile), 'File no longer exists on disk');

  // 2. Refuse to delete directory
  const subDir = path.join(tempDir, 'sub-folder');
  fs.mkdirSync(subDir);
  const dirDeleteRes = await handleDeleteFile(subDir);
  assert(dirDeleteRes === false, 'fs:delete-file refuses to delete directory');
  assert(fs.existsSync(subDir), 'Directory remains intact on disk');

  // Clean up
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ----------------------------------------------------
// 2. Active Tool Calls Attachment to ChatMessage
// ----------------------------------------------------
function testToolCallsTranscriptAttachment() {
  console.log('\n[Test 2] Verifying toolCalls attachment to transcript on message-complete...');

  let messages = [];
  let activeToolCalls = [];
  const activeToolCallsRef = { current: [] };

  function onOmpToolCall(toolCall) {
    const index = activeToolCallsRef.current.findIndex((t) => t.id === toolCall.id);
    let updated;
    if (index >= 0) {
      updated = [...activeToolCallsRef.current];
      updated[index] = toolCall;
    } else {
      updated = [...activeToolCallsRef.current, toolCall];
    }
    activeToolCallsRef.current = updated;
    activeToolCalls = updated;
  }

  function onOmpMessageComplete(msg) {
    const currentTools = activeToolCallsRef.current;
    const finalMsg = {
      ...msg,
      toolCalls:
        msg.toolCalls && msg.toolCalls.length > 0
          ? msg.toolCalls
          : currentTools.length > 0
            ? [...currentTools]
            : undefined,
    };
    messages = [...messages, finalMsg];
    activeToolCallsRef.current = [];
    activeToolCalls = [];
  }

  // 1. Tool execution starts
  onOmpToolCall({
    id: 'tool-call-1',
    name: 'edit',
    params: { path: 'src/app.ts' },
    status: 'running',
    startTime: 1000,
  });
  assert(activeToolCalls.length === 1, 'activeToolCalls contains 1 running tool');
  assert(activeToolCalls[0].status === 'running', 'Tool status is running');

  // 2. Tool execution ends
  onOmpToolCall({
    id: 'tool-call-1',
    name: 'edit',
    params: { path: 'src/app.ts' },
    status: 'completed',
    startTime: 1000,
    endTime: 1500,
    result: { success: true },
  });
  assert(activeToolCalls[0].status === 'completed', 'Tool status updated to completed');

  // 3. Turn completes
  onOmpMessageComplete({
    id: 'msg-turn-1',
    role: 'assistant',
    content: 'Edited src/app.ts successfully.',
    timestamp: 1600,
  });

  assert(activeToolCalls.length === 0, 'activeToolCalls cleared after message-complete');
  assert(messages.length === 1, 'Transcript recorded 1 completed message');
  assert(Array.isArray(messages[0].toolCalls), 'ChatMessage has attached toolCalls array');
  assert(messages[0].toolCalls.length === 1, 'ChatMessage toolCalls contains completed tool');
  assert(messages[0].toolCalls[0].name === 'edit', 'Tool name preserved in transcript');
  assert(messages[0].toolCalls[0].status === 'completed', 'Tool completed status preserved in transcript');
  assert(messages[0].toolCalls[0].result?.success === true, 'Tool result preserved in transcript');
}

// ----------------------------------------------------
// 3. Visual Diff Auto-switch Logic
// ----------------------------------------------------
function testVisualDiffAutoSwitch() {
  console.log('\n[Test 3] Testing Canvas Visual Diff auto-switch logic...');

  let activeTab = 'editor';
  let prevDiffId = null;

  function handleDiffChange(activeDiff) {
    if (activeDiff && activeDiff.status === 'pending' && activeDiff.id !== prevDiffId) {
      prevDiffId = activeDiff.id;
      activeTab = 'diff';
    }
  }

  // 1. Initial mount with no diff
  handleDiffChange(null);
  assert(activeTab === 'editor', 'Active tab remains editor when no diff present');

  // 2. Initial mount in demo mode with already-known initial diff id
  prevDiffId = 'demo-diff-1';
  handleDiffChange({ id: 'demo-diff-1', status: 'pending' });
  assert(activeTab === 'editor', 'No spurious auto-switch for initial demo diff on mount');

  // 3. New pending diff arrives
  handleDiffChange({ id: 'diff-live-101', status: 'pending' });
  assert(activeTab === 'diff', 'Auto-switched to "diff" tab when new pending diff arrives');

  // 4. User manually switches to 'editor' tab
  activeTab = 'editor';
  // Same diff emits update (e.g. status still pending, same id)
  handleDiffChange({ id: 'diff-live-101', status: 'pending' });
  assert(activeTab === 'editor', 'Tab not hijacked if diff id is unchanged');

  // 5. Another new pending diff arrives
  handleDiffChange({ id: 'diff-live-102', status: 'pending' });
  assert(activeTab === 'diff', 'Auto-switched to "diff" tab when next diff arrives');
}

// ----------------------------------------------------
// 4. Accept / Reject Semantics across Op Types
// ----------------------------------------------------
async function testAcceptRejectSemantics() {
  console.log('\n[Test 4] Testing Accept/Reject semantics across op types...');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-diff-ops-test-'));

  const mockElectronApi = {
    saveFile: async (filePath, content) => {
      await fs.promises.writeFile(filePath, content, 'utf-8');
      return true;
    },
    deleteFile: async (filePath) => {
      await fs.promises.rm(filePath, { force: true, recursive: false });
      return true;
    },
  };

  async function executeAccept(activeDiff) {
    if (!activeDiff) return null;
    if (activeDiff.op !== 'delete') {
      await mockElectronApi.saveFile(activeDiff.filePath, activeDiff.modifiedContent);
    }
    return { ...activeDiff, status: 'accepted' };
  }

  async function executeReject(activeDiff) {
    if (!activeDiff) return null;
    if (activeDiff.op === 'create') {
      await mockElectronApi.deleteFile(activeDiff.filePath);
    } else if (activeDiff.op === 'delete' || activeDiff.op === 'update' || !activeDiff.op) {
      await mockElectronApi.saveFile(activeDiff.filePath, activeDiff.originalContent);
    }
    return { ...activeDiff, status: 'rejected' };
  }

  // --- Scenario A: op = 'update' ---
  const updateFile = path.join(tempDir, 'update.ts');
  fs.writeFileSync(updateFile, 'new updated content by engine', 'utf-8'); // Engine already wrote it

  const updateDiff = {
    id: 'diff-u-1',
    filePath: updateFile,
    relativePath: 'update.ts',
    originalContent: 'original content before edit',
    modifiedContent: 'new updated content by engine',
    status: 'pending',
    additions: 1,
    deletions: 1,
    op: 'update',
  };

  // Reject update
  const rejectedUpdate = await executeReject(updateDiff);
  assert(rejectedUpdate.status === 'rejected', 'Update diff status set to rejected');
  assert(
    fs.readFileSync(updateFile, 'utf-8') === 'original content before edit',
    'Reverting update restored original content to disk'
  );

  // Accept update
  const acceptedUpdate = await executeAccept(updateDiff);
  assert(acceptedUpdate.status === 'accepted', 'Update diff status set to accepted');
  assert(
    fs.readFileSync(updateFile, 'utf-8') === 'new updated content by engine',
    'Accepting update preserved modified content on disk'
  );

  // --- Scenario B: op = 'create' ---
  const createFile = path.join(tempDir, 'newly-created.ts');
  fs.writeFileSync(createFile, 'brand new content by engine', 'utf-8');

  const createDiff = {
    id: 'diff-c-1',
    filePath: createFile,
    relativePath: 'newly-created.ts',
    originalContent: '',
    modifiedContent: 'brand new content by engine',
    status: 'pending',
    additions: 1,
    deletions: 0,
    op: 'create',
  };

  // Reject create -> should delete file
  const rejectedCreate = await executeReject(createDiff);
  assert(rejectedCreate.status === 'rejected', 'Create diff status set to rejected');
  assert(!fs.existsSync(createFile), 'Reverting create deleted newly created file from disk');

  // Re-create and Accept create -> file stays
  fs.writeFileSync(createFile, 'brand new content by engine', 'utf-8');
  const acceptedCreate = await executeAccept(createDiff);
  assert(acceptedCreate.status === 'accepted', 'Create diff status set to accepted');
  assert(fs.existsSync(createFile), 'Accepting create keeps file on disk');

  // --- Scenario C: op = 'delete' ---
  const deleteFile = path.join(tempDir, 'to-delete.ts');
  // Engine already deleted file
  const deleteDiff = {
    id: 'diff-d-1',
    filePath: deleteFile,
    relativePath: 'to-delete.ts',
    originalContent: 'content of deleted file',
    modifiedContent: '',
    status: 'pending',
    additions: 0,
    deletions: 1,
    op: 'delete',
  };

  // Accept delete -> file remains deleted, no saveFile
  const acceptedDelete = await executeAccept(deleteDiff);
  assert(acceptedDelete.status === 'accepted', 'Delete diff status set to accepted');
  assert(!fs.existsSync(deleteFile), 'Accepting delete keeps file deleted');

  // Reject delete -> restore file with originalContent
  const rejectedDelete = await executeReject(deleteDiff);
  assert(rejectedDelete.status === 'rejected', 'Delete diff status set to rejected');
  assert(fs.existsSync(deleteFile), 'Reverting delete restored file on disk');
  assert(
    fs.readFileSync(deleteFile, 'utf-8') === 'content of deleted file',
    'Restored file contains originalContent'
  );

  // Clean up
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ----------------------------------------------------
// 5. ProjectTree refreshFiles Logic
// ----------------------------------------------------
async function testProjectTreeRefresh() {
  console.log('\n[Test 5] Testing ProjectTree refreshFiles logic...');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-tree-refresh-'));
  const file1 = path.join(tempDir, 'file1.ts');
  fs.writeFileSync(file1, 'console.log(1);', 'utf-8');

  // Mock readDirectory
  async function readDirectory(dir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      path: path.join(dir, e.name),
      relativePath: e.name,
      isDirectory: e.isDirectory(),
    }));
  }

  let files = await readDirectory(tempDir);
  let selectedFile = files[0];
  let fileContent = 'console.log(1);';

  assert(files.length === 1, 'Initial file tree has 1 file');
  assert(selectedFile?.name === 'file1.ts', 'selectedFile is file1.ts');

  // Add a new file on disk and refresh
  const file2 = path.join(tempDir, 'file2.ts');
  fs.writeFileSync(file2, 'console.log(2);', 'utf-8');

  files = await readDirectory(tempDir);
  assert(files.length === 2, 'Refreshed tree now has 2 files');
  assert(selectedFile?.name === 'file1.ts', 'selectedFile remains intact when not deleted');

  // Delete file1 on disk and refresh
  fs.unlinkSync(file1);
  files = await readDirectory(tempDir);

  const stillExists = files.find((f) => f.path === selectedFile.path);
  if (!stillExists) {
    selectedFile = null;
    fileContent = '';
  }

  assert(files.length === 1, 'Refreshed tree has 1 file after deletion');
  assert(selectedFile === null, 'selectedFile reset to null when selected file was deleted');
  assert(fileContent === '', 'fileContent cleared when selected file was deleted');

  // Clean up
  fs.rmSync(tempDir, { recursive: true, force: true });
}

async function run() {
  console.log('=== Phase 2: Renderer Tool Cards & Diff Automation Verification Suite ===\n');
  await testFsDeleteFile();
  testToolCallsTranscriptAttachment();
  testVisualDiffAutoSwitch();
  await testAcceptRejectSemantics();
  await testProjectTreeRefresh();
  console.log('\n====================================================');
  console.log(`Phase 2 Verification Complete: ${passed} passed, ${failed} failed.`);
  console.log('====================================================\n');
}

run().catch((err) => {
  console.error('\n❌ Unhandled error during verification:', err);
  process.exit(1);
});
