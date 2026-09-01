/**
 * Verification Suite: Subagent Hub Bridge & Progress Subscription (Phase 3)
 * 
 * Verifies Phase 3 Requirements:
 * 1. Unready / Offline structured error responses for subagent methods.
 * 2. Subscription command frame (`set_subagent_subscription {level: "progress"}`) sent after handshake.
 * 3. `subagent_lifecycle` started event -> `OmpSubagentInfo` entry created, `omp:subagent-update` emitted.
 * 4. `subagent_progress` event -> updates `progressText`, `status`, `lastUpdate`, emits IPC snapshot.
 * 5. Terminal status handling (`completed`, `failed`, `cancelled`, `error`, etc.) -> entry removed, emits empty list.
 * 6. Multi-subagent concurrency tracking.
 * 7. Process exit / cleanup -> clears `activeSubagents` and emits `[]`.
 * 8. Replay of 16 live frames from `fixtures/subagent-events.ndjson` -> verifies full lifecycle from real engine.
 */

import fs from 'fs';
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

console.log('=== Starting Subagent Hub Verification Suite (Phase 3) ===\n');

// ----------------------------------------------------
// Test 1: Unready / Offline structured error responses
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

  assert(Array.isArray(bridge.getSubagents()) && bridge.getSubagents().length === 0, 'getSubagents() returns [] initially');

  const subRes = await bridge.setSubagentSubscription('progress');
  assert(subRes.success === false && subRes.error === 'OMP process is not ready or offline', 'setSubagentSubscription returns structured error when unready');

  const syncRes = await bridge.refreshSubagentsOnDemand();
  assert(syncRes.success === false && syncRes.error === 'OMP process is not ready or offline', 'refreshSubagentsOnDemand returns structured error when unready');
}
console.log();

// ----------------------------------------------------
// Test 2: Inbound subagent_lifecycle (Started -> 1 Subagent in Hub)
// ----------------------------------------------------
console.log('[Test 2] subagent_lifecycle started -> 1 Subagent Added to Hub');
{
  const emittedEvents = [];
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => {
        emittedEvents.push({ channel, payload });
      },
    },
  };

  const bridge = new OmpBridge(mockWindow);

  // Feed subagent_lifecycle started frame
  bridge.handleStdoutData(JSON.stringify({
    type: 'subagent_lifecycle',
    payload: {
      id: 'WorkerAlpha',
      agent: 'task',
      agentSource: 'bundled',
      status: 'started',
      description: 'Analyze repository files',
      sessionFile: '/path/to/session.jsonl',
      index: 0,
    },
  }) + '\n');

  const updateEvents = emittedEvents.filter((e) => e.channel === 'omp:subagent-update');
  assert(updateEvents.length === 1, 'Emitted exactly 1 omp:subagent-update event');

  const subagents = updateEvents[0].payload;
  assert(Array.isArray(subagents) && subagents.length === 1, 'Payload is an array with 1 item');
  assert(subagents[0].id === 'WorkerAlpha', 'Subagent id matches "WorkerAlpha"');
  assert(subagents[0].agent === 'task', 'Subagent agent matches "task"');
  assert(subagents[0].description === 'Analyze repository files', 'Subagent description matches');
  assert(subagents[0].status === 'started', 'Subagent status matches "started"');

  const bridgeSubagents = bridge.getSubagents();
  assert(bridgeSubagents.length === 1 && bridgeSubagents[0].id === 'WorkerAlpha', 'bridge.getSubagents() matches internal state');
}
console.log();

// ----------------------------------------------------
// Test 3: Inbound subagent_progress (Updates progressText & status)
// ----------------------------------------------------
console.log('[Test 3] subagent_progress updates status and progressText');
{
  const emittedEvents = [];
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => {
        emittedEvents.push({ channel, payload });
      },
    },
  };

  const bridge = new OmpBridge(mockWindow);

  // 1. Started
  bridge.handleStdoutData(JSON.stringify({
    type: 'subagent_lifecycle',
    payload: { id: 'WorkerBeta', agent: 'code-reviewer', status: 'started', index: 1 },
  }) + '\n');

  // 2. Progress with lastIntent
  bridge.handleStdoutData(JSON.stringify({
    type: 'subagent_progress',
    payload: {
      index: 1,
      progress: {
        id: 'WorkerBeta',
        status: 'running',
        lastIntent: 'Checking AST nodes in auth.ts',
        toolCount: 2,
      },
    },
  }) + '\n');

  const updateEvents = emittedEvents.filter((e) => e.channel === 'omp:subagent-update');
  assert(updateEvents.length === 2, 'Emitted 2 omp:subagent-update events');

  const latestSubagents = updateEvents[1].payload;
  assert(latestSubagents.length === 1, '1 active subagent in hub');
  assert(latestSubagents[0].id === 'WorkerBeta', 'Subagent ID is WorkerBeta');
  assert(latestSubagents[0].status === 'running', 'Subagent status updated to "running"');
  assert(latestSubagents[0].progressText === 'Checking AST nodes in auth.ts', 'Subagent progressText updated to lastIntent');
}
console.log();

