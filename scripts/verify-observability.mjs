/**
 * Verification Suite: Usage & Context Observability (Phase 2)
 *
 * Requirements:
 * 1. Offline & Busy guards: getSessionStats returns structured error when offline or busy, 0 stdin writes.
 * 2. getSessionStats invocation: sends get_session_stats frame to stdin, correctly correlates and translates full stats response.
 * 3. agent_end event: triggers getState() -> sends get_state frame -> emits omp:context-usage with { contextUsage, tokensPerSecond, sessionName }.
 * 4. Missing/undefined contextUsage in get_state: gracefully emits contextUsage: null without NaN or crash.
 * 5. Process cleanup / stop: resets context usage snapshot with null values.
 */

import { OmpBridge } from '../electron/omp-bridge.ts';

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

console.log('=== Starting Usage & Context Observability Verification Suite (Phase 2) ===\n');

// ----------------------------------------------------
// Test 1: Offline / Unready Guards
// ----------------------------------------------------
console.log('[Test 1] Offline / Unready Structured Error Guards');
{
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: () => {},
    },
  };

  const bridge = new OmpBridge(mockWindow);

  const res = await bridge.getSessionStats();
  assert(res.success === false, 'getSessionStats returns success: false when unready');
  assert(typeof res.error === 'string' && res.error.includes('not ready or offline'), 'getSessionStats returns structured offline error');
}

// ----------------------------------------------------
// Test 2: Busy Guard (when agent is active)
// ----------------------------------------------------
console.log('\n[Test 2] Busy Guard during Active Turns');
{
  const writtenFrames = [];
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: () => {},
    },
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

  const res = await bridge.getSessionStats();
  assert(res.success === false, 'getSessionStats blocked when engine is streaming');
  assert(res.error.includes('busy'), 'getSessionStats returns busy error message');
  assert(writtenFrames.length === 0, 'Zero frames written to stdin when busy guard blocks');

  // Set status to thinking
  bridge.status = 'thinking';
  const res2 = await bridge.getSessionStats();
  assert(res2.success === false, 'getSessionStats blocked when engine is thinking');
  assert(writtenFrames.length === 0, 'Zero frames written to stdin during thinking state');
}

// ----------------------------------------------------
// Test 3: getSessionStats Command Formatting & Response Translation
// ----------------------------------------------------
console.log('\n[Test 3] getSessionStats Command Formatting & Response Translation');
{
  const writtenFrames = [];
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: () => {},
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

  const statsPromise = bridge.getSessionStats();

  assert(writtenFrames.length === 1, 'Exactly 1 command frame written to stdin');
  const sentFrame = JSON.parse(writtenFrames[0].trim());
  assert(sentFrame.type === 'get_session_stats', 'Command frame type is get_session_stats');
  assert(typeof sentFrame.id === 'string', 'Command frame contains unique id');

  // Correlate live probe shape response
  const mockStatsData = {
    sessionId: '01a05d3d-19d0-71ae-8350-c086f10d4ff8',
    sessionFile: '/path/to/session.jsonl',
    userMessages: 4,
    assistantMessages: 4,
    toolCalls: 6,
    toolResults: 6,
    totalMessages: 20,
    tokens: {
      input: 38200,
      output: 1250,
      reasoning: 450,
      cacheRead: 15000,
      cacheWrite: 2000,
      total: 41900,
    },
    cost: 0.0035,
    premiumRequests: 0,
    contextUsage: {
      tokens: 42180,
      contextWindow: 128000,
      percent: 32.95,
    },
  };

  bridge.dispatchInboundFrame({
    type: 'response',
    id: sentFrame.id,
    command: 'get_session_stats',
    success: true,
    data: mockStatsData,
  });

  const res = await statsPromise;
  assert(res.success === true, 'getSessionStats resolved with success: true');
  assert(res.stats != null, 'getSessionStats returns stats object');
  assert(res.stats.sessionId === mockStatsData.sessionId, 'Stats sessionId matches');
  assert(res.stats.userMessages === 4, 'Stats userMessages is 4');
  assert(res.stats.assistantMessages === 4, 'Stats assistantMessages is 4');
  assert(res.stats.toolCalls === 6, 'Stats toolCalls is 6');
  assert(res.stats.toolResults === 6, 'Stats toolResults is 6');
  assert(res.stats.totalMessages === 20, 'Stats totalMessages is 20');
  assert(res.stats.tokens.input === 38200, 'Tokens input matches');
  assert(res.stats.tokens.output === 1250, 'Tokens output matches');
  assert(res.stats.tokens.reasoning === 450, 'Tokens reasoning matches');
  assert(res.stats.tokens.cacheRead === 15000, 'Tokens cacheRead matches');
  assert(res.stats.tokens.total === 41900, 'Tokens total matches');
  assert(res.stats.cost === 0.0035, 'Cost matches');
  assert(res.stats.contextUsage.tokens === 42180, 'ContextUsage tokens matches');
  assert(res.stats.contextUsage.contextWindow === 128000, 'ContextUsage contextWindow matches');
  assert(res.stats.contextUsage.percent === 32.95, 'ContextUsage percent matches');
}

