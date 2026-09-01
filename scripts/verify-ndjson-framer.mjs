/**
 * Offline Verification Suite for NdjsonFramer
 * 
 * Verifies stream resilience without needing a live OMP engine:
 * 1. Chunk fragmentation (frame split in half across chunks)
 * 2. Multi-frame single chunk (3+ frames arriving together)
 * 3. Non-JSON junk and raw stderr/stdout log handling (non-throwing)
 * 4. Oversized frame guard (exceeding maxFrameBytes)
 * 5. Encode frame to valid NDJSON line
 */

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

console.log('=== Starting NDJSON Framer Verification Suite ===\n');

// ----------------------------------------------------
// Fixture 1: Chunk Fragmentation (Frame split across 2 chunks)
// ----------------------------------------------------
console.log('[Fixture 1] Stream Fragmentation (Frame split in half across chunks)');
{
  const framer = new NdjsonFramer();
  const chunk1 = '{"type":"ready","protocol';
  const chunk2 = 'Version":1,"supportedProtocolVersions":[1,2],"maxFrameBytes":1048576,"maxReassembledFrameBytes":67108864}\n';

  const frames1 = framer.push(chunk1);
  assert(frames1.length === 0, 'Chunk 1 returns 0 frames while incomplete');
  assert(framer.getPendingBuffer() === chunk1, 'Incomplete chunk is safely buffered');

  const frames2 = framer.push(chunk2);
  assert(frames2.length === 1, 'Chunk 2 completes the frame and returns exactly 1 frame');
  assert(frames2[0].type === 'ready', 'Parsed frame has correct type "ready"');
  assert(frames2[0].protocolVersion === 1, 'Parsed frame has protocolVersion = 1');
  assert(frames2[0].maxFrameBytes === 1048576, 'Parsed frame has maxFrameBytes = 1048576');
  assert(framer.getPendingBuffer() === '', 'Buffer is empty after complete frame newline');
}
console.log();

// ----------------------------------------------------
// Fixture 2: Multiple frames in a single chunk
// ----------------------------------------------------
console.log('[Fixture 2] Batch Frames (3 frames delivered in 1 chunk)');
{
  const framer = new NdjsonFramer();
  const burstChunk = [
    '{"type":"turn_start","turnId":"t-101"}',
    '{"type":"message_start","messageId":"m-201","role":"assistant"}',
    '{"type":"turn_end","turnId":"t-101"}',
  ].join('\n') + '\n';

  const frames = framer.push(burstChunk);
  assert(frames.length === 3, 'Received all 3 frames from single burst chunk');
  assert(frames[0].type === 'turn_start' && frames[0].turnId === 't-101', 'Frame 1 matches turn_start');
  assert(frames[1].type === 'message_start' && frames[1].messageId === 'm-201', 'Frame 2 matches message_start');
  assert(frames[2].type === 'turn_end' && frames[2].turnId === 't-101', 'Frame 3 matches turn_end');
  assert(framer.getPendingBuffer() === '', 'Buffer is empty after full burst processed');
}
console.log();

// ----------------------------------------------------
// Fixture 3: Non-JSON Junk & Raw Logs Interspersed
// ----------------------------------------------------
console.log('[Fixture 3] Non-JSON Junk Handling (Zero crash, raw logs diverted to callback)');
{
  const rawLinesCaptured = [];
  const framer = new NdjsonFramer({
    onRawLine: (line) => rawLinesCaptured.push(line),
  });

  const streamWithJunk = [
    '[OMP NATIVE] starting engine v18.0.11...',
    '{"type":"ready","supportedProtocolVersions":[1,2],"maxFrameBytes":1048576,"maxReassembledFrameBytes":67108864}',
    'WARN: deprecated config flag detected',
    '{"type":"response","id":"req-01","command":"get_state","success":true,"data":{"state":"idle"}}',
    'Some unformatted debug info line',
  ].join('\n') + '\n';

  const frames = framer.push(streamWithJunk);
  assert(frames.length === 2, 'Parsed exactly 2 valid JSON frames despite junk lines');
  assert(frames[0].type === 'ready', 'First valid frame is ready');
  assert(frames[1].type === 'response' && frames[1].id === 'req-01', 'Second valid frame is correlated response');
  assert(rawLinesCaptured.length === 3, 'All 3 non-JSON junk lines were safely captured without throwing');
  assert(rawLinesCaptured[0].includes('[OMP NATIVE]'), 'Raw line 1 captured correctly');
  assert(rawLinesCaptured[1].includes('WARN:'), 'Raw line 2 captured correctly');
  assert(rawLinesCaptured[2].includes('Some unformatted'), 'Raw line 3 captured correctly');
}
console.log();

// ----------------------------------------------------
// Fixture 4: Oversized Frame Guard (> maxFrameBytes)
// ----------------------------------------------------
console.log('[Fixture 4] Oversized Frame Guard (Protection against buffer explosion)');
{
  const errorsCaptured = [];
  const rawLinesCaptured = [];
  const customLimit = 64; // Set 64 bytes limit for testing

  const framer = new NdjsonFramer({
    maxFrameBytes: customLimit,
    onError: (err, raw) => errorsCaptured.push({ err, raw }),
    onRawLine: (line) => rawLinesCaptured.push(line),
  });

  // Create an oversized line (100 'x' characters) followed by a valid small frame
  const hugeLine = '{"type":"huge","payload":"' + 'x'.repeat(100) + '"}';
  const validSmallFrame = '{"type":"abort","id":"req-02"}';
  const chunk = `${hugeLine}\n${validSmallFrame}\n`;

  const frames = framer.push(chunk);
  assert(frames.length === 1, 'Discarded oversized frame and parsed subsequent valid frame');
  assert(frames[0].type === 'abort' && frames[0].id === 'req-02', 'Valid frame after oversized line processed cleanly');
  assert(errorsCaptured.length === 1, 'Error callback fired for oversized line');
  assert(errorsCaptured[0].err.message.includes('exceeded maxFrameBytes'), 'Error message identifies size violation');
}
console.log();

// ----------------------------------------------------
// Fixture 5: Frame Encoding
// ----------------------------------------------------
console.log('[Fixture 5] Frame Encoding (Outbound command serialization)');
{
  const framer = new NdjsonFramer();
  const command = {
    type: 'prompt',
    id: 'req-12345',
    prompt: 'Hello OMP Agent',
  };

  const encoded = framer.encode(command);
  assert(encoded.endsWith('\n'), 'Encoded string terminates with newline (\\n)');
  assert(!encoded.slice(0, -1).includes('\n'), 'Encoded string contains no inner newlines (single line)');
  
  const parsedBack = JSON.parse(encoded.trim());
  assert(parsedBack.type === 'prompt' && parsedBack.id === 'req-12345', 'Encoded line round-trips to identical object');
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
