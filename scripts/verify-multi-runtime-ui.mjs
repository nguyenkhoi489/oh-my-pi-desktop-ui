import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createEmptyRuntimeSession,
  handleRuntimeEnvelope,
  saveActiveSessionToMap,
  restoreSessionFromMap,
} from '../src/utils/runtimeDemux.ts';

let passCount = 0;
async function test(name, fn) {
  await fn();
  passCount++;
  console.log(`✓ ${name}`);
}

console.log('=== Running verify-multi-runtime-ui.mjs ===');

// ----------------------------------------------------
// Test 1: createEmptyRuntimeSession
// ----------------------------------------------------
await test('createEmptyRuntimeSession initializes with valid defaults and provided parameters', () => {
  const session = createEmptyRuntimeSession('rt-1', 'proj-alpha', '/path/to/session.jsonl');
  assert.equal(session.runtimeId, 'rt-1');
  assert.equal(session.projectId, 'proj-alpha');
  assert.equal(session.sessionPath, '/path/to/session.jsonl');
  assert.equal(session.status, 'idle');
  assert.equal(session.attention, false);
  assert.deepEqual(session.messages, []);
  assert.equal(session.currentThinking, null);
  assert.deepEqual(session.activeToolCalls, []);
  assert.equal(session.currentStreamText, '');
  assert.equal(session.activeDiff, null);
  assert(typeof session.lastActiveAt === 'number');

  // Default parameters fallback
  const sessionDefault = createEmptyRuntimeSession('rt-2');
  assert.equal(sessionDefault.projectId, 'default');
  assert.equal(sessionDefault.sessionPath, undefined);
});

// ----------------------------------------------------
// Test 2: Multi-Tenant Stream Token Routing & Isolation (4 Runtimes)
// ----------------------------------------------------
await test('Stream tokens route strictly to target runtime without cross-contamination', () => {
  let map = {};
  const activeRuntime = 'rt-1';

  // 4 concurrent runtimes
  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-1', projectId: 'p1', channel: 'omp:status-change', payload: 'streaming' }, activeRuntime);
  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-2', projectId: 'p2', channel: 'omp:status-change', payload: 'streaming' }, activeRuntime);
  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-3', projectId: 'p3', channel: 'omp:status-change', payload: 'streaming' }, activeRuntime);
  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-4', projectId: 'p4', channel: 'omp:status-change', payload: 'streaming' }, activeRuntime);

  // Active runtime tokens via envelope are ignored to avoid duplicate rendering (active consumes direct IPC)
  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-1', projectId: 'p1', channel: 'omp:stream-token', payload: 'active-token-ignored' }, activeRuntime);
  assert.equal(map['rt-1'].currentStreamText, '', 'Active runtime stream text should not accumulate from envelope');

  // Background runtimes receive both string tokens and object tokens { token: string }
  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-2', projectId: 'p2', channel: 'omp:stream-token', payload: 'Hello ' }, activeRuntime);
  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-2', projectId: 'p2', channel: 'omp:stream-token', payload: { token: 'from ' } }, activeRuntime);
  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-2', projectId: 'p2', channel: 'omp:stream-token', payload: 'Runtime 2' }, activeRuntime);

  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-3', projectId: 'p3', channel: 'omp:stream-token', payload: 'Data for RT3' }, activeRuntime);
  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-4', projectId: 'p4', channel: 'omp:stream-token', payload: 'RT4 chunk' }, activeRuntime);

  // Assert isolation
  assert.equal(map['rt-2'].currentStreamText, 'Hello from Runtime 2');
  assert.equal(map['rt-3'].currentStreamText, 'Data for RT3');
  assert.equal(map['rt-4'].currentStreamText, 'RT4 chunk');
  assert.equal(map['rt-1'].currentStreamText, '');
});

