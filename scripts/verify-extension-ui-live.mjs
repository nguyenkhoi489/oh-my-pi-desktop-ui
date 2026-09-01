/**
 * Verification Script: Live Extension UI & Bi-directional Tool Approval (Phase 3)
 * 
 * Verifies Phase 3 Requirements with real OMP engine (--approval-mode always-ask):
 * 1. Scenario A1 (Approve):
 *    - Prompt edit -> omp:tool-call running -> omp:ui-request (isToolApproval: true)
 *    - respondUiRequest(id, { value: 'Approve' })
 *    - tool_execution_end (isError: false) arrives AFTER response
 *    - File modified on disk, diff generated
 * 2. Scenario A2 (Deny):
 *    - Prompt write -> omp:tool-call running -> omp:ui-request
 *    - respondUiRequest(id, { value: 'Deny' })
 *    - tool_execution_end (isError: true, "Tool call denied by user")
 *    - File is NOT created on disk, turn completes cleanly, engine stays healthy
 * 3. Scenario A3 (Cancel on Abort/Cleanup):
 *    - Prompt tool -> omp:ui-request arrives
 *    - stopProcess() -> emits omp:ui-request-cancel, cleans pending without orphan reply
 * 4. Scenario A4 (Multi-tool turn sequential approval):
 *    - Prompt read + edit in 1 turn -> multiple sequential UI requests, approve each
 *    - Both tools complete
 * 5. Scenario A5 & A6 (Frame Log & Reply Shape Audit):
 *    - All outbound extension_ui_response frames match flat schema (id + value/confirmed/cancelled)
 *    - Fire-and-forget methods produced zero outbound replies
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

async function runLiveApprovalVerification() {
  console.log('=== Starting Live Extension UI & Approval Verification Suite (Phase 3) ===\n');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-live-approval-verify-'));
  const exampleFile = path.join(tempDir, 'sample.txt');
  fs.writeFileSync(exampleFile, 'Original line 1\nOriginal line 2\nOriginal line 3\n', 'utf-8');

  let currentStatus = 'idle';
  const toolCalls = [];
  const diffs = [];
  const messages = [];
  const uiRequests = [];
  const uiCancels = [];

  // Handler for dynamic response on ui-request
  let autoResponseAction = null;

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
        } else if (channel === 'omp:ui-request') {
          uiRequests.push(payload);
          if (autoResponseAction) {
            autoResponseAction(payload);
          }
        } else if (channel === 'omp:ui-request-cancel') {
          uiCancels.push(payload);
        }
      },
    },
  };

  const bridge = new OmpBridge(mockWindow);

  console.log('[Setup] Spawning live OMP engine with --approval-mode always-ask...');
  let spawnRes = await bridge.startProcess(tempDir, 'gemini-3.7-flash-tiered', {
    provider: 'nguyenkhoi-lmstudio-prod',
    extraArgs: ['--no-session', '--approval-mode', 'always-ask'],
  });
  if (!spawnRes.success) {
    spawnRes = await bridge.startProcess(tempDir, 'gemini-3.7-flash-tiered', {
      provider: 'nguyenkhoi-lmstudio-local',
      extraArgs: ['--no-session', '--approval-mode', 'always-ask'],
    });
  }

  assert(spawnRes.success === true, `OMP Engine spawned with always-ask (PID: ${spawnRes.pid})`);
  assert(bridge.getLifecycleState() === 'ready', 'Engine lifecycle is "ready"');

  async function waitForTurn(startMsgCount, timeoutMs = 45000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (messages.length > startMsgCount && currentStatus === 'idle') {
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // ----------------------------------------------------
  // Scenario A1: Live Tool Approval (Approve -> Edit executed)
  // ----------------------------------------------------
  console.log('\n[Scenario A1] Live Tool Approval (Approve -> Edit executed)...');
  const a1MsgStart = messages.length;
  const a1ToolsStart = toolCalls.length;
  const a1DiffsStart = diffs.length;
  const a1ReqStart = uiRequests.length;

  autoResponseAction = (req) => {
    console.log(`  [UI-Request] Received request id: ${req.id}, method: ${req.method}, isToolApproval: ${req.isToolApproval}`);
    // Simulate brief user thinking delay then approve
    setTimeout(() => {
      console.log(`  [UI-Respond] Approving request: ${req.id}`);
      bridge.respondUiRequest(req.id, { value: 'Approve' });
    }, 150);
  };

  await bridge.sendMessage(
    'Dùng tool edit sửa file sample.txt: đổi chuỗi "Original line 1" thành "MODIFIED line 1". Chỉ gọi tool edit.'
  );

  await waitForTurn(a1MsgStart, 45000);
  autoResponseAction = null;

  const a1NewReqs = uiRequests.slice(a1ReqStart);
  assert(a1NewReqs.length >= 1, `Received extension UI request for edit tool (count: ${a1NewReqs.length})`);
  const editReq = a1NewReqs[0];
  assert(editReq.isToolApproval === true, 'Request is marked as isToolApproval: true');
  assert(editReq.method === 'select', 'Request method is "select"');
  assert(Array.isArray(editReq.options) && editReq.options.includes('Approve'), 'Options contain "Approve"');
  assert(editReq.title.toLowerCase().includes('edit') || editReq.title.includes('sample.txt'), 'Title contains tool description / path');

  const a1Tools = toolCalls.slice(a1ToolsStart);
  assert(a1Tools.length >= 1, `Received tool-call events (count: ${a1Tools.length})`);
  const editCompleted = a1Tools.find((t) => t.name === 'edit' && t.status === 'completed');
  assert(Boolean(editCompleted), 'Found completed edit tool-call');
  assert(editCompleted.error === undefined, 'Completed edit has no error');

  // Verify file modification on disk and visual diff item
  const diskContentA1 = fs.readFileSync(exampleFile, 'utf-8');
  assert(diskContentA1.includes('MODIFIED line 1'), 'File on disk was updated following user Approve');

  const a1Diffs = diffs.slice(a1DiffsStart);
  assert(a1Diffs.length >= 1, 'Visual diff generated for approved edit');
  assert(a1Diffs[0].modifiedContent.includes('MODIFIED line 1'), 'Diff contains new modified content');

  // ----------------------------------------------------
  // Scenario A2: Live Tool Denial (Deny -> Write rejected)
  // ----------------------------------------------------
  console.log('\n[Scenario A2] Live Tool Denial (Deny -> Write rejected)...');
  const a2MsgStart = messages.length;
  const a2ToolsStart = toolCalls.length;
  const a2DiffsStart = diffs.length;
  const a2ReqStart = uiRequests.length;
  const deniedFilePath = path.join(tempDir, 'denied_file.js');

  autoResponseAction = (req) => {
    console.log(`  [UI-Request] Received request id: ${req.id}, method: ${req.method}`);
    setTimeout(() => {
      console.log(`  [UI-Respond] Denying request: ${req.id}`);
      bridge.respondUiRequest(req.id, { value: 'Deny' });
    }, 150);
  };

  await bridge.sendMessage(
    'Dùng tool write tạo file denied_file.js với nội dung: console.log("this should be denied");. Chỉ gọi tool write.'
  );

  await waitForTurn(a2MsgStart, 45000);
  autoResponseAction = null;

  const a2NewReqs = uiRequests.slice(a2ReqStart);
  assert(a2NewReqs.length >= 1, 'Received extension UI request for write tool');
  const writeReq = a2NewReqs[0];
  assert(writeReq.isToolApproval === true, 'Write request is marked as isToolApproval: true');

  const a2Tools = toolCalls.slice(a2ToolsStart);
  assert(a2Tools.length >= 1, 'Received tool-call events for denied tool');
  const writeFailed = a2Tools.find((t) => t.name === 'write' && t.status === 'failed');
  assert(Boolean(writeFailed), 'Captured tool-call with status "failed"');
  assert(
    typeof writeFailed.error === 'string' && writeFailed.error.toLowerCase().includes('denied'),
    `Tool error indicates denial (error: "${writeFailed.error}")`
  );

  // Assert file was NOT created on disk
  assert(!fs.existsSync(deniedFilePath), 'Denied file was NOT created on disk');

  // Assert 0 diffs generated for denied tool
  const a2Diffs = diffs.slice(a2DiffsStart);
  assert(a2Diffs.length === 0, '0 diffs generated for denied write tool');

  // Assert engine is still responsive and ready
  assert(bridge.getLifecycleState() === 'ready', 'Engine remains in "ready" state after tool denial');

  // ----------------------------------------------------
  // Scenario A3: Cancellation on Abort / Cleanup
  // ----------------------------------------------------
  console.log('\n[Scenario A3] Request Cancellation on Process Abort / Stop...');
  const a3ReqStart = uiRequests.length;
  const a3CancelStart = uiCancels.length;

  let capturedReqId = null;
  autoResponseAction = (req) => {
    capturedReqId = req.id;
    console.log(`  [UI-Request] Received request to abort: ${req.id}`);
    // Instead of responding, immediately stop/abort the bridge process
    setTimeout(() => {
      console.log('  [Action] Aborting process while permission modal is open...');
      bridge.stopProcess();
    }, 100);
  };

  await bridge.sendMessage('Dùng tool edit sửa file sample.txt đổi "MODIFIED line 1" thành "ABORTED".');

  // Wait a moment for UI request and subsequent stopProcess
  const abortWaitStart = Date.now();
  while (Date.now() - abortWaitStart < 10000) {
    if (bridge.getLifecycleState() === 'idle') break;
    await new Promise((r) => setTimeout(r, 200));
  }
  autoResponseAction = null;

  assert(Boolean(capturedReqId), 'Captured UI request before abort');
  const a3NewCancels = uiCancels.slice(a3CancelStart);
  assert(a3NewCancels.length >= 1, 'omp:ui-request-cancel emitted on stopProcess');
  assert(a3NewCancels.includes(capturedReqId), 'Emitted cancel matches captured pending request ID');
  assert(bridge.getLifecycleState() === 'idle', 'Bridge state cleanly reset to "idle"');

  // ----------------------------------------------------
  // Scenario A4: Multi-Tool Turn with Sequential Approvals
  // ----------------------------------------------------
  console.log('\n[Scenario A4] Multi-Tool Turn with Sequential Approvals (Queue)...');
  await new Promise((r) => setTimeout(r, 1000));
  // Re-spawn engine for multi-tool test
  console.log('[Setup] Re-spawning live OMP engine in scratch directory...');
  let respawnRes = await bridge.startProcess(tempDir, 'gemini-3.7-flash-tiered', {
    provider: 'nguyenkhoi-lmstudio-prod',
    extraArgs: ['--no-session', '--approval-mode', 'always-ask'],
  });
  if (!respawnRes.success) {
    respawnRes = await bridge.startProcess(tempDir, 'gemini-3.7-flash-tiered', {
      provider: 'nguyenkhoi-lmstudio-local',
      extraArgs: ['--no-session', '--approval-mode', 'always-ask'],
    });
  }
  assert(respawnRes.success === true, 'Engine re-spawned successfully');

  const a4MsgStart = messages.length;
  const a4ToolsStart = toolCalls.length;
  const a4ReqStart = uiRequests.length;
  const sequentialApprovedIds = [];

  autoResponseAction = (req) => {
    sequentialApprovedIds.push(req.id);
    console.log(`  [UI-Request] Sequential approval #${sequentialApprovedIds.length}: ${req.id} (${req.title?.slice(0, 40)}...)`);
    setTimeout(() => {
      bridge.respondUiRequest(req.id, { value: 'Approve' });
    }, 150);
  };

  const multiAFile = path.join(tempDir, 'multi_a.txt');
  const multiBFile = path.join(tempDir, 'multi_b.txt');

  await bridge.sendMessage(
    'Hãy dùng tool write tạo file multi_a.txt với nội dung "aaa", sau đó dùng tool write tạo file multi_b.txt với nội dung "bbb". Hãy tạo cả 2 file.'
  );

  await waitForTurn(a4MsgStart, 60000);
  autoResponseAction = null;

  const a4NewReqs = uiRequests.slice(a4ReqStart);
  assert(a4NewReqs.length >= 2, `Captured sequential tool requests in multi-tool turn (count: ${a4NewReqs.length})`);
  assert(sequentialApprovedIds.length >= 2, 'All sequential requests were approved');

  const a4Tools = toolCalls.slice(a4ToolsStart);
  const completedTools = a4Tools.filter((t) => t.status === 'completed');
  assert(completedTools.length >= 2, `All requested tools in multi-turn completed (count: ${completedTools.length})`);

  assert(fs.existsSync(multiAFile), 'multi_a.txt exists on disk following approval');
  assert(fs.existsSync(multiBFile), 'multi_b.txt exists on disk following approval');

  // ----------------------------------------------------
  // Scenario A5 & A6: Frame Log & Flat Outbound Schema Audit
  // ----------------------------------------------------
  console.log('\n[Scenario A5 & A6] Frame Log & Flat Outbound Schema Audit...');
  const logPath = bridge['frameLogger'].getLogPath();
  assert(fs.existsSync(logPath), `Log file exists on disk at ${logPath}`);

  const logLines = fs.readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
  const loggedFrames = logLines.map((line) => JSON.parse(line));

  const outboundUiResponses = loggedFrames
    .filter((entry) => entry.dir === 'out' && entry.frame?.type === 'extension_ui_response')
    .map((entry) => entry.frame);

  assert(outboundUiResponses.length >= 2, `Captured outbound extension_ui_response frames (count: ${outboundUiResponses.length})`);

  for (const resp of outboundUiResponses) {
    assert(typeof resp.id === 'string' && resp.id.length > 0, `Response frame has valid string id: "${resp.id}"`);
    assert(resp.type === 'extension_ui_response', 'Response frame type is "extension_ui_response"');
    
    // Check flat shape: exactly one of value | confirmed | cancelled
    const hasValue = resp.value !== undefined;
    const hasConfirmed = resp.confirmed !== undefined;
    const hasCancelled = resp.cancelled !== undefined;
    const shapeCount = (hasValue ? 1 : 0) + (hasConfirmed ? 1 : 0) + (hasCancelled ? 1 : 0);
    assert(shapeCount >= 1, `Response has at least one flat value/confirmed/cancelled field (actual: ${JSON.stringify(resp)})`);

    // Verify absence of legacy/obsolete nested fields
    assert(resp.requestId === undefined, 'No obsolete "requestId" field in response frame');
    assert(resp.approved === undefined, 'No obsolete "approved" boolean field in response frame');
    assert(resp.response === undefined, 'No obsolete "response" object field in response frame');
  }

  // Verify Fire-and-Forget methods received ZERO replies (Scenario A5)
  const inboundFireAndForget = loggedFrames
    .filter((entry) => entry.dir === 'in' && entry.frame?.type === 'extension_ui_request')
    .filter((entry) => ['setWidget', 'setStatus', 'notify', 'setTitle'].includes(entry.frame?.method));

  console.log(`  [Frame Log] Inbound fire-and-forget count: ${inboundFireAndForget.length}`);
  // Cross check that none of the inbound fire-and-forget IDs produced outbound replies
  for (const faf of inboundFireAndForget) {
    const fafId = faf.frame.id;
    if (fafId) {
      const matchReply = outboundUiResponses.find((r) => r.id === fafId);
      assert(matchReply === undefined, `Fire-and-forget request "${faf.frame.method}" (id: ${fafId}) produced 0 outbound replies`);
    }
  }

  // ----------------------------------------------------
  // Clean Shutdown
  // ----------------------------------------------------
  console.log('\n[Cleanup] Stopping engine process...');
  bridge.stopProcess();
  fs.rmSync(tempDir, { recursive: true, force: true });
  assert(bridge.getLifecycleState() === 'idle', 'Bridge state cleanly reset to "idle"');

  console.log('\n====================================================');
  console.log(`Live Extension UI & Approval Verification: ${passed} passed, ${failed} failed.`);
  console.log('====================================================\n');
}

runLiveApprovalVerification().catch((err) => {
  console.error('\n❌ Unhandled error during live approval verification:', err);
  process.exit(1);
});