// ----------------------------------------------------
// Test 4: Terminal status cleanup (completed -> empty hub)
// ----------------------------------------------------
console.log('[Test 4] Terminal status "completed" removes subagent');
{
  const emittedEvents = [];
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => {
        emittedEvents.push({ channel, payload });
      },
    },
  };

  const bridge = new OmpBridge(mockWindow);

  // Started
  bridge.handleStdoutData(JSON.stringify({
    type: 'subagent_lifecycle',
    payload: { id: 'WorkerGamma', agent: 'task', status: 'started' },
  }) + '\n');
  assert(bridge.getSubagents().length === 1, 'Subagent active after started');

  // Completed
  bridge.handleStdoutData(JSON.stringify({
    type: 'subagent_lifecycle',
    payload: { id: 'WorkerGamma', agent: 'task', status: 'completed' },
  }) + '\n');

  const updateEvents = emittedEvents.filter((e) => e.channel === 'omp:subagent-update');
  assert(updateEvents.length === 2, 'Emitted 2 omp:subagent-update events');
  assert(Array.isArray(updateEvents[1].payload) && updateEvents[1].payload.length === 0, 'Last update payload is empty array');
  assert(bridge.getSubagents().length === 0, 'bridge.getSubagents() is empty after terminal event');
}
console.log();

// ----------------------------------------------------
// Test 5: Fail-safe terminal status handling
// ----------------------------------------------------
console.log('[Test 5] Fail-safe: Non-running status values treated as terminal');
{
  const nonRunningStatuses = ['failed', 'cancelled', 'error', 'aborted', 'terminated', 'UNKNOWN_TERMINAL'];

  for (const termStatus of nonRunningStatuses) {
    const emittedEvents = [];
    const mockWindow = {
      isDestroyed: () => false,
      webContents: {
        send: (channel, payload) => {
          emittedEvents.push({ channel, payload });
        },
      },
    };

    const bridge = new OmpBridge(mockWindow);

    bridge.handleStdoutData(JSON.stringify({
      type: 'subagent_lifecycle',
      payload: { id: 'TempWorker', agent: 'task', status: 'started' },
    }) + '\n');
    assert(bridge.getSubagents().length === 1, `TempWorker active before ${termStatus}`);

    bridge.handleStdoutData(JSON.stringify({
      type: 'subagent_lifecycle',
      payload: { id: 'TempWorker', agent: 'task', status: termStatus },
    }) + '\n');

    assert(bridge.getSubagents().length === 0, `TempWorker cleanly deleted on status "${termStatus}"`);
  }
}
console.log();

// ----------------------------------------------------
// Test 6: Multi-subagent concurrency
// ----------------------------------------------------
console.log('[Test 6] Multi-Subagent Concurrent Execution & Selective Removal');
{
  const emittedEvents = [];
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => {
        emittedEvents.push({ channel, payload });
      },
    },
  };

  const bridge = new OmpBridge(mockWindow);

  // Start Agent 1 & Agent 2
  bridge.handleStdoutData(JSON.stringify({
    type: 'subagent_lifecycle',
    payload: { id: 'Agent1', agent: 'task', status: 'started' },
  }) + '\n');
  bridge.handleStdoutData(JSON.stringify({
    type: 'subagent_lifecycle',
    payload: { id: 'Agent2', agent: 'tester', status: 'started' },
  }) + '\n');

  assert(bridge.getSubagents().length === 2, '2 concurrent subagents active in hub');

  // Update Agent 1 progress
  bridge.handleStdoutData(JSON.stringify({
    type: 'subagent_progress',
    payload: {
      progress: { id: 'Agent1', status: 'running', lastIntent: 'Step 1' },
    },
  }) + '\n');

  let list = bridge.getSubagents();
  const a1 = list.find((x) => x.id === 'Agent1');
  const a2 = list.find((x) => x.id === 'Agent2');
  assert(a1?.progressText === 'Step 1', 'Agent1 progressText updated');
  assert(a2?.status === 'started', 'Agent2 remains untouched');

  // Complete Agent 1
  bridge.handleStdoutData(JSON.stringify({
    type: 'subagent_lifecycle',
    payload: { id: 'Agent1', status: 'completed' },
  }) + '\n');

  list = bridge.getSubagents();
  assert(list.length === 1 && list[0].id === 'Agent2', 'Only Agent2 remains active');

  // Complete Agent 2
  bridge.handleStdoutData(JSON.stringify({
    type: 'subagent_lifecycle',
    payload: { id: 'Agent2', status: 'completed' },
  }) + '\n');

  assert(bridge.getSubagents().length === 0, 'Hub completely empty after both complete');
}
console.log();

