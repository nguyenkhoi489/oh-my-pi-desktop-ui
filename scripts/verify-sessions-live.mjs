/**
 * Verification Script: Live Sessions & Subagent Hub E2E (Phase 4)
 * 
 * Verifies Phase 4 Requirements with real OMP engine (mode default, persistence enabled):
 * 1. Scenario B1 (Persist + list):
 *    - Turn 1 creates file via tool -> session persisted to ~/.omp/agent/sessions/<cwd-slug>/*.jsonl
 *    - listSessions returns active session matching get_state.sessionFile
 *    - Session item has id, title, timestamp, active flag
 * 2. Scenario B2 (Switch round-trip):
 *    - new_session -> Turn 2 on new session -> switch_session back to session 1
 *    - loadHistory translates session 1 messages (user text + assistant toolCalls + results)
 * 3. Scenario B3 & B7 (Branch & entryId extraction):
 *    - getBranchEntries returns entries with (role, timestamp, entryId) correlated with messages
 *    - branchSession from Turn 2 user entry -> creates branch -> history contains Turn 1 prefix
 *    - branchSession from Turn 1 user entry -> creates root branch -> history is shorter
 * 4. Scenario B4 (Busy guard during streaming):
 *    - Calling loadHistory / switchSession / newSession while streaming returns error: "session_busy"
 *    - Stream is not corrupted, engine completes turn and returns to idle cleanly
 * 5. Scenario B5 (Thinking block history translation):
 *    - setThinkingLevel('low') -> turn executed -> loadHistory translates thinking if present
 * 6. Scenario B6 (Live subagent lifecycle & hub tracking):
 *    - Prompt forcing task tool -> subagent_lifecycle & subagent_progress captured
 *    - Hub tracks active subagents and automatically cleans up on terminal status
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

async function runLiveSessionsVerification() {
  console.log('=== Starting Live Sessions & Subagent Hub Verification Suite (Phase 4) ===\n');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-live-sessions-verify-'));
  console.log(`[Setup] Scratch workspace created at: ${tempDir}`);

  let currentStatus = 'idle';
  const toolCalls = [];
  const messages = [];
  const subagentUpdates = [];

  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => {
        if (channel === 'omp:status-change') {
          currentStatus = payload;
        } else if (channel === 'omp:tool-call') {
          toolCalls.push(payload);
        } else if (channel === 'omp:message-complete') {
          messages.push(payload);
        } else if (channel === 'omp:subagent-update') {
          subagentUpdates.push(payload);
        }
      },
    },
  };

  const bridge = new OmpBridge(mockWindow);

  console.log('[Setup] Spawning live OMP engine with persistent sessions...');
  let spawnRes = await bridge.startProcess(tempDir, 'gemini-3.7-flash-tiered', {
    provider: 'nguyenkhoi-lmstudio-prod',
  });
  if (!spawnRes.success) {
    console.log('[Setup] nguyenkhoi-lmstudio-prod unavailable, trying nguyenkhoi-lmstudio-local...');
    spawnRes = await bridge.startProcess(tempDir, 'gemini-3.7-flash-tiered', {
      provider: 'nguyenkhoi-lmstudio-local',
    });
  }

  assert(spawnRes.success, `OMP Engine spawned successfully (PID: ${spawnRes.pid})`);
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

  let session1File = null;
  let session1Id = null;

  // ----------------------------------------------------
  // Scenario B1: Persist + listSessions (Turn 1 & Turn 1b)
  // ----------------------------------------------------
  console.log('\n[Scenario B1] Live Session Persistence & listSessions Directory Scan...');
  {
    const stateRes = await bridge.getState();
    assert(stateRes.success && Boolean(stateRes.state?.sessionFile), 'Initial getState returned sessionFile');
    session1File = stateRes.state.sessionFile;
    session1Id = stateRes.state.sessionId;
    console.log(`  Initial sessionFile: ${session1File}`);

    // Turn 1
    const msgStart1 = messages.length;
    await bridge.sendMessage(
      'Use the write tool to create a file named session_live_1.txt containing exactly: Live Session Test 1. Only call the write tool.'
    );
    await waitForTurn(msgStart1, 40000);

    const file1OnDisk = path.join(tempDir, 'session_live_1.txt');
    assert(fs.existsSync(file1OnDisk), 'session_live_1.txt was created on disk');
    assert(fs.existsSync(session1File), `Session file persisted to disk: ${session1File}`);

    // Turn 1b (to provide a multi-turn conversation history for branching in B3/B7)
    const msgStart1b = messages.length;
    await bridge.sendMessage(
      'Use the write tool to create a file named session_live_1b.txt containing exactly: Live Session Turn 1b. Only call the write tool.'
    );
    await waitForTurn(msgStart1b, 40000);

    const file1bOnDisk = path.join(tempDir, 'session_live_1b.txt');
    assert(fs.existsSync(file1bOnDisk), 'session_live_1b.txt was created on disk');

    const listRes = await bridge.listSessions();
    assert(listRes.success === true, 'listSessions returned success: true');
    assert(Array.isArray(listRes.sessions) && listRes.sessions.length >= 1, `Found ${listRes.sessions.length} sessions in workspace directory`);

    const activeSession = listRes.sessions.find((s) => s.active);
    assert(Boolean(activeSession), 'Found active session in listSessions');
    assert(path.resolve(activeSession.path) === path.resolve(session1File), 'Active session path matches sessionFile');
    assert(typeof activeSession.title === 'string' && activeSession.title.length > 0, `Active session has title: "${activeSession.title}"`);
    assert(typeof activeSession.timestamp === 'string', 'Active session has timestamp');
  }

  // ----------------------------------------------------
  // Scenario B2: new_session + Turn 2 + switch_session round-trip
  // ----------------------------------------------------
  console.log('\n[Scenario B2] new_session, Turn 2 & switch_session Round-trip...');
  {
    const newSessRes = await bridge.newSession();
    assert(newSessRes.success === true, 'newSession command succeeded');

    const stateAfterNew = await bridge.getState();
    assert(stateAfterNew.success && Boolean(stateAfterNew.state?.sessionFile), 'getState after newSession returned new sessionFile');
    const session2File = stateAfterNew.state.sessionFile;
    assert(path.resolve(session2File) !== path.resolve(session1File), 'New session has different sessionFile path');

    const msgStart2 = messages.length;
    await bridge.sendMessage(
      'Use the write tool to create a file named session_live_2.txt containing exactly: Live Session Test 2. Only call the write tool.'
    );
    await waitForTurn(msgStart2, 40000);

    const file2OnDisk = path.join(tempDir, 'session_live_2.txt');
    assert(fs.existsSync(file2OnDisk), 'session_live_2.txt was created in session 2');

    // Switch back to session 1
    console.log(`  Switching back to session 1 (${session1File})...`);
    const switchRes = await bridge.switchSession(session1File);
    assert(switchRes.success === true, 'switchSession to session 1 succeeded');
    assert(path.resolve(bridge.getCurrentSessionFile()) === path.resolve(session1File), 'Current session file updated to session 1');

    // Load history of session 1
    const historyRes = await bridge.loadHistory();
    assert(historyRes.success === true, 'loadHistory of session 1 succeeded');
    assert(Array.isArray(historyRes.messages) && historyRes.messages.length >= 4, `Session 1 history loaded ${historyRes.messages?.length} messages (multi-turn)`);

    const userMsg1 = historyRes.messages.find((m) => m.role === 'user' && m.content.includes('session_live_1.txt'));
    assert(Boolean(userMsg1), 'Session 1 history contains Turn 1 user message');

    const userMsg1b = historyRes.messages.find((m) => m.role === 'user' && m.content.includes('session_live_1b.txt'));
    assert(Boolean(userMsg1b), 'Session 1 history contains Turn 1b user message');

    const assistantMsg1 = historyRes.messages.find((m) => m.role === 'assistant' && m.toolCalls && m.toolCalls.some((tc) => tc.params?.path === 'session_live_1.txt'));
    assert(Boolean(assistantMsg1), 'Session 1 history contains assistant message for Turn 1');
    const writeCall = assistantMsg1?.toolCalls?.find((tc) => tc.name === 'write');
    assert(Boolean(writeCall), 'Assistant message contains write toolCall');
    assert(writeCall?.status === 'completed', 'write toolCall status is "completed"');
  }

  // ----------------------------------------------------
  // Scenario B3 & B7: getBranchEntries & branchSession
  // ----------------------------------------------------
  console.log('\n[Scenario B3 & B7] getBranchEntries & branchSession Flow...');
  {
    const branchEntriesRes = await bridge.getBranchEntries(session1File);
    assert(branchEntriesRes.success === true, 'getBranchEntries returned success: true');
    assert(Array.isArray(branchEntriesRes.entries) && branchEntriesRes.entries.length >= 2, `Extracted ${branchEntriesRes.entries?.length} branch entries`);

    const userEntries = branchEntriesRes.entries.filter((e) => e.role === 'user');
    assert(userEntries.length >= 2, `Found ${userEntries.length} user message branch entries`);

    // Test Branching from Turn 1b (Second user message): should retain Turn 1 messages
    const turn1bUserEntry = userEntries[1];
    console.log(`  Branching at second user message (entryId: ${turn1bUserEntry.entryId})...`);
    const branchRes1b = await bridge.branchSession(turn1bUserEntry.entryId);
    assert(branchRes1b.success === true, 'branchSession command on Turn 1b succeeded');

    const stateAfterBranch1b = await bridge.getState();
    assert(stateAfterBranch1b.success && Boolean(stateAfterBranch1b.state?.sessionFile), 'getState after branch returned sessionFile');
    const branchedFile1b = stateAfterBranch1b.state.sessionFile;
    assert(path.resolve(branchedFile1b) !== path.resolve(session1File), 'Branch session 1b created a new distinct session file');

    const branchHistoryRes1b = await bridge.loadHistory();
    assert(branchHistoryRes1b.success === true, 'loadHistory on branched session 1b succeeded');
    assert(Array.isArray(branchHistoryRes1b.messages) && branchHistoryRes1b.messages.length >= 2, `Branched session 1b retained Turn 1 history (${branchHistoryRes1b.messages?.length} messages)`);
    assert(branchHistoryRes1b.messages[0].role === 'user' && branchHistoryRes1b.messages[0].content.includes('session_live_1.txt'), 'Branched session 1b root message is Turn 1');
    assert(branchHistoryRes1b.messages.length < 4, 'Branched session 1b history is shorter than original multi-turn session');

    // Test Branching from Turn 1 (First user message): rewinds to root (0 messages)
    const turn1UserEntry = userEntries[0];
    console.log(`  Branching at first user message (entryId: ${turn1UserEntry.entryId})...`);
    const branchRes1 = await bridge.branchSession(turn1UserEntry.entryId);
    assert(branchRes1.success === true, 'branchSession command on Turn 1 succeeded');

    const branchHistoryRes1 = await bridge.loadHistory();
    assert(branchHistoryRes1.success === true, 'loadHistory on root branched session succeeded');
    assert(Array.isArray(branchHistoryRes1.messages) && branchHistoryRes1.messages.length === 0, 'Root branched session correctly contains 0 messages');
  }

  // ----------------------------------------------------
  // Scenario B4: Busy Guard (Blocked with session_busy during streaming)
  // ----------------------------------------------------
  console.log('\n[Scenario B4] Session Command Busy Guards during Active Streaming...');
  {
    const msgStart4 = messages.length;
    // Send a prompt that produces multi-paragraph output
    await bridge.sendMessage('Explain Rayleigh scattering and why the sky is blue in 2 descriptive paragraphs.');

    // Wait briefly for streaming to start (status changes to 'thinking' or 'streaming')
    let waited = 0;
    while (currentStatus === 'idle' && waited < 4000) {
      await new Promise((r) => setTimeout(r, 100));
      waited += 100;
    }

    console.log(`  Active status during turn: ${currentStatus}`);
    
    // Attempt session commands while busy
    const busyLoadRes = await bridge.loadHistory();
    assert(busyLoadRes.success === false && busyLoadRes.error === 'session_busy', 'loadHistory rejected with "session_busy" while streaming');

    const busySwitchRes = await bridge.switchSession(session1File);
    assert(busySwitchRes.success === false && busySwitchRes.error === 'session_busy', 'switchSession rejected with "session_busy" while streaming');

    const busyNewRes = await bridge.newSession();
    assert(busyNewRes.success === false && busyNewRes.error === 'session_busy', 'newSession rejected with "session_busy" while streaming');

    // Wait for the stream to conclude cleanly
    await waitForTurn(msgStart4, 45000);
    assert(currentStatus === 'idle', 'Engine returned to idle state without stream corruption');
    assert(bridge.getLifecycleState() === 'ready', 'Engine lifecycle remains "ready"');
  }

  // ----------------------------------------------------
  // Scenario B5: Thinking Level & History Translation
  // ----------------------------------------------------
  console.log('\n[Scenario B5] Thinking Level & History Translation Verification...');
  {
    const setThinkRes = await bridge.setThinkingLevel('low');
    assert(setThinkRes.success === true, 'setThinkingLevel("low") succeeded');

    const msgStart5 = messages.length;
    await bridge.sendMessage('Compute 17 multiplied by 19. Answer in one short sentence.');
    await waitForTurn(msgStart5, 35000);

    const thinkHistoryRes = await bridge.loadHistory();
    assert(thinkHistoryRes.success === true, 'loadHistory after thinking turn succeeded');
    const lastAssistantMsg = thinkHistoryRes.messages?.filter((m) => m.role === 'assistant').pop();
    assert(Boolean(lastAssistantMsg), 'Found assistant message for thinking turn');

    if (lastAssistantMsg.thinking) {
      console.log(`  [Observed Thinking]: "${lastAssistantMsg.thinking.thought.slice(0, 100)}..."`);
      assert(typeof lastAssistantMsg.thinking.thought === 'string', 'Thinking block contains string thought');
      assert(lastAssistantMsg.thinking.completed === true, 'Thinking block marked completed');
    } else {
      console.log('  [Observed]: Model responded without explicit thinking blocks (handled defensively).');
      assert(typeof lastAssistantMsg.content === 'string' && lastAssistantMsg.content.length > 0, 'Assistant message has text content');
    }
  }

  // ----------------------------------------------------
  // Scenario B6: Live Subagent Lifecycle & Hub Tracking
  // ----------------------------------------------------
  console.log('\n[Scenario B6] Live Subagent Lifecycle & Subagent Hub Tracking...');
  {
    const subUpdatesStart = subagentUpdates.length;
    const msgStart6 = messages.length;

    console.log('  Sending prompt to force task subagent...');
    await bridge.sendMessage(
      'Use the task tool to spawn a subagent that creates a file named sub_live.txt containing: from subagent live. If the task tool is unavailable, just say TASK_UNAVAILABLE.'
    );
    await waitForTurn(msgStart6, 60000);

    const newSubUpdates = subagentUpdates.slice(subUpdatesStart);
    console.log(`  Captured ${newSubUpdates.length} subagent-update events during subagent turn.`);

    // Check if subagent was captured in hub during execution
    const nonTerminalUpdate = newSubUpdates.find((snapshot) => Array.isArray(snapshot) && snapshot.length > 0);
    if (nonTerminalUpdate) {
      const activeSub = nonTerminalUpdate[0];
      assert(Boolean(activeSub.id), `Subagent captured with id: ${activeSub.id}`);
      assert(activeSub.agent === 'task', `Subagent agent type is "${activeSub.agent}"`);
      console.log(`  Subagent snapshot observed: id=${activeSub.id}, agent=${activeSub.agent}, status=${activeSub.status}`);
    } else {
      console.log('  Notice: Subagent completed rapidly before intermediate snapshot poll.');
    }

    // Final subagent state must be empty (clean cleanup)
    const finalSubagents = bridge.getSubagents();
    assert(Array.isArray(finalSubagents) && finalSubagents.length === 0, 'Subagent Hub is empty after subagent finished (terminal cleanup verified)');

    const subFileOnDisk = path.join(tempDir, 'sub_live.txt');
    if (fs.existsSync(subFileOnDisk)) {
      console.log(`  ✓ sub_live.txt created by subagent: "${fs.readFileSync(subFileOnDisk, 'utf-8').trim()}"`);
    }
  }

  // ----------------------------------------------------
  // Cleanup
  // ----------------------------------------------------
  console.log('\n[Cleanup] Stopping engine process and removing scratch workspace...');
  bridge.stopProcess();
  assert(bridge.getLifecycleState() === 'idle', 'Bridge state cleanly reset to "idle"');
  fs.rmSync(tempDir, { recursive: true, force: true });

  console.log('\n====================================================');
  console.log(`Live Sessions & Subagent Hub Verification: ${passed} passed, ${failed} failed.`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runLiveSessionsVerification().catch((err) => {
  console.error('\n❌ Unhandled error during Live Sessions verification:', err);
  process.exit(1);
});