// ----------------------------------------------------
// Test 3: Thinking Blocks Capture & Isolation
// ----------------------------------------------------
await test('Thinking blocks capture and isolate across background runtimes', () => {
  let map = {};
  const activeRuntime = 'rt-main';

  const thinkBlock2 = {
    id: 'th-2',
    turnKey: 'turn-2',
    contentIndex: 0,
    thought: 'Analyzing database query...',
    completed: false,
    startTime: Date.now(),
  };

  const thinkBlock3 = {
    id: 'th-3',
    turnKey: 'turn-3',
    contentIndex: 0,
    thought: 'Refactoring React components...',
    completed: true,
    startTime: Date.now(),
    endTime: Date.now() + 1000,
  };

  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-2', projectId: 'p2', channel: 'omp:thinking', payload: thinkBlock2 }, activeRuntime);
  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-3', projectId: 'p3', channel: 'omp:thinking', payload: thinkBlock3 }, activeRuntime);

  assert.deepEqual(map['rt-2'].currentThinking, thinkBlock2);
  assert.deepEqual(map['rt-3'].currentThinking, thinkBlock3);
  assert.equal(map['rt-main'], undefined);
});

// ----------------------------------------------------
// Test 4: Tool Call Lifecycle Demultiplexing
// ----------------------------------------------------
await test('Tool calls lifecycle (start, update, complete) accumulates per background runtime', () => {
  let map = {};
  const activeRuntime = 'rt-active';

  // Tool 1 starts in rt-B
  const tool1Start = {
    id: 'tool-call-1',
    name: 'bash',
    args: { command: 'git status' },
    status: 'running',
    startTime: Date.now(),
  };
  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-B', projectId: 'pB', channel: 'omp:tool-call', payload: tool1Start }, activeRuntime);
  assert.equal(map['rt-B'].activeToolCalls.length, 1);
  assert.equal(map['rt-B'].activeToolCalls[0].status, 'running');

  // Tool 1 updates in rt-B
  const tool1Update = {
    ...tool1Start,
    result: { output: 'On branch main\n' },
  };
  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-B', projectId: 'pB', channel: 'omp:tool-call', payload: tool1Update }, activeRuntime);
  assert.equal(map['rt-B'].activeToolCalls.length, 1, 'Should update existing tool call in-place');
  assert.equal(map['rt-B'].activeToolCalls[0].result.output, 'On branch main\n');

  // Tool 2 starts in rt-C while tool 1 is running in rt-B
  const tool2Start = {
    id: 'tool-call-2',
    name: 'read',
    args: { path: 'package.json' },
    status: 'running',
    startTime: Date.now(),
  };
  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-C', projectId: 'pC', channel: 'omp:tool-call', payload: tool2Start }, activeRuntime);

  assert.equal(map['rt-B'].activeToolCalls.length, 1);
  assert.equal(map['rt-B'].activeToolCalls[0].id, 'tool-call-1');
  assert.equal(map['rt-C'].activeToolCalls.length, 1);
  assert.equal(map['rt-C'].activeToolCalls[0].id, 'tool-call-2');
});

// ----------------------------------------------------
// Test 5: Diff Generation Routing & Isolation
// ----------------------------------------------------
await test('Diff generation sets activeDiff on the target runtime only', () => {
  let map = {};
  const activeRuntime = 'rt-1';

  const diffItem = {
    id: 'diff-1',
    toolCallId: 'tc-1',
    relativePath: 'src/main.ts',
    originalContent: 'const a = 1;',
    modifiedContent: 'const a = 2;',
    additions: 1,
    deletions: 1,
    status: 'pending',
    op: 'update',
  };

  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-2', projectId: 'p2', channel: 'omp:diff-generated', payload: diffItem }, activeRuntime);

  assert.deepEqual(map['rt-2'].activeDiff, diffItem);
  assert.equal(map['rt-1'], undefined);
});

