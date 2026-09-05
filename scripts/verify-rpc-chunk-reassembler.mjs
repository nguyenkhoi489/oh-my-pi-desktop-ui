// Verify suite for RPC Chunk Reassembler (OMP Protocol RPC Chunking)
import { RpcChunkReassembler } from '../electron/rpc-chunk-reassembler.ts';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ✗ FAILED: ${message}`);
    failed++;
  } else {
    console.log(`  ✓ PASSED: ${message}`);
    passed++;
  }
}

console.log('=== Starting RPC Chunk Reassembler Verification Suite ===\n');

// ----------------------------------------------------
// Fixture 1: Ordered Chunk Reassembly
// ----------------------------------------------------
console.log('[Fixture 1] Ordered Chunk Reassembly');
{
  const reassembler = new RpcChunkReassembler();
  const originalObject = {
    id: 'req_test_01',
    type: 'response',
    command: 'get_messages_page',
    success: true,
    data: { messages: [{ role: 'user', content: 'Hello chunking!' }], totalMessages: 1 },
  };
  const jsonStr = JSON.stringify(originalObject);
  const fullBuffer = Buffer.from(jsonStr, 'utf-8');
  const byteLength = fullBuffer.length;

  // Split into 3 chunks
  const p1 = fullBuffer.subarray(0, 30);
  const p2 = fullBuffer.subarray(30, 60);
  const p3 = fullBuffer.subarray(60);

  const chunk1 = {
    type: 'rpc_chunk',
    chunkId: 'chunk-test-1',
    index: 0,
    count: 3,
    byteLength,
    data: p1.toString('base64'),
  };
  const chunk2 = {
    type: 'rpc_chunk',
    chunkId: 'chunk-test-1',
    index: 1,
    count: 3,
    byteLength,
    data: p2.toString('base64'),
  };
  const chunk3 = {
    type: 'rpc_chunk',
    chunkId: 'chunk-test-1',
    index: 2,
    count: 3,
    byteLength,
    data: p3.toString('base64'),
  };

  const res1 = reassembler.push(chunk1);
  assert(res1 === null, 'Chunk 0 returns null while incomplete');
  const res2 = reassembler.push(chunk2);
  assert(res2 === null, 'Chunk 1 returns null while incomplete');
  const res3 = reassembler.push(chunk3);
  assert(res3 !== null, 'Chunk 2 completes reassembly and returns frame');
  assert(res3.id === 'req_test_01', 'Reassembled frame id matches');
  assert(res3.type === 'response', 'Reassembled frame type matches response');
  assert(res3.data?.messages?.[0]?.content === 'Hello chunking!', 'Reassembled payload content matches');
  assert(reassembler.getPendingCount() === 0, 'Pending map is empty after completion');
}
console.log();

// ----------------------------------------------------
// Fixture 2: Out-of-Order Chunk Arrival
// ----------------------------------------------------
console.log('[Fixture 2] Out-of-Order Chunk Arrival');
{
  const reassembler = new RpcChunkReassembler();
  const payload = { result: 'Out of order success', count: 42 };
  const jsonStr = JSON.stringify(payload);
  const fullBuffer = Buffer.from(jsonStr, 'utf-8');
  const byteLength = fullBuffer.length;

  const p1 = fullBuffer.subarray(0, 15);
  const p2 = fullBuffer.subarray(15);

  const chunk0 = { type: 'rpc_chunk', chunkId: 'ooo-1', index: 0, count: 2, byteLength, data: p1.toString('base64') };
  const chunk1 = { type: 'rpc_chunk', chunkId: 'ooo-1', index: 1, count: 2, byteLength, data: p2.toString('base64') };

  // Deliver chunk 1 first, then chunk 0
  const r1 = reassembler.push(chunk1);
  assert(r1 === null, 'Chunk 1 delivered first returns null');
  assert(reassembler.getPendingCount() === 1, 'Group is retained in pending map');
  const r2 = reassembler.push(chunk0);
  assert(r2 !== null, 'Chunk 0 completes group and returns reassembled frame');
  assert(r2.result === 'Out of order success', 'Payload restored correctly despite arrival inversion');
}
console.log();

// ----------------------------------------------------
// Fixture 3: Concurrent Streams Separation
// ----------------------------------------------------
console.log('[Fixture 3] Concurrent Streams Separation');
{
  const reassembler = new RpcChunkReassembler();
  const payloadA = { stream: 'A' };
  const payloadB = { stream: 'B' };

  const bufA = Buffer.from(JSON.stringify(payloadA), 'utf-8');
  const bufB = Buffer.from(JSON.stringify(payloadB), 'utf-8');

  const chunkA0 = { type: 'rpc_chunk', chunkId: 'stream-A', index: 0, count: 2, byteLength: bufA.length, data: bufA.subarray(0, 5).toString('base64') };
  const chunkA1 = { type: 'rpc_chunk', chunkId: 'stream-A', index: 1, count: 2, byteLength: bufA.length, data: bufA.subarray(5).toString('base64') };

  const chunkB0 = { type: 'rpc_chunk', chunkId: 'stream-B', index: 0, count: 2, byteLength: bufB.length, data: bufB.subarray(0, 6).toString('base64') };
  const chunkB1 = { type: 'rpc_chunk', chunkId: 'stream-B', index: 1, count: 2, byteLength: bufB.length, data: bufB.subarray(6).toString('base64') };

  // Interleave chunks: A0, B0, B1 (completes B), A1 (completes A)
  assert(reassembler.push(chunkA0) === null, 'A0 returns null');
  assert(reassembler.push(chunkB0) === null, 'B0 returns null');
  assert(reassembler.getPendingCount() === 2, '2 concurrent streams tracked');

  const resB = reassembler.push(chunkB1);
  assert(resB !== null && resB.stream === 'B', 'B completes independently');
  assert(reassembler.getPendingCount() === 1, 'Stream A remains pending');

  const resA = reassembler.push(chunkA1);
  assert(resA !== null && resA.stream === 'A', 'A completes independently');
  assert(reassembler.getPendingCount() === 0, 'All streams cleared');
}
console.log();

// ----------------------------------------------------
// Fixture 4: Safety Guards & Boundary Validation
// ----------------------------------------------------
console.log('[Fixture 4] Safety Guards & Boundary Validation');
{
  const reassembler = new RpcChunkReassembler({ maxReassembledBytes: 100 });

  // 1. Oversized byteLength exceeds limit
  const oversized = { type: 'rpc_chunk', chunkId: 'big-1', index: 0, count: 2, byteLength: 500, data: Buffer.from('x').toString('base64') };
  assert(reassembler.push(oversized) === null, 'Oversized chunk rejected');
  assert(reassembler.getPendingCount() === 0, 'Oversized chunk not added to pending map');

  // 2. Invalid index or count
  assert(reassembler.push({ type: 'rpc_chunk', chunkId: 'inv-1', index: -1, count: 2, byteLength: 10, data: '' }) === null, 'Negative index rejected');
  assert(reassembler.push({ type: 'rpc_chunk', chunkId: 'inv-2', index: 2, count: 2, byteLength: 10, data: '' }) === null, 'Out of bounds index rejected');
  assert(reassembler.push({ type: 'rpc_chunk', chunkId: 'inv-3', index: 0, count: 0, byteLength: 10, data: '' }) === null, 'Zero count rejected');
  assert(reassembler.push({ type: 'other_type' }) === null, 'Non rpc_chunk type rejected');
  assert(reassembler.push(null) === null, 'Null rejected');

  // 3. Reset clears all pending
  const validChunk = { type: 'rpc_chunk', chunkId: 'res-1', index: 0, count: 2, byteLength: 50, data: Buffer.from('abc').toString('base64') };
  reassembler.push(validChunk);
  assert(reassembler.getPendingCount() === 1, 'Pending count is 1 before reset');
  reassembler.reset();
  assert(reassembler.getPendingCount() === 0, 'Pending count is 0 after reset');

  // 4. Dynamic maxReassembledBytes update
  reassembler.setMaxReassembledBytes(200);
  assert(reassembler.getMaxReassembledBytes() === 200, 'Max reassembled bytes updated');
}
console.log();

// ----------------------------------------------------
// Summary
// ----------------------------------------------------
console.log(`====================================================`);
console.log(`Verification Complete: ${passed} passed, ${failed} failed.`);
console.log(`====================================================`);

if (failed > 0) {
  process.exit(1);
}
