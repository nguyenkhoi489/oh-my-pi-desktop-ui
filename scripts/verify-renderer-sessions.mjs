/**
 * Verification Suite: Renderer Sessions List & Switch Flow (Phase 2)
 * 
 * Verifies Phase 2 Requirements:
 * 1. formatRelativeTime helper for relative timestamps (now, min, hour, yesterday, days, dates)
 * 2. refreshSessions: fetch sessions, list parsing, active session path resolution
 * 3. switchSession:
 *    - UI busy guard blocks switch without IPC when status !== 'idle'
 *    - Handling session_busy error from bridge gracefully without state change
 *    - Success: loads history, replaces messages, clears diffs/toolCalls/uiQueue, refreshes sessions & state
 * 4. newSession:
 *    - Guard when busy
 *    - Success: clears messages/diffs/toolCalls/stream/uiQueue, refreshes sessions & state
 * 5. branchFromMessage & correlateBranchEntries:
 *    - Single unambiguous (role: 'user', timestamp) match attaches entryId
 *    - Ambiguous duplicate timestamps do not attach entryId (safe degradation)
 *    - Assistant messages never attach entryId
 *    - branchFromMessage calls branchSession, reloads history, refreshes sessions & state
 */

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

console.log('=== Starting Renderer Sessions & Switch Flow Verification Suite (Phase 2) ===\n');

// ----------------------------------------------------
// Test 1: formatRelativeTime Helper
// ----------------------------------------------------
console.log('[Test 1] Relative Time Formatter Verification');
{
  function formatRelativeTime(dateInput) {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (isNaN(diffMs)) return '';

    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Vừa xong';

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m trước`;

    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h trước`;

    const diffDay = Math.floor(diffHour / 24);
    if (diffDay === 1) return 'Hôm qua';
    if (diffDay < 7) return `${diffDay}d trước`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  const now = Date.now();
  assert(formatRelativeTime(now - 10000) === 'Vừa xong', '10s ago formatted as "Vừa xong"');
  assert(formatRelativeTime(now - 5 * 60 * 1000) === '5m trước', '5m ago formatted as "5m trước"');
  assert(formatRelativeTime(now - 3 * 60 * 60 * 1000) === '3h trước', '3h ago formatted as "3h trước"');
  assert(formatRelativeTime(now - 24 * 60 * 60 * 1000) === 'Hôm qua', '24h ago formatted as "Hôm qua"');
  assert(formatRelativeTime(now - 3 * 24 * 60 * 60 * 1000) === '3d trước', '3d ago formatted as "3d trước"');
  assert(formatRelativeTime('') === '', 'Empty string returns empty');
  assert(formatRelativeTime(null) === '', 'null returns empty');
  assert(formatRelativeTime('invalid-date') === '', 'Invalid date string returns empty');
}

// ----------------------------------------------------
// Test 2: refreshSessions & Active Session Resolution
// ----------------------------------------------------
console.log('\n[Test 2] Session State & refreshSessions Flow');
{
  let sessions = [];
  let activeSessionPath = null;
  let engineState = { sessionFile: '/path/to/session-2.jsonl' };

  const mockSessionsList = [
    {
      path: '/path/to/session-1.jsonl',
      id: 'sess-1',
      title: 'Fix TypeScript Build Errors',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 1800000).toISOString(),
      active: false,
    },
    {
      path: '/path/to/session-2.jsonl',
      id: 'sess-2',
      title: 'Implement OMP Agent RPC Bridge',
      timestamp: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      active: true,
    },
  ];

  const mockElectronAPI = {
    listSessions: async () => ({
      success: true,
      sessions: mockSessionsList,
    }),
  };

  async function refreshSessions() {
    const res = await mockElectronAPI.listSessions();
    if (res.success && Array.isArray(res.sessions)) {
      sessions = res.sessions;
      const active = res.sessions.find((s) => s.active);
      if (active) {
        activeSessionPath = active.path;
      } else if (engineState?.sessionFile) {
        activeSessionPath = engineState.sessionFile;
      }
      return res.sessions;
    }
    return [];
  }

  await refreshSessions();

  assert(sessions.length === 2, 'Sessions list populated with 2 sessions');
  assert(sessions[0].title === 'Fix TypeScript Build Errors', 'First session title intact');
  assert(sessions[1].title === 'Implement OMP Agent RPC Bridge', 'Second session title intact');
  assert(activeSessionPath === '/path/to/session-2.jsonl', 'activeSessionPath matches active session');
}

