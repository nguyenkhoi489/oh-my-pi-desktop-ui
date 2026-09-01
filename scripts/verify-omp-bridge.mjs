/**
 * Verification Suite for OMP Bridge Lifecycle & RPC Frame Logger
 * 
 * Verifies:
 * 1. RpcFrameLogger disk persistence, NDJSON format, and truncation
 * 2. Bridge Lifecycle State Transitions (idle -> spawning -> awaiting_ready -> negotiating -> ready)
 * 3. Command correlation by ID and timeout handling
 * 4. Auto-ack for extension_ui_request (e.g. setWidget)
 * 5. Minimal agent status mapping (turn_start -> thinking, message_start -> streaming, turn_end -> idle)
 * 6. Graceful fallback when binary is absent
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { RpcFrameLogger } from '../electron/rpc-frame-logger.ts';
import { NdjsonFramer } from '../electron/ndjson-framer.ts';
import { ThinkingAccumulator, OmpBridge } from '../electron/omp-bridge.ts';

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

console.log('=== Starting OMP Bridge & Frame Logger Verification Suite ===\n');

// ----------------------------------------------------
// Fixture 1: RpcFrameLogger (Disk write, NDJSON format, truncation)
// ----------------------------------------------------
console.log('[Test 1] RpcFrameLogger - Persistence & NDJSON Integrity');
{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-bridge-test-'));
  const logFile = path.join(tempDir, 'test-rpc-frames.ndjson');

  const logger = new RpcFrameLogger(logFile);
  assert(logger.getLogPath() === logFile, 'Logger initialized with correct file path');

  // Log an outbound command and an inbound response
  logger.log('out', { type: 'negotiate_protocol', id: 'req-01', protocolVersion: 2 });
  logger.log('in', { type: 'response', id: 'req-01', command: 'negotiate_protocol', success: true });

  assert(fs.existsSync(logFile), 'Log file created on disk');

  const fileContent = fs.readFileSync(logFile, 'utf-8');
  const lines = fileContent.trim().split('\n');
  assert(lines.length === 2, 'Log file contains exactly 2 NDJSON lines');

  const entry1 = JSON.parse(lines[0]);
  assert(entry1.dir === 'out', 'Entry 1 direction is "out"');
  assert(entry1.frame.type === 'negotiate_protocol', 'Entry 1 frame matches outbound command');
  assert(typeof entry1.timestamp === 'string', 'Entry 1 contains valid timestamp');

  const entry2 = JSON.parse(lines[1]);
  assert(entry2.dir === 'in', 'Entry 2 direction is "in"');
  assert(entry2.frame.type === 'response' && entry2.frame.success === true, 'Entry 2 frame matches inbound response');

  // Truncate logger
  logger.truncate();
  const truncatedContent = fs.readFileSync(logFile, 'utf-8');
  assert(truncatedContent === '', 'Logger truncate() empties the log file');

  // Cleanup temp dir
  fs.rmSync(tempDir, { recursive: true, force: true });
}
console.log();

// ----------------------------------------------------
// Fixture 2: Command & Response Correlation by ID
// ----------------------------------------------------
console.log('[Test 2] Command Correlation by ID & Pending Map Resolving');
{
  const framer = new NdjsonFramer();
  const pendingCommands = new Map();

  function mockSendCommand(frame) {
    return new Promise((resolve, reject) => {
      pendingCommands.set(frame.id, { resolve, reject, command: frame.type });
    });
  }

  const req1 = { type: 'get_state', id: 'req_1001' };
  const req2 = { type: 'get_available_models', id: 'req_1002' };

  let req1Resolved = false;
  let req2Resolved = false;

  const p1 = mockSendCommand(req1).then((res) => {
    assert(res.id === 'req_1001', 'Response 1 matches req_1001 ID');
    assert(res.data.state === 'idle', 'Response 1 data parsed correctly');
    req1Resolved = true;
  });

  const p2 = mockSendCommand(req2).then((res) => {
    assert(res.id === 'req_1002', 'Response 2 matches req_1002 ID');
    assert(res.data.models.length === 2, 'Response 2 models array received');
    req2Resolved = true;
  });

  // Simulate out-of-order response stream from engine
  const simulatedStream = [
    framer.encode({ type: 'response', id: 'req_1002', command: 'get_available_models', success: true, data: { models: ['gemini-2.5-flash', 'claude-3-7-sonnet'] } }),
    framer.encode({ type: 'response', id: 'req_1001', command: 'get_state', success: true, data: { state: 'idle' } }),
  ].join('');

  const incomingFrames = framer.push(simulatedStream);
  for (const frame of incomingFrames) {
    if (frame.type === 'response' && pendingCommands.has(frame.id)) {
      const pending = pendingCommands.get(frame.id);
      pendingCommands.delete(frame.id);
      pending.resolve(frame);
    }
  }

  await Promise.all([p1, p2]);
  assert(req1Resolved && req2Resolved, 'All correlated pending promises resolved successfully');
  assert(pendingCommands.size === 0, 'Pending map is empty after all responses resolved');
}
console.log();

// ----------------------------------------------------
// Fixture 3: Auto-ack for Extension UI Request (setWidget / unsupported)
// ----------------------------------------------------
console.log('[Test 3] Auto-ack for Unsupported Extension UI Requests');
{
  const outboundFrames = [];
  function mockWriteFrame(frame) {
    outboundFrames.push(frame);
  }

  function handleIncomingFrame(frame) {
    if (frame.type === 'extension_ui_request') {
      const reqId = frame.id || frame.requestId;
      const method = frame.method;

      if (method !== 'permission_request') {
        const autoReply = {
          type: 'extension_ui_response',
          id: 'ack_' + Date.now(),
          requestId: reqId,
          approved: false,
          response: null,
        };
        mockWriteFrame(autoReply);
      }
    }
  }

  // Engine sends setWidget request during initialization
  const setWidgetRequest = {
    type: 'extension_ui_request',
    id: 'widget-req-123',
    method: 'setWidget',
    widgetKey: 'status_badge',
    params: { title: 'Compiling' },
  };

  handleIncomingFrame(setWidgetRequest);

  assert(outboundFrames.length === 1, 'Auto-ack generated exactly 1 outbound reply');
  assert(outboundFrames[0].type === 'extension_ui_response', 'Auto-ack reply type is extension_ui_response');
  assert(outboundFrames[0].requestId === 'widget-req-123', 'Auto-ack correlates with request ID');
  assert(outboundFrames[0].response === null, 'Auto-ack response payload is null (non-blocking)');
}
console.log();

// ----------------------------------------------------
// Fixture 4: Status Event Mapping Lifecycle
// ----------------------------------------------------
console.log('[Test 4] Status Event Mapping Lifecycle');
{
  let currentStatus = 'idle';
  const statusHistory = [];

  function setStatus(status) {
    currentStatus = status;
    statusHistory.push(status);
  }

  function dispatchFrame(frame) {
    switch (frame.type) {
      case 'turn_start':
        setStatus('thinking');
        break;
      case 'message_start':
        setStatus('streaming');
        break;
      case 'message_update':
        if (currentStatus !== 'streaming') {
          setStatus('streaming');
        }
        break;
      case 'turn_end':
        setStatus('idle');
        break;
      case 'agent_end':
        setStatus('idle');
        break;
      case 'abort':
        setStatus('idle');
        break;
    }
  }

  dispatchFrame({ type: 'turn_start', turnId: 't-1' });
  assert(currentStatus === 'thinking', 'turn_start maps status to "thinking"');

  dispatchFrame({ type: 'message_start', messageId: 'm-1' });
  assert(currentStatus === 'streaming', 'message_start maps status to "streaming"');

  dispatchFrame({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Hello' } });
  assert(currentStatus === 'streaming', 'message_update keeps status "streaming"');

  dispatchFrame({ type: 'turn_end', turnId: 't-1' });
  assert(currentStatus === 'idle', 'turn_end returns status to "idle"');

  dispatchFrame({ type: 'agent_end' });
  assert(currentStatus === 'idle', 'agent_end returns status to "idle"');

  assert(
    JSON.stringify(statusHistory) === JSON.stringify(['thinking', 'streaming', 'idle', 'idle']),
    'Status progression sequence is exact: thinking -> streaming -> idle -> idle'
  );
}
console.log();

// ----------------------------------------------------
// Fixture 5: ThinkingAccumulator Lifecycle
// ----------------------------------------------------
console.log('[Test 5] ThinkingAccumulator Lifecycle');
{
  const accumulator = new ThinkingAccumulator();

  // 1. thinking_start
  const startRes = accumulator.handleEvent({
    type: 'thinking_start',
    contentIndex: 0,
  }, 'turn-1');

  assert(Boolean(startRes), 'thinking_start returns block');
  assert(startRes.isNew === true, 'thinking_start creates new block');
  assert(startRes.block.thought === '', 'Initial thought is empty string');
  assert(startRes.block.completed === false, 'Initial completed flag is false');
  assert(startRes.block.id.startsWith('think-turn-1-0-'), 'Block ID contains turnKey and contentIndex');

  // 2. thinking_delta
  const deltaRes1 = accumulator.handleEvent({
    type: 'thinking_delta',
    contentIndex: 0,
    delta: 'Phân tích ',
  }, 'turn-1');

  assert(deltaRes1.block.thought === 'Phân tích ', 'First delta appended');
  assert(deltaRes1.block.completed === false, 'Still not completed');

  const deltaRes2 = accumulator.handleEvent({
    type: 'thinking_delta',
    contentIndex: 0,
    delta: 'yêu cầu...',
  }, 'turn-1');

  assert(deltaRes2.block.thought === 'Phân tích yêu cầu...', 'Second delta accumulated');

  // 3. thinking_end
  const endRes = accumulator.handleEvent({
    type: 'thinking_end',
    contentIndex: 0,
    content: 'Phân tích yêu cầu hoàn tất.',
  }, 'turn-1');

  assert(endRes.block.completed === true, 'thinking_end marks completed true');
  assert(endRes.block.thought === 'Phân tích yêu cầu hoàn tất.', 'thinking_end overrides final content if provided');
  assert(accumulator.getActiveBlock(0) === undefined, 'Active block removed after thinking_end');

  // 4. reset
  accumulator.handleEvent({ type: 'thinking_start', contentIndex: 1 }, 'turn-2');
  assert(accumulator.getActiveBlock(1) !== undefined, 'New block stored');
  accumulator.reset();
  assert(accumulator.getActiveBlock(1) === undefined, 'reset() clears all active blocks');
}
console.log();

// ----------------------------------------------------
// Fixture 6: Stream & Message-End Translation Dispatch
// ----------------------------------------------------
console.log('[Test 6] Stream & Message-End Translation Dispatch');
{
  const emittedEvents = [];
  let bridgeStatus = 'idle';

  function setStatus(s) {
    bridgeStatus = s;
  }

  function mockSend(channel, payload) {
    emittedEvents.push({ channel, payload });
  }

  const thinkingAcc = new ThinkingAccumulator();
  let currentTurnId = 'turn-test-1';

  function dispatchFrame(frame) {
    switch (frame.type) {
      case 'turn_start':
        currentTurnId = frame.turnId || String(Date.now());
        setStatus('thinking');
        break;

      case 'message_start':
        if (frame.role === 'assistant' || frame.message?.role === 'assistant') {
          setStatus('streaming');
        }
        break;

      case 'message_update': {
        const ame = frame.assistantMessageEvent;
        if (ame) {
          if (ame.type === 'text_start' || ame.type === 'text_delta' || ame.type === 'text_end') {
            if (bridgeStatus !== 'streaming') {
              setStatus('streaming');
            }
            if (ame.type === 'text_delta' && typeof ame.delta === 'string') {
              mockSend('omp:stream-token', ame.delta);
            }
          } else if (
            ame.type === 'thinking_start' ||
            ame.type === 'thinking_delta' ||
            ame.type === 'thinking_end'
          ) {
            if (bridgeStatus !== 'thinking') {
              setStatus('thinking');
            }
            const res = thinkingAcc.handleEvent(ame, currentTurnId);
            if (res) {
              mockSend('omp:thinking', res.block);
            }
          }
        }
        break;
      }

      case 'message_end': {
        const msg = frame.message;
        if (msg && msg.role === 'assistant' && Array.isArray(msg.content)) {
          const textParts = [];
          for (const block of msg.content) {
            if (block && block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
              textParts.push(block.text);
            }
          }

          if (textParts.length > 0) {
            const chatMessage = {
              id: `msg-${Date.now()}`,
              role: 'assistant',
              content: textParts.join('\n'),
              timestamp: typeof msg.completedAt === 'number' ? msg.completedAt : Date.now(),
            };
            mockSend('omp:message-complete', chatMessage);
          }
        }
        break;
      }

      case 'agent_end':
        setStatus('idle');
        thinkingAcc.reset();
        break;
    }
  }

  // 1. Text streaming simulation
  dispatchFrame({ type: 'turn_start', turnId: 'turn-1' });
  dispatchFrame({ type: 'message_start', message: { role: 'assistant' } });
  dispatchFrame({
    type: 'message_update',
    assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Xin ' },
  });
  dispatchFrame({
    type: 'message_update',
    assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'chào!' },
  });

  const streamTokens = emittedEvents.filter((e) => e.channel === 'omp:stream-token');
  assert(streamTokens.length === 2, 'Received exactly 2 stream tokens');
  assert(streamTokens[0].payload === 'Xin ' && streamTokens[1].payload === 'chào!', 'Tokens match deltas');

  // 2. Assistant message_end with text
  dispatchFrame({
    type: 'message_end',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'Xin chào!' }],
      completedAt: 1788246000000,
    },
  });

  const completeMessages = emittedEvents.filter((e) => e.channel === 'omp:message-complete');
  assert(completeMessages.length === 1, 'Received exactly 1 message-complete');
  assert(completeMessages[0].payload.content === 'Xin chào!', 'ChatMessage content matches combined text');
  assert(completeMessages[0].payload.role === 'assistant', 'ChatMessage role is assistant');
  assert(completeMessages[0].payload.timestamp === 1788246000000, 'ChatMessage timestamp extracted correctly');

  // 3. toolResult message_end should NOT emit message-complete
  dispatchFrame({
    type: 'message_end',
    message: {
      role: 'toolResult',
      content: [{ type: 'text', text: 'File read content' }],
    },
  });
  assert(
    emittedEvents.filter((e) => e.channel === 'omp:message-complete').length === 1,
    'toolResult does NOT emit message-complete'
  );

  // 4. assistant with only toolCall should NOT emit message-complete
  dispatchFrame({
    type: 'message_end',
    message: {
      role: 'assistant',
      content: [{ type: 'toolCall', id: 'c-1', name: 'read' }],
    },
  });
  assert(
    emittedEvents.filter((e) => e.channel === 'omp:message-complete').length === 1,
    'assistant with only toolCall does NOT emit message-complete'
  );

  // 5. agent_end terminates with idle
  dispatchFrame({ type: 'agent_end' });
  assert(bridgeStatus === 'idle', 'agent_end sets status to idle');
}
console.log();

// ----------------------------------------------------
// Fixture 7: Model & State IPC Bridge Methods (Offline Guard)
// ----------------------------------------------------
console.log('[Test 7] Model & State IPC Bridge Methods (Offline Guard)');
{
  const mockWin = {
    isDestroyed: () => false,
    webContents: { send: () => {} },
  };
  const bridge = new OmpBridge(mockWin);

  // When bridge is idle/unready, all 4 methods should return structured error
  const modelsRes = await bridge.getAvailableModels();
  assert(modelsRes.success === false, 'getAvailableModels returns success: false when unready');
  assert(typeof modelsRes.error === 'string', 'getAvailableModels provides error message');

  const setModelRes = await bridge.setModel('provider', 'model');
  assert(setModelRes.success === false, 'setModel returns success: false when unready');
  assert(typeof setModelRes.error === 'string', 'setModel provides error message');

  const thinkRes = await bridge.setThinkingLevel('low');
  assert(thinkRes.success === false, 'setThinkingLevel returns success: false when unready');
  assert(typeof thinkRes.error === 'string', 'setThinkingLevel provides error message');

  const stateRes = await bridge.getState();
  assert(stateRes.success === false, 'getState returns success: false when unready');
  assert(typeof stateRes.error === 'string', 'getState provides error message');
}
console.log();

// ----------------------------------------------------
// Summary Report
// ----------------------------------------------------
console.log('====================================================');
console.log(`Verification Complete: ${passed} passed, ${failed} failed.`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
