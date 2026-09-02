import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  extractShareUrl,
  shareSession,
  joinCollabSession,
} from '../electron/collab-share.ts';

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

console.log('=== Running verify-share-join.mjs ===');

// Test 1: extractShareUrl
test('extractShareUrl extracts clean links from CLI output', () => {
  assert.strictEqual(
    extractShareUrl('Session shared: https://share.oh-my-pi.dev/sess_abc123#key-xyz!'),
    'https://share.oh-my-pi.dev/sess_abc123#key-xyz'
  );

  assert.strictEqual(
    extractShareUrl('Uploaded to Gist: https://gist.github.com/user/123456789.'),
    'https://gist.github.com/user/123456789'
  );

  assert.strictEqual(extractShareUrl('No url here'), null);
  assert.strictEqual(extractShareUrl(''), null);
});

// Test 2: shareSession validation & mock execution
const tmpDir = path.join(os.tmpdir(), `omp-test-collab-${Date.now()}`);
fs.mkdirSync(tmpDir, { recursive: true });

try {
  const mockShareScript = path.join(tmpDir, 'mock-omp.cjs');
  fs.writeFileSync(
    mockShareScript,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'share') {
  const isGist = args.includes('--gist');
  const sess = args[1];
  if (isGist) {
    console.log('Gist created: https://gist.github.com/mock/' + sess);
  } else {
    console.log('Session shared at: https://share.omp.dev/' + sess + '#key123');
  }
  process.exit(0);
} else if (args[0] === 'join') {
  const link = args[1];
  if (link.includes('invalid')) {
    console.error('Error: invalid collab link');
    process.exit(1);
  }
  console.log('Successfully joined session from ' + link);
  process.exit(0);
}
`,
    { mode: 0o755 }
  );

  // Test 3: shareSession with standard link
  await asyncTest('shareSession executes and parses share url', async () => {
    const res = await shareSession(mockShareScript, 'sess-456');
    assert.strictEqual(res.success, true);
    assert(res.url && res.url.includes('https://share.omp.dev/'));
    assert.strictEqual(res.url, 'https://share.omp.dev/sess-456#key123');
  });

  // Test 4: shareSession with gist flag
  await asyncTest('shareSession passes --gist flag and extracts gist url', async () => {
    const res = await shareSession(mockShareScript, 'sess-789', { gist: true });
    assert.strictEqual(res.success, true);
    assert(res.url && res.url.includes('https://gist.github.com/mock/'));
    assert.strictEqual(res.url, 'https://gist.github.com/mock/sess-789');
  });

  // Test 5: shareSession empty identifier validation
  await asyncTest('shareSession rejects empty identifier', async () => {
    const res = await shareSession(mockShareScript, '');
    assert.strictEqual(res.success, false);
    assert(res.error.includes('không được để trống'));
  });

  // Test 6: joinCollabSession execution
  await asyncTest('joinCollabSession executes join command successfully', async () => {
    const res = await joinCollabSession(mockShareScript, 'relay.example.sh/123#key');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.message, 'Đã tham gia session thành công');
  });

  // Test 7: joinCollabSession failure handling
  await asyncTest('joinCollabSession handles join error gracefully', async () => {
    const res = await joinCollabSession(mockShareScript, 'invalid-link');
    assert.strictEqual(res.success, false);
    assert(res.error || res.rawOutput);
  });

  // Test 8: joinCollabSession empty link validation
  await asyncTest('joinCollabSession rejects empty link', async () => {
    const res = await joinCollabSession(mockShareScript, '');
    assert.strictEqual(res.success, false);
    assert(res.error.includes('không được để trống'));
  });

} finally {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}

// Test 9: Preload & Main contract inspection
test('Preload & Main IPC contracts are properly wired', () => {
  const preloadSource = fs.readFileSync(path.resolve('electron/preload.ts'), 'utf8');
  assert(preloadSource.includes('omp:share-session'), 'preload.ts must invoke omp:share-session');
  assert(preloadSource.includes('omp:join-session'), 'preload.ts must invoke omp:join-session');

  const mainSource = fs.readFileSync(path.resolve('electron/main.ts'), 'utf8');
  assert(mainSource.includes('omp:share-session'), 'main.ts must handle omp:share-session');
  assert(mainSource.includes('omp:join-session'), 'main.ts must handle omp:join-session');
});

console.log(`\nAll ${passCount} tests passed successfully!`);