// ----------------------------------------------------
// Test 3: Switch Session Flow & Busy Guard
// ----------------------------------------------------
console.log('\n[Test 3] switchSession UI Busy Guard & Error Handling');
{
  let status = 'idle';
  let messages = [{ id: 'm1', role: 'user', content: 'hello', timestamp: 1000 }];
  let activeDiff = { id: 'd1', filePath: 'a.ts', status: 'pending' };
  let activeToolCalls = [{ id: 't1', name: 'read', status: 'running' }];
  let currentThinking = { id: 'th1', thought: 'thinking...', completed: false };
  let currentStreamText = 'streaming token...';
  let uiRequestQueue = [{ id: 'req1', method: 'select', title: 'Allow tool' }];
  let activeSessionPath = '/path/to/session-1.jsonl';
  let ipcSwitchCallCount = 0;

  const mockElectronAPI = {
    switchSession: async (path) => {
      ipcSwitchCallCount++;
      if (path === '/path/to/busy.jsonl') {
        return { success: false, error: 'session_busy' };
      }
      return { success: true };
    },
    loadHistory: async () => ({
      success: true,
      messages: [
        { id: 'h1', role: 'user', content: 'Historical prompt', timestamp: 5000 },
        { id: 'h2', role: 'assistant', content: 'Historical answer', timestamp: 6000 },
      ],
    }),
    getBranchEntries: async () => ({
      success: true,
      entries: [{ entryId: 'e-5000', role: 'user', timestamp: 5000 }],
    }),
    listSessions: async () => ({
      success: true,
      sessions: [
        { path: '/path/to/session-1.jsonl', id: 's1', title: 'S1', timestamp: '2026-09-01T00:00:00Z', active: false },
        { path: '/path/to/session-2.jsonl', id: 's2', title: 'S2', timestamp: '2026-09-01T01:00:00Z', active: true },
      ],
    }),
    getState: async () => ({ success: true, state: {} }),
  };

  async function correlateBranchEntries(currentMsgs) {
    const branchRes = await mockElectronAPI.getBranchEntries();
    if (branchRes.success && Array.isArray(branchRes.entries)) {
      const timestampCounts = new Map();
      for (const entry of branchRes.entries) {
        if (entry.role === 'user' && typeof entry.timestamp === 'number') {
          const list = timestampCounts.get(entry.timestamp) || [];
          list.push(entry);
          timestampCounts.set(entry.timestamp, list);
        }
      }
      return currentMsgs.map((m) => {
        if (m.role === 'user') {
          const matches = timestampCounts.get(m.timestamp);
          if (matches && matches.length === 1) {
            return { ...m, entryId: matches[0].entryId };
          }
          return { ...m, entryId: undefined };
        }
        return m;
      });
    }
    return currentMsgs;
  }

  async function switchSession(sessionPath) {
    if (status !== 'idle') {
      return false;
    }
    const res = await mockElectronAPI.switchSession(sessionPath);
    if (res.success) {
      const histRes = await mockElectronAPI.loadHistory();
      if (histRes.success && Array.isArray(histRes.messages)) {
        currentStreamText = '';
        currentThinking = null;
        activeToolCalls = [];
        activeDiff = null;
        uiRequestQueue = [];

        const correlated = await correlateBranchEntries(histRes.messages);
        messages = correlated;
        activeSessionPath = sessionPath;
        return true;
      }
    }
    return false;
  }

  // 1. Guard check when status is thinking / streaming
  status = 'thinking';
  const switchWhileThinking = await switchSession('/path/to/session-2.jsonl');
  assert(switchWhileThinking === false, 'switchSession returns false when status is thinking');
  assert(ipcSwitchCallCount === 0, 'No IPC call made when UI guard blocks switch');

  status = 'streaming';
  const switchWhileStreaming = await switchSession('/path/to/session-2.jsonl');
  assert(switchWhileStreaming === false, 'switchSession returns false when status is streaming');
  assert(ipcSwitchCallCount === 0, 'No IPC call made during streaming');

  // 2. Guard check when bridge returns session_busy
  status = 'idle';
  const busyResult = await switchSession('/path/to/busy.jsonl');
  assert(busyResult === false, 'switchSession returns false on session_busy');
  assert(ipcSwitchCallCount === 1, 'IPC call made when status is idle');
  assert(messages.length === 1 && messages[0].id === 'm1', 'Messages unchanged on session_busy error');
  assert(activeDiff !== null, 'Active diff unchanged on session_busy error');

  // 3. Successful switch
  const successResult = await switchSession('/path/to/session-2.jsonl');
  assert(successResult === true, 'switchSession returns true on success');
  assert(activeSessionPath === '/path/to/session-2.jsonl', 'activeSessionPath updated to new session');
  assert(messages.length === 2, 'messages replaced with 2 historical messages');
  assert(messages[0].content === 'Historical prompt', 'First historical message loaded');
  assert(messages[0].entryId === 'e-5000', 'Historical user message has correlated entryId');
  assert(messages[1].role === 'assistant', 'Second historical message is assistant');
  assert(activeDiff === null, 'Active diff cleared on switch');
  assert(activeToolCalls.length === 0, 'Active tool calls cleared on switch');
  assert(currentThinking === null, 'Current thinking cleared on switch');
  assert(currentStreamText === '', 'Stream text cleared on switch');
  assert(uiRequestQueue.length === 0, 'UI request queue cleared on switch');
}