// ----------------------------------------------------
// Test 6: Message Completion Resets Accumulators
// ----------------------------------------------------
await test('omp:message-complete pushes to history and resets streaming accumulators', () => {
  let map = {};
  const activeRuntime = 'rt-1';

  // Seed background runtime rt-2 with streaming text, thinking, and active tool calls
  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-2', projectId: 'p2', channel: 'omp:stream-token', payload: 'In progress text' }, activeRuntime);
  map = handleRuntimeEnvelope(map, {
    runtimeId: 'rt-2',
    projectId: 'p2',
    channel: 'omp:thinking',
    payload: { id: 'th-1', thought: 'thinking...', completed: false, startTime: Date.now() },
  }, activeRuntime);
  map = handleRuntimeEnvelope(map, {
    runtimeId: 'rt-2',
    projectId: 'p2',
    channel: 'omp:tool-call',
    payload: { id: 'tc-1', name: 'read', status: 'running' },
  }, activeRuntime);

  assert.equal(map['rt-2'].currentStreamText, 'In progress text');
  assert(map['rt-2'].currentThinking !== null);
  assert.equal(map['rt-2'].activeToolCalls.length, 1);

  // Message completes
  const completedMessage = {
    id: 'msg-finished',
    role: 'assistant',
    content: 'Completed response from agent',
    timestamp: Date.now(),
  };
  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-2', projectId: 'p2', channel: 'omp:message-complete', payload: completedMessage }, activeRuntime);

  assert.equal(map['rt-2'].messages.length, 1);
  assert.equal(map['rt-2'].messages[0].id, 'msg-finished');
  assert.equal(map['rt-2'].currentStreamText, '');
  assert.equal(map['rt-2'].currentThinking, null);
  assert.deepEqual(map['rt-2'].activeToolCalls, []);
});

// ----------------------------------------------------
// Test 7: Attention Flag Lifecycle on Status Changes
// ----------------------------------------------------
await test('Attention flag triggers only when background busy runtime finishes', () => {
  let map = {};
  const activeRuntime = 'rt-active';

  // Background runtime rt-bg becomes busy
  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-bg', projectId: 'p-bg', channel: 'omp:status-change', payload: 'thinking' }, activeRuntime);
  assert.equal(map['rt-bg'].status, 'thinking');
  assert.equal(map['rt-bg'].attention, false, 'No attention while busy');

  // Background runtime finishes (thinking -> idle)
  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-bg', projectId: 'p-bg', channel: 'omp:status-change', payload: 'idle' }, activeRuntime);
  assert.equal(map['rt-bg'].status, 'idle');
  assert.equal(map['rt-bg'].attention, true, 'Attention set when background task finishes');

  // Active runtime finishes (streaming -> idle) does NOT set attention
  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-active', projectId: 'p-act', channel: 'omp:status-change', payload: 'streaming' }, activeRuntime);
  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-active', projectId: 'p-act', channel: 'omp:status-change', payload: 'idle' }, activeRuntime);
  assert.equal(map['rt-active'].attention, false, 'Active runtime does not trigger attention flag');
});

// ----------------------------------------------------
// Test 8: Rapid Switching & Full State Serialization Stress Test
// ----------------------------------------------------
await test('Rapid switching between 4 runtimes preserves all states cleanly without drift', () => {
  let map = {};

  // Setup initial active states for 4 runtimes
  const stateA = {
    messages: [{ id: 'm-A', role: 'user', content: 'Prompt A' }],
    currentStreamText: 'stream-A',
    currentThinking: { id: 'th-A', thought: 'think-A', completed: false, startTime: 100 },
    activeToolCalls: [{ id: 'tc-A', name: 'read', status: 'running' }],
    activeDiff: null,
    status: 'streaming',
  };

  const stateB = {
    messages: [{ id: 'm-B', role: 'user', content: 'Prompt B' }],
    currentStreamText: 'stream-B',
    currentThinking: null,
    activeToolCalls: [],
    activeDiff: { id: 'diff-B', relativePath: 'fileB.ts' },
    status: 'idle',
  };

  // Save A and switch to B
  map = saveActiveSessionToMap(map, 'rt-A', stateA);
  let activeRuntime = 'rt-B';
  const restoredB = restoreSessionFromMap(map, activeRuntime);
  assert.deepEqual(restoredB.messages, [], 'B initially empty');

  // Populate B and save
  map = saveActiveSessionToMap(map, 'rt-B', stateB);

  // Background event arrives for A while on B
  map = handleRuntimeEnvelope(map, { runtimeId: 'rt-A', projectId: 'pA', channel: 'omp:stream-token', payload: ' + more A' }, activeRuntime);

  // Switch back to A
  activeRuntime = 'rt-A';
  const restoredA = restoreSessionFromMap(map, activeRuntime);
  assert.equal(restoredA.currentStreamText, 'stream-A + more A', 'Restored A includes buffered background stream');
  assert.equal(restoredA.messages.length, 1);
  assert.equal(restoredA.messages[0].content, 'Prompt A');
  assert.equal(restoredA.currentThinking.thought, 'think-A');
  assert.equal(restoredA.activeToolCalls[0].name, 'read');

  // Verify B remains intact
  const restoredBCheck = restoreSessionFromMap(map, 'rt-B');
  assert.equal(restoredBCheck.messages[0].content, 'Prompt B');
  assert.equal(restoredBCheck.activeDiff.relativePath, 'fileB.ts');

  // restoreSessionFromMap on unknown id returns safe empty state
  const unknownRestored = restoreSessionFromMap(map, 'rt-nonexistent');
  assert.deepEqual(unknownRestored.messages, []);
  assert.equal(unknownRestored.status, 'idle');
  assert.equal(unknownRestored.currentStreamText, '');

  // saveActiveSessionToMap with null id returns map as-is
  const unchangedMap = saveActiveSessionToMap(map, null, stateA);
  assert.equal(unchangedMap, map);
});

