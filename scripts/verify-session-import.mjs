import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  scanClaudeSessions,
  scanCodexSessions,
  convertClaudeSessionToOmp,
  convertCodexSessionToOmp,
  importForeignSession,
  sanitizeCwdToSessionDirName,
  getOmpSessionDir,
} from '../electron/session-import.ts';

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passCount++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

console.log('=== Running verify-session-import.mjs ===');

const tmpDir = path.join(os.tmpdir(), `omp-test-session-import-${Date.now()}`);
fs.mkdirSync(tmpDir, { recursive: true });

try {
  // Test 1: Sanitize CWD and Session Dir
  test('sanitizeCwdToSessionDirName converts paths correctly', () => {
    const slug1 = sanitizeCwdToSessionDirName('/Users/test/Project');
    assert(slug1.includes('Users-test-Project'), `Unexpected slug: ${slug1}`);
    assert(slug1.startsWith('-'), 'Slug should start with -');
  });

  test('getOmpSessionDir resolves valid session directory', () => {
    const dir = getOmpSessionDir('/Users/test/Project');
    assert(dir.includes('.omp'), 'Should point to .omp path');
    assert(dir.includes('-Users-test-Project'), 'Should contain sanitized path');
  });

  // Test 2: Claude Session Scanning
  await asyncTest('scanClaudeSessions discovers sessions in mock claude dir', async () => {
    const mockClaude = path.join(tmpDir, '.claude');
    const mockProjects = path.join(mockClaude, 'projects', '-Users-test-SampleApp');
    fs.mkdirSync(mockProjects, { recursive: true });

    // Mock history.jsonl
    fs.writeFileSync(
      path.join(mockClaude, 'history.jsonl'),
      JSON.stringify({
        sessionId: 'session-c1',
        title: 'Claude Debug Session',
        timestamp: Date.now() - 10000,
        display: 'Fix authentication error',
      }) + '\n'
    );

    // Mock session file
    const sampleClaudeContent = [
      JSON.stringify({ type: 'mode', mode: 'normal', sessionId: 'session-c1' }),
      JSON.stringify({
        type: 'user',
        uuid: 'u-1',
        message: { role: 'user', content: 'Fix authentication error in middleware' },
        timestamp: new Date().toISOString(),
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: 'a-1',
        message: { role: 'assistant', content: 'I have analyzed the middleware logic.' },
        timestamp: new Date().toISOString(),
      }),
    ].join('\n');

    fs.writeFileSync(path.join(mockProjects, 'session-c1.jsonl'), sampleClaudeContent);

    const candidates = await scanClaudeSessions(mockClaude);
    assert.strictEqual(candidates.length, 1, 'Should find 1 candidate');
    assert.strictEqual(candidates[0].source, 'claude');
    assert.strictEqual(candidates[0].id, 'session-c1');
    assert.strictEqual(candidates[0].title, 'Claude Debug Session');
    assert.strictEqual(candidates[0].messageCount, 3);
  });

  // Test 3: Codex Session Scanning
  await asyncTest('scanCodexSessions discovers sessions in mock codex dir', async () => {
    const mockCodex = path.join(tmpDir, '.codex');
    const mockCodexSessions = path.join(mockCodex, 'sessions', '2026', '09');
    fs.mkdirSync(mockCodexSessions, { recursive: true });

    const sampleCodexContent = [
      JSON.stringify({
        type: 'session_meta',
        timestamp: '2026-09-02T10:00:00.000Z',
        payload: { id: 'session-codex-1', cwd: '/Users/test/CodexApp' },
      }),
      JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-09-02T10:00:05.000Z',
        payload: { type: 'thread_name_updated', thread_name: 'Implement OAuth callback' },
      }),
      JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-09-02T10:00:06.000Z',
        payload: { type: 'user_message', message: 'Hello Codex, help me with OAuth' },
      }),
      JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-09-02T10:00:10.000Z',
        payload: { type: 'agent_message', message: 'Sure, here is how to handle the callback.' },
      }),
    ].join('\n');

    fs.writeFileSync(path.join(mockCodexSessions, 'session-codex-1.jsonl'), sampleCodexContent);

    const candidates = await scanCodexSessions(mockCodex);
    assert.strictEqual(candidates.length, 1, 'Should find 1 codex candidate');
    assert.strictEqual(candidates[0].source, 'codex');
    assert.strictEqual(candidates[0].title, 'Implement OAuth callback');
    assert.strictEqual(candidates[0].cwd, '/Users/test/CodexApp');
  });

  // Test 4: Conversion from Claude to OMP
  test('convertClaudeSessionToOmp converts records with v3 headers', () => {
    const candidate = {
      source: 'claude',
      id: 'c-test-uuid',
      path: '/mock/path.jsonl',
      cwd: '/Users/test/App',
      title: 'Fix Redis Cache',
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
    };

    const claudeJsonl = [
      JSON.stringify({ type: 'mode', mode: 'normal' }),
      JSON.stringify({
        type: 'user',
        uuid: 'msg-u1',
        message: { role: 'user', content: 'Debug redis cache connection' },
      }),
      JSON.stringify({
        type: 'tool_use',
        id: 'call-1',
        name: 'read',
        input: { path: 'src/redis.ts' },
      }),
      JSON.stringify({
        type: 'tool_result',
        tool_use_id: 'call-1',
        name: 'read',
        content: 'const client = createClient();',
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: 'msg-a1',
        message: { role: 'assistant', content: 'Redis client is configured properly.' },
      }),
    ].join('\n');

    const result = convertClaudeSessionToOmp(claudeJsonl, candidate, '/Users/test/App');
    assert(result.sessionId, 'Should return a new sessionId');
    assert.strictEqual(result.title, 'Fix Redis Cache');

    const lines = result.ompJsonl.trim().split('\n').map((l) => JSON.parse(l));
    assert.strictEqual(lines[0].type, 'title', 'First line must be title');
    assert.strictEqual(lines[1].type, 'session', 'Second line must be session');
    assert.strictEqual(lines[1].version, 3, 'Version must be 3');
    assert.strictEqual(lines[2].type, 'custom', 'Third line should be foreign_session_import');
    assert.strictEqual(lines[2].customType, 'foreign_session_import');

    const userMsg = lines.find((l) => l.type === 'message' && l.message?.role === 'user');
    assert(userMsg, 'User message must be preserved');
    assert.strictEqual(userMsg.message.content, 'Debug redis cache connection');

    const toolCall = lines.find((l) => l.type === 'custom' && l.customType === 'tool_execution_start');
    assert(toolCall, 'Tool execution start must be converted');
    assert.strictEqual(toolCall.data.toolName, 'read');

    const toolResult = lines.find((l) => l.type === 'message' && l.message?.role === 'toolResult');
    assert(toolResult, 'Tool result must be converted');
  });

  // Test 5: Conversion from Codex to OMP
  test('convertCodexSessionToOmp converts records cleanly', () => {
    const candidate = {
      source: 'codex',
      id: 'codex-uuid-1',
      path: '/mock/codex.jsonl',
      cwd: '/Users/test/CodexApp',
      title: 'Codex Workflow',
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
    };

    const codexJsonl = [
      JSON.stringify({
        type: 'session_meta',
        payload: { id: 'codex-1', cwd: '/Users/test/CodexApp' },
      }),
      JSON.stringify({
        type: 'event_msg',
        payload: { type: 'user_message', message: 'Optimize database indexes' },
      }),
      JSON.stringify({
        type: 'event_msg',
        payload: { type: 'agent_message', message: 'Added index on user_id column.' },
      }),
    ].join('\n');

    const result = convertCodexSessionToOmp(codexJsonl, candidate, '/Users/test/CodexApp');
    assert(result.sessionId, 'Should return sessionId');
    const lines = result.ompJsonl.trim().split('\n').map((l) => JSON.parse(l));

    assert.strictEqual(lines[0].type, 'title');
    assert.strictEqual(lines[1].type, 'session');
    const userMsg = lines.find((l) => l.type === 'message' && l.message?.role === 'user');
    assert.strictEqual(userMsg.message.content, 'Optimize database indexes');
  });

  // Test 6: Import Execution to Disk
  await asyncTest('importForeignSession writes converted session to target folder', async () => {
    const sourceFilePath = path.join(tmpDir, 'source-claude.jsonl');
    fs.writeFileSync(
      sourceFilePath,
      [
        JSON.stringify({ type: 'mode', mode: 'normal' }),
        JSON.stringify({
          type: 'user',
          message: { role: 'user', content: 'Test import flow' },
        }),
      ].join('\n')
    );

    const candidate = {
      source: 'claude',
      id: 'test-import-id',
      path: sourceFilePath,
      title: 'Import Test Session',
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
    };

    const targetSessionDir = path.join(tmpDir, 'omp-sessions-target');
    const importRes = await importForeignSession(candidate, '/Users/test/TargetApp', targetSessionDir);

    assert(importRes.success, 'Import must succeed');
    assert(importRes.sessionPath, 'Must return sessionPath');
    assert(fs.existsSync(importRes.sessionPath), 'Imported file must exist on disk');

    const writtenContent = fs.readFileSync(importRes.sessionPath, 'utf-8');
    assert(writtenContent.includes('"title":"Import Test Session"'), 'Title must be written');
    assert(writtenContent.includes('"foreign_session_import"'), 'Provenance must be recorded');
  });

  // Test 7: Error handling for missing source
  await asyncTest('importForeignSession handles missing source gracefully', async () => {
    const candidate = {
      source: 'claude',
      id: 'non-existent',
      path: path.join(tmpDir, 'does-not-exist.jsonl'),
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
    };

    const res = await importForeignSession(candidate, '/Users/test/TargetApp', tmpDir);
    assert.strictEqual(res.success, false);
    assert(res.error, 'Must provide error message');
  });

} finally {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}

console.log(`\nAll ${passCount} tests passed successfully!`);
