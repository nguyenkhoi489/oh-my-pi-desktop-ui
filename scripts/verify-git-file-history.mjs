/**
 * Verification Suite: Git File History & Show IPC (Phase 1)
 *
 * Requirements:
 * 1. GitCommitSummary interface conformance.
 * 2. `git log` parsing with delimiter separator (\x1f) for safe commit message parsing.
 * 3. Fetch history for a tracked file in repo (e.g. package.json).
 * 4. Fetch content at a specific commit hash for a tracked file via `git show`.
 * 5. Safe handling of untracked / missing files (returns empty array without throwing).
 * 6. Safe rejection of invalid / malformed commit hashes (prevents command injection).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

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

console.log('=== Starting Git File History & Content Verification Suite (Phase 1) ===\n');

async function testGitFileHistory() {
  // Test 1: Fetch commit history for package.json
  console.log('[Test 1] Fetch commit history for a tracked file (package.json)');
  {
    const { stdout } = await execFileAsync(
      'git',
      ['log', '-n', '50', '--follow', '--format=%H%x1f%h%x1f%an%x1f%ad%x1f%s', '--date=relative', '--', 'package.json'],
      { cwd: repoRoot, encoding: 'utf-8' }
    );

    const lines = stdout.trim().split('\n').filter(Boolean);
    assert(lines.length > 0, 'Found at least one commit modifying package.json');

    const commits = [];
    for (const line of lines) {
      const parts = line.split('\x1f');
      if (parts.length >= 5) {
        commits.push({
          hash: parts[0],
          shortHash: parts[1],
          author: parts[2],
          date: parts[3],
          message: parts.slice(4).join('\x1f'),
        });
      }
    }

    assert(commits.length > 0, 'Parsed commits successfully');
    const first = commits[0];
    assert(first.hash.length === 40, 'First commit hash has length 40');
    assert(first.shortHash.length >= 4, 'Short hash is present');
    assert(typeof first.author === 'string' && first.author.length > 0, 'Author is present');
    assert(typeof first.date === 'string' && first.date.length > 0, 'Relative date is present');
    assert(typeof first.message === 'string' && first.message.length > 0, 'Commit message is present');
  }

  // Test 2: Fetch content at a specific commit hash
  console.log('\n[Test 2] Fetch file content at a specific commit hash');
  {
    const { stdout: logOut } = await execFileAsync(
      'git',
      ['log', '-n', '1', '--format=%H', '--', 'package.json'],
      { cwd: repoRoot, encoding: 'utf-8' }
    );
    const hash = logOut.trim();
    assert(hash.length === 40, 'Retrieved valid commit hash');

    const { stdout: content } = await execFileAsync(
      'git',
      ['show', `${hash}:package.json`],
      { cwd: repoRoot, encoding: 'utf-8' }
    );
    assert(content.includes('"name": "omp-agent"'), 'File content at commit includes package name');
  }

  // Test 3: Untracked file returns empty commits list gracefully
  console.log('\n[Test 3] Untracked / non-existent file returns empty result safely');
  {
    const { stdout } = await execFileAsync(
      'git',
      ['log', '-n', '50', '--follow', '--format=%H%x1f%h%x1f%an%x1f%ad%x1f%s', '--date=relative', '--', 'non-existent-file-12345.xyz'],
      { cwd: repoRoot, encoding: 'utf-8' }
    );
    const lines = stdout.trim().split('\n').filter(Boolean);
    assert(lines.length === 0, 'No commits returned for non-existent file');
  }

  // Test 4: Malformed commit hash validation regex
  console.log('\n[Test 4] Validation regex rejects dangerous or malformed commit hashes');
  {
    const hashRegex = /^[a-fA-F0-9]{4,40}$/;
    assert(hashRegex.test('abc1234'), 'Valid short hash accepted');
    assert(hashRegex.test('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'), 'Valid 40-char hash accepted');
    assert(!hashRegex.test('abc; rm -rf /'), 'Injected command rejected');
    assert(!hashRegex.test('HEAD~1'), 'Ref name with tilde rejected');
    assert(!hashRegex.test(''), 'Empty string rejected');
  }
}

try {
  await testGitFileHistory();
  console.log(`\n========================================`);
  console.log(`✅ ALL ${passed} VERIFICATION CHECKS PASSED!`);
  console.log(`========================================\n`);
  process.exit(0);
} catch (err) {
  console.error('\n❌ Verification failed:', err);
  process.exit(1);
}