// ----------------------------------------------------
// Test 4: agent_end triggers getState + emits omp:context-usage
// ----------------------------------------------------
console.log('\n[Test 4] agent_end Event Triggers getState & omp:context-usage Emission');
{
  const writtenFrames = [];
  const emittedEvents = [];

  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => emittedEvents.push({ channel, payload }),
    },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.lifecycleState = 'ready';
  bridge.status = 'streaming';
  bridge.process = {
    stdin: {
      writable: true,
      write: (data) => writtenFrames.push(data.toString()),
    },
    killed: false,
    kill: () => {},
  };

  // Dispatch agent_end event
  bridge.dispatchInboundFrame({
    type: 'agent_end',
  });

  assert(bridge.status === 'idle', 'Bridge status transitioned to idle on agent_end');
  assert(writtenFrames.length === 1, 'agent_end automatically triggered get_state command');

  const sentGetState = JSON.parse(writtenFrames[0].trim());
  assert(sentGetState.type === 'get_state', 'Sent frame type is get_state');

  // Correlate response with contextUsage and tokensPerSecond
  bridge.dispatchInboundFrame({
    type: 'response',
    id: sentGetState.id,
    command: 'get_state',
    success: true,
    data: {
      sessionName: 'Feature Workspace',
      sessionId: 'sess-123',
      contextUsage: {
        tokens: 15400,
        contextWindow: 64000,
        percent: 24.06,
      },
      tokensPerSecond: 48.5,
    },
  });

  // Yield to microtask queue for getState promise to resolve and emit event
  await new Promise((resolve) => setImmediate(resolve));

  const contextUsageEvents = emittedEvents.filter((e) => e.channel === 'omp:context-usage');
  assert(contextUsageEvents.length === 1, 'Emitted exactly 1 omp:context-usage event');
  const updatePayload = contextUsageEvents[0].payload;
  assert(updatePayload.contextUsage != null, 'updatePayload contains contextUsage');
  assert(updatePayload.contextUsage.tokens === 15400, 'Context tokens match');
  assert(updatePayload.contextUsage.contextWindow === 64000, 'Context contextWindow matches');
  assert(updatePayload.contextUsage.percent === 24.06, 'Context percent matches');
  assert(updatePayload.tokensPerSecond === 48.5, 'tokensPerSecond matches');
  assert(updatePayload.sessionName === 'Feature Workspace', 'sessionName matches');
}

// ----------------------------------------------------
// Test 5: Missing / Undefined contextUsage Safe Fallback
// ----------------------------------------------------
console.log('\n[Test 5] Missing / Undefined contextUsage Safe Fallback');
{
  const writtenFrames = [];
  const emittedEvents = [];

  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => emittedEvents.push({ channel, payload }),
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

  const statePromise = bridge.getState();
  const sentFrame = JSON.parse(writtenFrames[0].trim());

  // Respond with state having NO contextUsage
  bridge.dispatchInboundFrame({
    type: 'response',
    id: sentFrame.id,
    command: 'get_state',
    success: true,
    data: {
      sessionId: 'sess-no-context',
      sessionName: 'Legacy Session',
      // contextUsage is intentionally undefined
    },
  });

  const res = await statePromise;
  assert(res.success === true, 'getState succeeded with undefined contextUsage');

  const contextEvents = emittedEvents.filter((e) => e.channel === 'omp:context-usage');
  assert(contextEvents.length === 1, 'Emitted omp:context-usage event');
  assert(contextEvents[0].payload.contextUsage === null, 'contextUsage safely emitted as null');
  assert(contextEvents[0].payload.sessionName === 'Legacy Session', 'sessionName safely preserved');
}

// ----------------------------------------------------
// Test 6: Process Cleanup / Stop Emits Reset Context Usage
// ----------------------------------------------------
console.log('\n[Test 6] Process Cleanup / Stop Emits Reset Context Usage');
{
  const emittedEvents = [];

  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => emittedEvents.push({ channel, payload }),
    },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.lifecycleState = 'ready';
  bridge.process = {
    stdin: {
      writable: true,
      write: () => {},
    },
    killed: false,
    kill: () => {},
  };

  bridge.stopProcess();

  const resetEvents = emittedEvents.filter((e) => e.channel === 'omp:context-usage');
  assert(resetEvents.length >= 1, 'cleanupProcess emitted omp:context-usage reset event');
  const lastReset = resetEvents[resetEvents.length - 1].payload;
  assert(lastReset.contextUsage === null, 'Reset contextUsage is null');
  assert(lastReset.tokensPerSecond === null, 'Reset tokensPerSecond is null');
}

console.log(`\n====================================================`);
console.log(`Usage & Context Observability Verification Complete: ${passed} passed, ${failed} failed.`);
console.log(`====================================================\n`);
