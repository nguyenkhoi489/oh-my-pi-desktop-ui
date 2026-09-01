/**
 * Verification Script: Live Tool Events & Visual Diff E2E Integration
 * 
 * Verifies Phase 3 Requirements with real OMP engine:
 * 1. Live `edit` tool execution -> omp:tool-call running/completed, omp:diff-generated (op: update)
 * 2. Live `write` tool execution -> omp:tool-call running/completed, omp:diff-generated (op: create)
 * 3. Reject semantics: restoring edit originalContent and deleting created files
 * 4. Live tool failure handling -> omp:tool-call failed, 0 diffs, graceful recovery
 * 5. Live multi-tool turn -> ordered tool execution (read then edit)
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

async function runLiveVerification() {
  console.log('=== Starting Live Tool Events & Diff Verification Suite ===\n');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-live-tool-verify-'));
  const exampleFile = path.join(tempDir, 'example.txt');
  fs.writeFileSync(exampleFile, 'Line 1: Alpha initial\nLine 2: Beta initial\nLine 3: Gamma initial\n', 'utf-8');

  let currentStatus = 'idle';
  const toolCalls = [];
  const diffs = [];
  const messages = [];

  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => {
        if (channel === 'omp:status-change') {
          currentStatus = payload;
        } else if (channel === 'omp:tool-call') {
          toolCalls.push(payload);
        } else if (channel === 'omp:diff-generated') {
          diffs.push(payload);
        } else if (channel === 'omp:message-complete') {
          messages.push(payload);
        }
      },
    },
  };

  const bridge = new OmpBridge(mockWindow);

  console.log('[Setup] Spawning live OMP engine in scratch directory:', tempDir);
  let spawnRes = await bridge.startProcess(tempDir, 'gemini-3.7-flash-tiered', {
    provider: 'nguyenkhoi-lmstudio-prod',
    extraArgs: ['--no-session'],
  });
  if (!spawnRes.success) {
    spawnRes = await bridge.startProcess(tempDir, 'gemini-3.7-flash-tiered', {
      provider: 'nguyenkhoi-lmstudio-local',
      extraArgs: ['--no-session'],
    });
  }

  assert(spawnRes.success === true, `OMP Engine spawned successfully (PID: ${spawnRes.pid})`);
  assert(bridge.getLifecycleState() === 'ready', 'Engine lifecycle is "ready"');

  async function waitForTurn(startMsgCount, timeoutMs = 40000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (messages.length > startMsgCount && currentStatus === 'idle') {
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // ----------------------------------------------------
  // Test 1: Live Edit Tool Execution (Scenario S1)
  // ----------------------------------------------------
  console.log('\n[Test 1] Live Edit Tool Execution & Diff Generation (S1)...');
  const t1MsgStart = messages.length;
  const t1ToolsStart = toolCalls.length;
  const t1DiffsStart = diffs.length;

  await bridge.sendMessage(
    'Dùng tool edit thay đổi file example.txt: đổi chuỗi "Alpha initial" thành "Alpha UPDATED". Chỉ gọi tool edit.'
  );
  await waitForTurn(t1MsgStart, 40000);

  const t1Tools = toolCalls.slice(t1ToolsStart);
  const t1Diffs = diffs.slice(t1DiffsStart);

  assert(t1Tools.length >= 1, `Received tool-call events for edit (count: ${t1Tools.length})`);
  const editCompleted = t1Tools.find((t) => t.name === 'edit' && t.status === 'completed');
  assert(Boolean(editCompleted), 'Found completed edit tool-call');
  assert(typeof editCompleted.endTime === 'number', 'Completed tool has valid endTime');

  assert(t1Diffs.length >= 1, `Generated FileDiffItem for edit (count: ${t1Diffs.length})`);
  const editDiff = t1Diffs[0];
  assert(editDiff.op === 'update', 'Diff op is "update"');
  assert(editDiff.relativePath.includes('example.txt'), 'Diff relativePath references example.txt');
  assert(editDiff.originalContent.includes('Alpha initial'), 'originalContent contains old text');
  assert(editDiff.modifiedContent.includes('Alpha UPDATED'), 'modifiedContent contains new text');
  assert(editDiff.status === 'pending', 'Initial diff status is "pending"');
  assert(editDiff.additions === 1, `Additions count is 1 (actual: ${editDiff.additions})`);
  assert(editDiff.deletions === 1, `Deletions count is 1 (actual: ${editDiff.deletions})`);

  const fileOnDisk = fs.readFileSync(exampleFile, 'utf-8');
  assert(fileOnDisk.includes('Alpha UPDATED'), 'File on disk was updated by the engine');

  // ----------------------------------------------------
  // Test 2: Live Write Tool Execution (Scenario S2)
  // ----------------------------------------------------
  console.log('\n[Test 2] Live Write Tool Execution & Diff Generation (S2)...');
  const t2MsgStart = messages.length;
  const t2ToolsStart = toolCalls.length;
  const t2DiffsStart = diffs.length;
  const createdFilePath = path.join(tempDir, 'created.js');

  await bridge.sendMessage(
    'Dùng tool write tạo file created.js với nội dung: console.log("live created file");. Chỉ gọi tool write.'
  );
  await waitForTurn(t2MsgStart, 40000);

  const t2Tools = toolCalls.slice(t2ToolsStart);
  const t2Diffs = diffs.slice(t2DiffsStart);

  assert(t2Tools.length >= 1, `Received tool-call events for write (count: ${t2Tools.length})`);
  const writeCompleted = t2Tools.find((t) => t.name === 'write' && t.status === 'completed');
  assert(Boolean(writeCompleted), 'Found completed write tool-call');

  assert(t2Diffs.length >= 1, `Generated FileDiffItem for write (count: ${t2Diffs.length})`);
  const writeDiff = t2Diffs[0];
  assert(writeDiff.op === 'create', 'Diff op is "create" for newly created file');
  assert(writeDiff.originalContent === '', 'originalContent is empty for created file');
  assert(writeDiff.modifiedContent.includes('live created file'), 'modifiedContent contains written content');
  assert(fs.existsSync(createdFilePath), 'Created file exists on disk');

  // ----------------------------------------------------
  // Test 3: Reject Semantics for S1 & S2 (Scenario S3)
  // ----------------------------------------------------
  console.log('\n[Test 3] Reject Semantics Verification (S3)...');
  // Revert S1 (edit) using originalContent
  fs.writeFileSync(editDiff.filePath, editDiff.originalContent, 'utf-8');
  const revertedDiskContent = fs.readFileSync(exampleFile, 'utf-8');
  assert(revertedDiskContent.includes('Alpha initial'), 'Rejecting edit restored original file content');

  // Revert S2 (write create) by unlinking
  fs.unlinkSync(writeDiff.filePath);
  assert(!fs.existsSync(createdFilePath), 'Rejecting create removed file from disk');

  // ----------------------------------------------------
  // Test 4: Live Tool Failure Handling (Scenario S4)
  // ----------------------------------------------------
  console.log('\n[Test 4] Live Tool Failure Handling (S4)...');
  const t4MsgStart = messages.length;
  const t4ToolsStart = toolCalls.length;
  const t4DiffsStart = diffs.length;

  await bridge.sendMessage('Dùng tool read đọc file non_existent_live_file_9999.txt.');
  await waitForTurn(t4MsgStart, 40000);

  const t4Tools = toolCalls.slice(t4ToolsStart);
  const t4Diffs = diffs.slice(t4DiffsStart);

  assert(t4Tools.length >= 1, 'Received tool-call event for failing tool');
  const failedTool = t4Tools.find((t) => t.status === 'failed');
  assert(Boolean(failedTool), 'Captured tool with status "failed"');
  assert(t4Diffs.length === 0, '0 diffs generated for failed tool execution');
  assert(bridge.getLifecycleState() === 'ready', 'Engine bridge remained healthy and ready');

  // ----------------------------------------------------
  // Test 5: Multi-Tool Turn Execution (Scenario S5)
  // ----------------------------------------------------
  console.log('\n[Test 5] Multi-Tool Turn Execution (S5)...');
  const t5MsgStart = messages.length;
  const t5ToolsStart = toolCalls.length;
  const t5DiffsStart = diffs.length;

  await bridge.sendMessage(
    'Hãy dùng tool read đọc file example.txt, sau đó dùng tool edit thay "Beta initial" thành "Beta MULTI-TURN".'
  );
  await waitForTurn(t5MsgStart, 45000);

  const t5Tools = toolCalls.slice(t5ToolsStart);
  const t5Diffs = diffs.slice(t5DiffsStart);

  assert(t5Tools.length >= 2, `Multi-tool turn captured multiple tool events (count: ${t5Tools.length})`);
  assert(t5Diffs.length >= 1, `Multi-tool turn produced diff for edit (count: ${t5Diffs.length})`);
  const finalDisk = fs.readFileSync(exampleFile, 'utf-8');
  assert(finalDisk.includes('Beta MULTI-TURN'), 'Multi-tool edit persisted to disk');

  // ----------------------------------------------------
  // Clean Shutdown
  // ----------------------------------------------------
  console.log('\n[Cleanup] Stopping engine process...');
  bridge.stopProcess();
  fs.rmSync(tempDir, { recursive: true, force: true });
  assert(bridge.getLifecycleState() === 'idle', 'Bridge state cleanly reset to "idle"');

  console.log('\n====================================================');
  console.log(`Live Tool Events Verification: ${passed} passed, ${failed} failed.`);
  console.log('====================================================\n');
}

runLiveVerification().catch((err) => {
  console.error('\n❌ Unhandled error during live verification:', err);
  process.exit(1);
});