// ----------------------------------------------------
// Test 9: Immutability Invariant
// ----------------------------------------------------
await test('handleRuntimeEnvelope and saveActiveSessionToMap maintain immutable state updates', () => {
  const initialMap = {
    'rt-1': createEmptyRuntimeSession('rt-1', 'p1'),
  };
  Object.freeze(initialMap);

  const newMap = handleRuntimeEnvelope(initialMap, {
    runtimeId: 'rt-2',
    projectId: 'p2',
    channel: 'omp:status-change',
    payload: 'idle',
  }, 'rt-1');

  assert.notEqual(initialMap, newMap, 'Should return a new map object reference');
  assert.equal(Object.keys(initialMap).length, 1);
  assert.equal(Object.keys(newMap).length, 2);

  const snapshot = {
    messages: [],
    currentThinking: null,
    activeToolCalls: [],
    currentStreamText: 'snapshot text',
    activeDiff: null,
    status: 'streaming',
  };

  const savedMap = saveActiveSessionToMap(newMap, 'rt-1', snapshot);
  assert.notEqual(newMap, savedMap, 'saveActiveSessionToMap should return new map reference');
  assert.equal(savedMap['rt-1'].currentStreamText, 'snapshot text');
  assert.equal(newMap['rt-1'].currentStreamText, '');
});

// ----------------------------------------------------
// Test 10: Preload IPC Contract
// ----------------------------------------------------
await test('electron/preload.ts correctly exposes multi-runtime methods and onOmpEvent listener', () => {
  const preloadPath = path.resolve('electron/preload.ts');
  assert(fs.existsSync(preloadPath), 'electron/preload.ts exists');
  const code = fs.readFileSync(preloadPath, 'utf8');

  assert(code.includes("listRuntimes: () => ipcRenderer.invoke('runtime:list')"), 'Exposes listRuntimes');
  assert(code.includes("admitRuntime: (projectId: string, cwd: string, sessionPath?: string) =>"), 'Exposes admitRuntime');
  assert(code.includes("switchRuntime: (runtimeId: string) => ipcRenderer.invoke('runtime:switch', runtimeId)"), 'Exposes switchRuntime');
  assert(code.includes("stopRuntime: (runtimeId: string) => ipcRenderer.invoke('runtime:stop', runtimeId)"), 'Exposes stopRuntime');
  assert(code.includes("indexSessions: (projectId: string, projectPath: string, profile?: string) =>"), 'Exposes indexSessions');
  assert(code.includes("onOmpEvent: (callback: (envelope: OmpEventEnvelope) => void) =>"), 'Exposes onOmpEvent');
  assert(code.includes("ipcRenderer.on('omp:event', handler)"), 'Subscribes to omp:event');
});

console.log(`\nAll ${passCount} multi-runtime UI verify tests passed successfully!`);