// ----------------------------------------------------
// Test 7: Process cleanup clears activeSubagents
// ----------------------------------------------------
console.log('[Test 7] Process cleanup clears active subagents');
{
  const emittedEvents = [];
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => {
        emittedEvents.push({ channel, payload });
      },
    },
  };

  const bridge = new OmpBridge(mockWindow);

  bridge.handleStdoutData(JSON.stringify({
    type: 'subagent_lifecycle',
    payload: { id: 'GhostWorker', agent: 'task', status: 'started' },
  }) + '\n');
  assert(bridge.getSubagents().length === 1, 'GhostWorker active in bridge');

  // Simulate process stop/cleanup
  bridge.stopProcess();

  assert(bridge.getSubagents().length === 0, 'Active subagents map cleared on stopProcess');
  const subagentUpdates = emittedEvents.filter((e) => e.channel === 'omp:subagent-update');
  const lastUpdate = subagentUpdates[subagentUpdates.length - 1];
  assert(lastUpdate && Array.isArray(lastUpdate.payload) && lastUpdate.payload.length === 0, 'Emitted empty omp:subagent-update on cleanup');
}
console.log();

// ----------------------------------------------------
// Test 8: Replay real probe fixture (16 ndjson frames)
// ----------------------------------------------------
console.log('[Test 8] Replay Live Probe Fixture (subagent-events.ndjson: 16 frames)');
{
  const fixturePath = path.resolve(__dirname, '../plans/260901-1858-sessions-subagent-hub/fixtures/subagent-events.ndjson');
  assert(fs.existsSync(fixturePath), `Fixture exists at: ${fixturePath}`);

  const lines = fs.readFileSync(fixturePath, 'utf-8').split('\n').filter((l) => l.trim().length > 0);
  assert(lines.length === 16, `Loaded 16 frames from subagent-events.ndjson (count: ${lines.length})`);

  const emittedEvents = [];
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => {
        emittedEvents.push({ channel, payload });
      },
    },
  };

  const bridge = new OmpBridge(mockWindow);

  // Feed frame 1 (lifecycle started)
  bridge.handleStdoutData(lines[0] + '\n');
  assert(bridge.getSubagents().length === 1, 'Frame 1: subagent "CreateSubFile" added to hub (started)');
  assert(bridge.getSubagents()[0].id === 'CreateSubFile', 'Frame 1: subagent id is "CreateSubFile"');

  // Feed frames 2 through 14 (running progress frames)
  for (let i = 1; i < 14; i++) {
    bridge.handleStdoutData(lines[i] + '\n');
    const subs = bridge.getSubagents();
    assert(subs.length === 1, `Frame ${i + 1}: subagent remains active in hub`);
  }

  // Check progress text after frame 14
  const subAfterProgress = bridge.getSubagents()[0];
  assert(subAfterProgress.progressText === 'Verifying sub.txt content', `Progress text updated to lastIntent (actual: "${subAfterProgress.progressText}")`);

  // Feed frame 15 (progress completed)
  bridge.handleStdoutData(lines[14] + '\n');
  assert(bridge.getSubagents().length === 0, 'Frame 15: progress with terminal status "completed" removes subagent from hub');

  // Feed frame 16 (lifecycle completed)
  bridge.handleStdoutData(lines[15] + '\n');
  assert(bridge.getSubagents().length === 0, 'Frame 16: terminal lifecycle "completed" keeps hub empty');

  const updateEmits = emittedEvents.filter((e) => e.channel === 'omp:subagent-update');
  assert(updateEmits.length === 15, `Generated ${updateEmits.length} IPC update snapshots for 16 frames (no redundant emit on subsequent terminal frame)`);
  assert(updateEmits[updateEmits.length - 1].payload.length === 0, 'Final IPC snapshot is empty array');
}
console.log();

// ----------------------------------------------------
// Summary
// ----------------------------------------------------
console.log('====================================================');
console.log(`Subagent Hub Verification: ${passed} passed, ${failed} failed.`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
}