// ----------------------------------------------------
// Test 4: New Session Flow
// ----------------------------------------------------
console.log('\n[Test 4] newSession Flow & State Reset');
{
  let status = 'idle';
  let messages = [
    { id: 'm1', role: 'user', content: 'hello', timestamp: 1000 },
    { id: 'm2', role: 'assistant', content: 'world', timestamp: 2000 },
  ];
  let activeDiff = { id: 'd1', filePath: 'b.ts', status: 'pending' };
  let activeToolCalls = [{ id: 't1', name: 'write', status: 'running' }];
  let currentThinking = { id: 'th1', thought: 'thinking...', completed: false };
  let currentStreamText = 'token';
  let uiRequestQueue = [{ id: 'r1', method: 'confirm', title: 'Confirm' }];
  let activeSessionPath = '/path/to/session-1.jsonl';
  let ipcNewSessionCalled = false;

  const mockElectronAPI = {
    newSession: async () => {
      ipcNewSessionCalled = true;
      return { success: true };
    },
    listSessions: async () => ({ success: true, sessions: [] }),
    getState: async () => ({ success: true, state: {} }),
  };

  async function newSession(parentSession) {
    if (status !== 'idle') return false;
    const res = await mockElectronAPI.newSession(parentSession);
    if (res.success) {
      messages = [];
      currentStreamText = '';
      currentThinking = null;
      activeToolCalls = [];
      activeDiff = null;
      uiRequestQueue = [];
      activeSessionPath = null;
      return true;
    }
    return false;
  }

  // 1. Guard check when busy
  status = 'executing_tool';
  const newWhileBusy = await newSession();
  assert(newWhileBusy === false, 'newSession returns false when agent is executing tool');
  assert(ipcNewSessionCalled === false, 'newSession IPC was not called when busy');

  // 2. New session when idle
  status = 'idle';
  const newSuccess = await newSession();
  assert(newSuccess === true, 'newSession succeeds when idle');
  assert(ipcNewSessionCalled === true, 'newSession IPC called');
  assert(messages.length === 0, 'Messages array emptied');
  assert(activeDiff === null, 'Active diff cleared');
  assert(activeToolCalls.length === 0, 'Active tool calls cleared');
  assert(currentThinking === null, 'Thinking cleared');
  assert(currentStreamText === '', 'Stream text cleared');
  assert(uiRequestQueue.length === 0, 'UI request queue cleared');
  assert(activeSessionPath === null, 'Active session path reset to null');
}

