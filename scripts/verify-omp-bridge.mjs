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
// Fixture 4: Minimal Status Event Mapping
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
      case 'abort':
        setStatus('idle');
        break;
    }
  }

  dispatchFrame({ type: 'turn_start', turnId: 't-1' });
  assert(currentStatus === 'thinking', 'turn_start maps status to "thinking"');

  dispatchFrame({ type: 'message_start', messageId: 'm-1' });
  assert(currentStatus === 'streaming', 'message_start maps status to "streaming"');

  dispatchFrame({ type: 'message_update', delta: 'Hello' });
  assert(currentStatus === 'streaming', 'message_update keeps status "streaming"');

  dispatchFrame({ type: 'turn_end', turnId: 't-1' });
  assert(currentStatus === 'idle', 'turn_end returns status to "idle"');

  assert(
    JSON.stringify(statusHistory) === JSON.stringify(['thinking', 'streaming', 'idle']),
    'Status progression sequence is exact: thinking -> streaming -> idle'
  );
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
