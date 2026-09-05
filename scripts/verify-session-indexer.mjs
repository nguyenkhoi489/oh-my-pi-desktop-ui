import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { indexProjectSessions, parseSessionHeader } from '../electron/session-indexer.ts';
import { getProfileSessionDir } from '../electron/profile-paths.ts';

let passCount = 0;
async function test(name, fn) {
  await fn();
  passCount++;
  console.log(`✓ ${name}`);
}

console.log('=== Running verify-session-indexer.mjs ===');

const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), 'omp-indexer-verify-'));
const previousOmpHome = process.env.OMP_HOME;
process.env.OMP_HOME = tempBase;
try {
  // Test 1: Nonexistent directory
  await test('Nonexistent project directory returns empty array safely', async () => {
    const nonexistentPath = path.join(tempBase, 'does-not-exist');
    const sessions = await indexProjectSessions('proj-1', nonexistentPath);
    assert(Array.isArray(sessions), 'Should return array');
    assert.equal(sessions.length, 0, 'Should return empty array');
  });

  // Test 2: Standard session indexing and header parsing
  await test('Correctly parses valid session files with title and session frames', async () => {
    const realProjectDir = path.join(tempBase, 'real-project');
    await fs.mkdir(realProjectDir, { recursive: true });

    const canonicalPath = await fs.realpath(realProjectDir);
    const sessionDir = getProfileSessionDir(undefined, canonicalPath);
    await fs.mkdir(sessionDir, { recursive: true });

    const sess1File = path.join(sessionDir, 'session-001.jsonl');
    const sess1Content = [
      JSON.stringify({ type: 'session', id: 'sess-uuid-1', timestamp: '2026-09-04T10:00:00.000Z' }),
      JSON.stringify({ type: 'title', title: 'Refactor Authentication' }),
      JSON.stringify({ type: 'message', role: 'user', content: 'Hello' }),
    ].join('\n');
    await fs.writeFile(sess1File, sess1Content, 'utf-8');

    const sess2File = path.join(sessionDir, 'session-002.jsonl');
    const sess2Content = [
      JSON.stringify({ type: 'title', title: 'Setup Database', updatedAt: '2026-09-04T11:00:00.000Z' }),
      JSON.stringify({ type: 'session', id: 'sess-uuid-2', timestamp: '2026-09-04T09:00:00.000Z' }),
    ].join('\n');
    await fs.writeFile(sess2File, sess2Content, 'utf-8');

    const sessions = await indexProjectSessions('proj-test', realProjectDir);
    assert.equal(sessions.length, 2, 'Should index both sessions');

    // Should be sorted descending by updatedAt
    assert.equal(sessions[0].id, 'sess-uuid-2');
    assert.equal(sessions[0].title, 'Setup Database');
    assert.equal(sessions[0].projectId, 'proj-test');
    assert.equal(sessions[0].projectPath, canonicalPath);

    assert.equal(sessions[1].id, 'sess-uuid-1');
    assert.equal(sessions[1].title, 'Refactor Authentication');
    assert.equal(sessions[1].projectId, 'proj-test');
  });

  // Test 3: Symlink resolution
  await test('Resolves symlinks to canonical path before matching session dir', async () => {
    const realTargetDir = path.join(tempBase, 'symlink-target');
    await fs.mkdir(realTargetDir, { recursive: true });
    const symlinkDir = path.join(tempBase, 'symlink-alias');
    await fs.symlink(realTargetDir, symlinkDir, 'dir');

    const canonicalTarget = await fs.realpath(realTargetDir);
    const sessionDir = getProfileSessionDir(undefined, canonicalTarget);
    await fs.mkdir(sessionDir, { recursive: true });

    const sessFile = path.join(sessionDir, 'symlink-sess.jsonl');
    await fs.writeFile(
      sessFile,
      JSON.stringify({ type: 'title', title: 'Symlink Test' }) + '\n' +
      JSON.stringify({ type: 'session', id: 'sym-01', timestamp: '2026-09-04T12:00:00.000Z' }),
      'utf-8'
    );

    const sessions = await indexProjectSessions('proj-sym', symlinkDir);
    assert.equal(sessions.length, 1, 'Should find session via symlinked path');
    assert.equal(sessions[0].projectPath, canonicalTarget, 'DTO projectPath must be canonical realpath');
    assert.equal(sessions[0].title, 'Symlink Test');
  });

  // Test 4: Custom profile support
  await test('Supports custom profile session directory resolution', async () => {
    const customProjectDir = path.join(tempBase, 'custom-profile-project');
    await fs.mkdir(customProjectDir, { recursive: true });
    const canonical = await fs.realpath(customProjectDir);

    const profileName = 'my-custom-profile';
    const profileSessDir = getProfileSessionDir(profileName, canonical);
    await fs.mkdir(profileSessDir, { recursive: true });

    const sessFile = path.join(profileSessDir, 'custom-sess.jsonl');
    await fs.writeFile(
      sessFile,
      JSON.stringify({ type: 'session', id: 'prof-01', timestamp: '2026-09-04T14:00:00.000Z', title: 'Profile Work' }),
      'utf-8'
    );

    const sessions = await indexProjectSessions('proj-prof', customProjectDir, profileName);
    assert.equal(sessions.length, 1, 'Should find session under custom profile dir');
    assert.equal(sessions[0].id, 'prof-01');
    assert.equal(sessions[0].title, 'Profile Work');
  });

  // Test 5: Performance benchmark (50 sessions < 100ms)
  await test('Indexes 50 sessions in under 100ms', async () => {
    const perfProjectDir = path.join(tempBase, 'perf-project');
    await fs.mkdir(perfProjectDir, { recursive: true });
    const canonical = await fs.realpath(perfProjectDir);
    const sessionDir = getProfileSessionDir(undefined, canonical);
    await fs.mkdir(sessionDir, { recursive: true });

    const count = 50;
    const writePromises = [];
    for (let i = 0; i < count; i++) {
      const pad = String(i).padStart(3, '0');
      const filePath = path.join(sessionDir, `sess-perf-${pad}.jsonl`);
      const content = [
        JSON.stringify({ type: 'session', id: `perf-${pad}`, timestamp: new Date(1700000000000 + i * 1000).toISOString() }),
        JSON.stringify({ type: 'title', title: `Task ${pad}` }),
      ].join('\n');
      writePromises.push(fs.writeFile(filePath, content, 'utf-8'));
    }
    await Promise.all(writePromises);

    const startTime = performance.now();
    const sessions = await indexProjectSessions('proj-perf', perfProjectDir);
    const elapsed = performance.now() - startTime;

    console.log(`  Indexed ${sessions.length} sessions in ${elapsed.toFixed(2)}ms`);
    assert.equal(sessions.length, 50, 'All 50 sessions should be indexed');
    assert(elapsed < 100, `Expected indexing to take < 100ms, took ${elapsed.toFixed(2)}ms`);
  });

  // Test 6: Malformed / non-jsonl files are safely ignored
  await test('Safely ignores non-jsonl files and corrupt headers', async () => {
    const corruptProjectDir = path.join(tempBase, 'corrupt-project');
    await fs.mkdir(corruptProjectDir, { recursive: true });
    const canonical = await fs.realpath(corruptProjectDir);
    const sessionDir = getProfileSessionDir(undefined, canonical);
    await fs.mkdir(sessionDir, { recursive: true });

    // Non-jsonl file
    await fs.writeFile(path.join(sessionDir, 'readme.txt'), 'Not a session', 'utf-8');
    // Corrupt jsonl with no valid header
    await fs.writeFile(path.join(sessionDir, 'corrupt.jsonl'), 'random garbage text\nnot json', 'utf-8');
    // Valid session
    await fs.writeFile(
      path.join(sessionDir, 'valid.jsonl'),
      JSON.stringify({ type: 'title', title: 'Valid' }) + '\n' +
      JSON.stringify({ type: 'session', id: 'valid-1' }),
      'utf-8'
    );

    const sessions = await indexProjectSessions('proj-corrupt', corruptProjectDir);
    assert.equal(sessions.length, 1, 'Only the valid session should be indexed');
    assert.equal(sessions[0].id, 'valid-1');
  });

} finally {
  if (previousOmpHome !== undefined) {
    process.env.OMP_HOME = previousOmpHome;
  } else {
    delete process.env.OMP_HOME;
  }
  await fs.rm(tempBase, { recursive: true, force: true }).catch(() => {});
}

console.log(`\nAll ${passCount} session indexer tests passed successfully!`);