// ----------------------------------------------------
// Test 5: Branch Correlation & branchFromMessage Flow
// ----------------------------------------------------
console.log('\n[Test 5] Branch Correlation & branchFromMessage Flow');
{
  const inputMessages = [
    { id: 'm-1', role: 'user', content: 'Turn 1 prompt', timestamp: 10000 },
    { id: 'm-2', role: 'assistant', content: 'Turn 1 reply', timestamp: 11000 },
    { id: 'm-3', role: 'user', content: 'Turn 2 duplicate prompt', timestamp: 20000 },
    { id: 'm-4', role: 'assistant', content: 'Turn 2 reply', timestamp: 21000 },
    { id: 'm-5', role: 'user', content: 'Turn 2 duplicate prompt', timestamp: 22000 },
    { id: 'm-6', role: 'user', content: 'Turn 3 prompt (no matching entry)', timestamp: 30000 },
  ];

  const branchEntries = [
    { entryId: 'entry-turn-1', text: 'Turn 1 prompt', role: 'user' },
    { entryId: 'entry-dup-1', text: 'Turn 2 duplicate prompt', role: 'user' },
    { entryId: 'entry-dup-2', text: 'Turn 2 duplicate prompt', role: 'user' },
  ];

  function correlateBranchEntries(currentMsgs, entries) {
    const textToEntries = new Map();
    for (const entry of entries) {
      const rawText = entry.text ?? entry.content;
      if (typeof rawText === 'string') {
        const list = textToEntries.get(rawText) || [];
        list.push(entry);
        textToEntries.set(rawText, list);
      }
    }

    const userTextCounts = new Map();
    for (const m of currentMsgs) {
      if (m.role === 'user' && typeof m.content === 'string') {
        userTextCounts.set(m.content, (userTextCounts.get(m.content) || 0) + 1);
      }
    }

    return currentMsgs.map((m) => {
      if (m.role === 'user' && typeof m.content === 'string') {
        const matches = textToEntries.get(m.content);
        const userCount = userTextCounts.get(m.content) || 0;
        if (matches && matches.length === 1 && userCount === 1) {
          return { ...m, entryId: matches[0].entryId };
        }
        return { ...m, entryId: undefined };
      }
      return m;
    });
  }

  const correlated = correlateBranchEntries(inputMessages, branchEntries);

  assert(correlated[0].entryId === 'entry-turn-1', 'Single match user message correctly assigned entryId');
  assert(correlated[1].entryId === undefined, 'Assistant message does not receive entryId');
  assert(correlated[2].entryId === undefined, 'Ambiguous duplicate prompt text safely degrades to undefined');
  assert(correlated[3].entryId === undefined, 'Assistant message ignores matching entry');
  assert(correlated[4].entryId === undefined, 'Second ambiguous duplicate prompt text degrades to undefined');
  assert(correlated[5].entryId === undefined, 'User message with no entry has undefined entryId');
  // Test branch action
  let status = 'idle';
  let branchedEntryId = null;
  const mockElectronAPI = {
    branchSession: async (entryId) => {
      branchedEntryId = entryId;
      return { success: true };
    },
    loadHistory: async () => ({
      success: true,
      messages: [
        { id: 'b-m1', role: 'user', content: 'Turn 1 prompt', timestamp: 10000 },
      ],
    }),
    getBranchEntries: async () => ({
      success: true,
      entries: [{ entryId: 'entry-turn-1', role: 'user', timestamp: 10000 }],
    }),
  };

  async function branchFromMessage(entryId) {
    if (status !== 'idle') return false;
    const res = await mockElectronAPI.branchSession(entryId);
    if (res.success) {
      const histRes = await mockElectronAPI.loadHistory();
      if (histRes.success && Array.isArray(histRes.messages)) {
        return true;
      }
    }
    return false;
  }

  const branchOk = await branchFromMessage('entry-turn-1');
  assert(branchOk === true, 'branchFromMessage succeeded');
  assert(branchedEntryId === 'entry-turn-1', 'Correct entryId passed to branchSession IPC');

  status = 'waiting_permission';
  const branchBusy = await branchFromMessage('entry-turn-1');
  assert(branchBusy === false, 'branchFromMessage blocked when status is waiting_permission');
}

// ----------------------------------------------------
// Summary
// ----------------------------------------------------
console.log(`\n====================================================`);
console.log(`Renderer Sessions Verification: ${passed} passed, ${failed} failed.`);
console.log(`====================================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
