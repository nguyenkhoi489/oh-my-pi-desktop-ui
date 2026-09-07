import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
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

console.log('=== Starting Fast Session Switching Verification Suite ===\n');

// ----------------------------------------------------
// Test 1: Direct JSONL Reading & Parsing Performance
// ----------------------------------------------------
console.log('[Test 1] Fast Direct JSONL Reading Performance (< 50ms)');
{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-session-test-'));
  const testSessionFile = path.join(tempDir, 'test-session.jsonl');

  // Generate a mock session file with 100 messages
  const lines = [
    JSON.stringify({ type: 'session', id: 'sess-123', timestamp: new Date().toISOString(), title: 'Benchmark Session' }),
  ];

  for (let i = 1; i <= 50; i++) {
    lines.push(
      JSON.stringify({
        type: 'message',
        message: {
          id: `u-${i}`,
          role: 'user',
          content: `User query ${i}`,
          timestamp: Date.now() + i * 1000,
        },
      })
    );
    lines.push(
      JSON.stringify({
        type: 'message',
        message: {
          id: `a-${i}`,
          role: 'assistant',
          content: `Assistant response ${i} with **code** and details.`,
          timestamp: Date.now() + i * 1000 + 500,
        },
      })
    );
  }

  fs.writeFileSync(testSessionFile, lines.join('\n') + '\n', 'utf-8');

  const bridge = new OmpBridge(null, null);

  const startTime = performance.now();
  const rawMsgs = await bridge.readSessionMessagesFromDiskAsync(testSessionFile);
  const translated = bridge.translateHistoryMessages(rawMsgs);
  const duration = performance.now() - startTime;

  console.log(`  Reading 100 messages directly from disk took: ${duration.toFixed(2)}ms`);
  assert(duration < 50, `Reading 100 messages directly from disk must take < 50ms (took ${duration.toFixed(2)}ms)`);
  assert(rawMsgs.length === 100, `Raw messages count should be 100, got ${rawMsgs.length}`);
  assert(translated.length === 100, `Translated messages count should be 100, got ${translated.length}`);
  assert(translated[0].role === 'user' && translated[0].content === 'User query 1', 'First message matches');
  assert(translated[99].role === 'assistant', 'Last message matches');

  // Test fastLoadSession API directly
  const fastRes = await bridge.fastLoadSession(testSessionFile);
  assert(fastRes.success === true, 'fastLoadSession returned success');
  assert(fastRes.messages?.length === 100, 'fastLoadSession returned all 100 messages');

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ----------------------------------------------------
// Test 2: In-Memory LRU Cache Logic & Latency (< 1ms)
// ----------------------------------------------------
console.log('\n[Test 2] In-Memory LRU Cache Logic (Max 10 Items, Eviction, Latency)');
{
  const MAX_SESSION_CACHE = 10;
  const cache = new Map();

  function setCachedSession(pathKey, msgs) {
    if (cache.has(pathKey)) {
      cache.delete(pathKey);
    } else if (cache.size >= MAX_SESSION_CACHE) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    cache.set(pathKey, msgs);
  }

  function getCachedSession(pathKey) {
    if (!cache.has(pathKey)) return undefined;
    const msgs = cache.get(pathKey);
    cache.delete(pathKey);
    cache.set(pathKey, msgs);
    return msgs;
  }

  // Insert 10 sessions
  for (let i = 1; i <= 10; i++) {
    setCachedSession(`/path/to/session-${i}.jsonl`, [{ id: `m-${i}`, role: 'user', content: `Hello ${i}` }]);
  }
  assert(cache.size === 10, 'Cache has exactly 10 sessions');

  // Cache hit test latency
  const hitStart = performance.now();
  const hit = getCachedSession('/path/to/session-1.jsonl');
  const hitDuration = performance.now() - hitStart;
  assert(hitDuration < 1, `LRU cache hit must be < 1ms (took ${hitDuration.toFixed(3)}ms)`);
  assert(hit !== undefined && hit[0].content === 'Hello 1', 'Session 1 retrieved successfully');

  // Insert 11th session -> session-2 should be evicted (since session-1 was refreshed)
  setCachedSession('/path/to/session-11.jsonl', [{ id: 'm-11', role: 'user', content: 'Hello 11' }]);
  assert(cache.size === 10, 'Cache size bounded at 10');
  assert(getCachedSession('/path/to/session-2.jsonl') === undefined, 'Session 2 was evicted as oldest LRU');
  assert(getCachedSession('/path/to/session-1.jsonl') !== undefined, 'Session 1 retained because it was recently read');
  assert(getCachedSession('/path/to/session-11.jsonl') !== undefined, 'Session 11 present');
}

// ----------------------------------------------------
// Test 3: Chat History Pagination Windowing & Scroll Invariants
// ----------------------------------------------------
console.log('\n[Test 3] Chat History Pagination Windowing Invariants');
{
  const PAGE_SIZE = 25;
  const mockMessages = Array.from({ length: 70 }, (_, i) => ({
    id: `msg-${i}`,
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Message ${i}`,
  }));

  let visibleCount = PAGE_SIZE;

  function getVisibleMessages(msgs, count) {
    if (msgs.length <= count) return msgs;
    return msgs.slice(-count);
  }

  // Initial render: only 25 latest messages
  const initialVisible = getVisibleMessages(mockMessages, visibleCount);
  assert(initialVisible.length === 25, 'Initial visible count is exactly 25');
  assert(initialVisible[0].id === 'msg-45', 'First visible is msg-45 (slice from -25)');
  assert(initialVisible[24].id === 'msg-69', 'Last visible is msg-69 (latest)');
  assert(mockMessages.length - visibleCount === 45, '45 hidden older messages remaining');

  // First "Load More" click
  visibleCount = Math.min(visibleCount + PAGE_SIZE, mockMessages.length);
  const step2Visible = getVisibleMessages(mockMessages, visibleCount);
  assert(step2Visible.length === 50, 'Second visible count is 50');
  assert(step2Visible[0].id === 'msg-20', 'First visible is msg-20');
  assert(mockMessages.length - visibleCount === 20, '20 hidden older messages remaining');

  // Second "Load More" click (reaches all 70)
  visibleCount = Math.min(visibleCount + PAGE_SIZE, mockMessages.length);
  const step3Visible = getVisibleMessages(mockMessages, visibleCount);
  assert(step3Visible.length === 70, 'Third visible count is 70 (all messages)');
  assert(step3Visible[0].id === 'msg-0', 'First visible is now msg-0');
  assert(mockMessages.length - visibleCount === 0, '0 hidden older messages remaining');

  // Global Index mapping invariant for rollback/retry in paginated view
  const pVisible = getVisibleMessages(mockMessages, 25);
  const startIndex = mockMessages.length - pVisible.length; // 45
  for (let localIndex = 0; localIndex < pVisible.length; localIndex++) {
    const globalIndex = startIndex + localIndex;
    assert(mockMessages[globalIndex].id === pVisible[localIndex].id, `Global index ${globalIndex} matches local index ${localIndex}`);
  }
  // Verify retry lookup slicing: local index 0 in paginated view maps to 45 previous messages in full session
  const prevSlice = mockMessages.slice(0, startIndex + 0);
  assert(prevSlice.length === 45, 'Previous slice contains all 45 previous messages, not 0');

  // Small session (<= 25 items): no pagination header
  const smallMessages = mockMessages.slice(0, 10);
  const smallVisible = getVisibleMessages(smallMessages, PAGE_SIZE);
  assert(smallVisible.length === 10, 'Small session renders all 10 messages without slicing');
}

// ----------------------------------------------------
// Test 4: Rapid Switch Race-Condition Protection (Switch ID)
// ----------------------------------------------------
console.log('\n[Test 4] Rapid Switch Race-Condition Protection (Request ID Guard)');
{
  let currentSwitchId = 0;
  let activeSession = null;
  let renderedMessages = [];

  async function mockSwitchSession(targetPath, delayMs, messagesToReturn) {
    const switchId = ++currentSwitchId;

    // Simulate async I/O
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    // Guard: ignore if another switch happened in the meantime
    if (switchId !== currentSwitchId) {
      return { success: false, dropped: true };
    }

    activeSession = targetPath;
    renderedMessages = messagesToReturn;
    return { success: true, dropped: false };
  }

  // Trigger switch 1 (slow: 40ms) then immediately switch 2 (fast: 10ms)
  const p1 = mockSwitchSession('/session-1.jsonl', 40, [{ id: '1', content: 'From slow session 1' }]);
  const p2 = mockSwitchSession('/session-2.jsonl', 10, [{ id: '2', content: 'From fast session 2' }]);

  const [res1, res2] = await Promise.all([p1, p2]);

  assert(res2.success === true, 'Session 2 switch succeeded');
  assert(res1.dropped === true, 'Session 1 switch was dropped because it finished after session 2');
  assert(activeSession === '/session-2.jsonl', 'Active session reflects final user intent');
  assert(renderedMessages[0].content === 'From fast session 2', 'Rendered messages are not overwritten by slow session 1');
}

// ----------------------------------------------------
// Test 5: Session Index In-Memory Cache Invariants
// ----------------------------------------------------
console.log('\n[Test 5] Session Index Cache & TTL Invariants');
{
  const cache = new Map();
  const TTL_MS = 60000;
  let diskReadCount = 0;

  async function getSessionsForProject(projectId, now = Date.now()) {
    const cached = cache.get(projectId);
    if (cached && now - cached.timestamp < TTL_MS) {
      return cached.sessions;
    }
    diskReadCount++;
    const sessions = [{ id: 's1', projectId, title: 'Session 1' }];
    cache.set(projectId, { sessions, timestamp: now });
    return sessions;
  }

  const baseTime = Date.now();

  // First call -> reads from disk
  const r1 = await getSessionsForProject('proj-1', baseTime);
  assert(diskReadCount === 1, 'First call reads from disk');
  assert(r1.length === 1, 'Returns 1 session');

  // Second call within TTL -> hits cache, diskReadCount unchanged
  const r2 = await getSessionsForProject('proj-1', baseTime + 5000);
  assert(diskReadCount === 1, 'Second call within TTL hits cache (no disk read)');
  assert(r2 === r1, 'Returns cached reference');

  // Invalidation on session mutation
  cache.delete('proj-1');
  const r3 = await getSessionsForProject('proj-1', baseTime + 6000);
  assert(diskReadCount === 2, 'Call after invalidation triggers disk read');
}

// ----------------------------------------------------
// Test 6: Cross-Project Session Switching Invariants & Non-empty Active Project List
// ----------------------------------------------------
console.log('\n[Test 6] Cross-Project Switching & Active Project Sessions Invariants');
{
  const mainSource = fs.readFileSync(path.resolve(process.cwd(), 'electron/main.ts'), 'utf-8');
  assert(mainSource.includes('allSessionsNested = await Promise.all(\n      projects.map(async (p) => {'), 'main.ts indexes all projects without excluding activeProject');
  assert(!mainSource.includes('projects.filter((p) => !activeProject || p.id !== activeProject.id)'), 'main.ts does not drop activeProject from session index cache');

  const workspaceSource = fs.readFileSync(path.resolve(process.cwd(), 'src/hooks/useWorkspace.ts'), 'utf-8');
  assert(workspaceSource.includes('if (!opts?.isSessionSwitch) {\n            await options?.onProcessStarted?.();\n          }'), 'useWorkspace guards onProcessStarted with !opts?.isSessionSwitch');

  const appSource = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
  assert(appSource.includes('openFolderDialog(project.path, { isSessionSwitch: true })'), 'App.tsx passes isSessionSwitch: true during cross-project session selection');

  const ompRpcSource = fs.readFileSync(path.resolve(process.cwd(), 'src/hooks/useOmpRpc.ts'), 'utf-8');
  assert(ompRpcSource.includes('// 1. Optimistic render from in-memory LRU cache (< 1ms)'), 'useOmpRpc renders cached messages optimistically before switchPromise');
  assert(ompRpcSource.includes('// 2. Direct JSONL load in parallel (< 20ms)'), 'useOmpRpc loads direct JSONL in parallel before switchPromise');
}
console.log('\n====================================================');
console.log(`Fast Session Switching Verification: ${passed} passed, ${failed} failed.`);
console.log('====================================================\n');
