/**
 * Verification Suite: Commit Assistant (Phase 14)
 */

import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  buildCommitArgs,
  parseCommitMessage,
  stripAnsi,
} from '../src/utils/commitMessage.ts';
import {
  isGitDirty,
  CommitAssistantManager,
} from '../electron/commit-assistant.ts';
import { StreamingTaskRunner } from '../electron/streaming-task-runner.ts';
import { vi } from '../shared/i18n/vi.ts';
import { en } from '../shared/i18n/en.ts';

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

console.log('=== Running verify-commit-assistant.mjs ===\n');

const tmpDir = path.join(os.tmpdir(), `omp-test-commit-${Date.now()}`);
fs.mkdirSync(tmpDir, { recursive: true });

try {
  // Test 1: buildCommitArgs
  test('buildCommitArgs constructs correct argv for dry-run and commit options', () => {
    // Dry-run cơ bản
    const args1 = buildCommitArgs({}, true);
    assert.deepStrictEqual(args1, ['commit', '--dry-run']);

    // Commit thật không push
    const args2 = buildCommitArgs({}, false);
    assert.deepStrictEqual(args2, ['commit']);

    // Commit kèm push
    const args3 = buildCommitArgs({ push: true }, false);
    assert.deepStrictEqual(args3, ['commit', '--push']);

    // Dry-run không kèm --push dù push: true
    const args4 = buildCommitArgs({ push: true }, true);
    assert.deepStrictEqual(args4, ['commit', '--dry-run']);

    // Đầy đủ cờ context, model, noChangelog, legacy
    const args5 = buildCommitArgs(
      {
        context: '  fix login bug  ',
        model: 'gpt-5.6-luna',
        noChangelog: true,
        legacy: true,
      },
      true
    );
    assert.deepStrictEqual(args5, [
      'commit',
      '--dry-run',
      '--no-changelog',
      '--legacy',
      '-c',
      'fix login bug',
      '-m',
      'gpt-5.6-luna',
    ]);
  });

  // Test 2: stripAnsi
  test('stripAnsi removes 8-bit, 24-bit color codes and terminal escapes', () => {
    const raw = '\u001b[38;2;255;100;50mHello \u001b[1mWorld\u001b[0m\n\u001b[32mDone\u001b[m';
    assert.strictEqual(stripAnsi(raw), 'Hello World\nDone');
  });

  // Test 3: parseCommitMessage với output thật của omp commit
  test('parseCommitMessage parses standard Generated commit message fixture', () => {
    const fixture = `
● Resolving model...
  └─ GPT-5.6-Luna
● Detecting changelog targets...
  └─ (none found)
● Starting commit agent...
 GitOverview
 ProposeCommit
  ⎿ type: chore
    └ summary: Added a hello-world text artifact
● Proposed commit:

  chore: Added a hello-world text artifact

  - Added a plain-text artifact containing the hello world greeting.
● agent finished (6 messages, 5 tools)

Generated commit message:
chore: Added a hello-world text artifact

- Added a plain-text artifact containing the \`hello world\` greeting.
`;

    const parsed = parseCommitMessage(fixture);
    assert.strictEqual(
      parsed,
      'chore: Added a hello-world text artifact\n\n- Added a plain-text artifact containing the `hello world` greeting.'
    );
  });

  // Test 4: parseCommitMessage với proposed commit fallback và ANSI codes
  test('parseCommitMessage parses Proposed commit marker when Generated marker absent', () => {
    const fixtureWithAnsi = `
\u001b[32m●\u001b[0m Starting commit agent...
● Proposed commit:

  \u001b[1mfix(auth): resolve token refresh loop\u001b[0m

  - Handled 401 response with exponential backoff
● agent finished
`;
    const parsed = parseCommitMessage(fixtureWithAnsi);
    assert.strictEqual(
      parsed,
      'fix(auth): resolve token refresh loop\n\n- Handled 401 response with exponential backoff'
    );
  });

  // Test 5: parseCommitMessage với legacy format
  test('parseCommitMessage parses legacy deterministic pipeline output', () => {
    const legacyFixture = `
Reading staged changes…
Generating commit message…

Generated commit message:
feat: exported the app constant

- Added the exported \`x\` constant with a value of \`1\`.
`;
    const parsed = parseCommitMessage(legacyFixture);
    assert.strictEqual(
      parsed,
      'feat: exported the app constant\n\n- Added the exported `x` constant with a value of `1`.'
    );
  });

  // Test 5b: parseCommitMessage với split commit plan
  test('parseCommitMessage parses Split commit plan output', () => {
    const splitFixture = `
● Starting commit agent...
● agent finished

Split commit plan (dry run):
Commit 1:
fix(commit): reused proposed message

- Passed message parameter
`;
    const parsed = parseCommitMessage(splitFixture);
    assert(parsed.includes('Commit 1:'), 'Captures commit plan text');
    assert(parsed.includes('fix(commit): reused proposed message'), 'Captures first commit message');
  });

  // Test 6: isGitDirty trên thư mục không phải git
  await asyncTest('isGitDirty returns isGit false on non-git directory', async () => {
    const nonGitDir = path.join(tmpDir, 'non-git-dir');
    fs.mkdirSync(nonGitDir, { recursive: true });

    const status = await isGitDirty(nonGitDir);
    assert.strictEqual(status.isGit, false);
    assert.strictEqual(status.isDirty, false);
  });

  // Test 7: isGitDirty trên git repository sạch và bẩn
  await asyncTest('isGitDirty detects clean vs dirty git repository and branch', async () => {
    const gitRepoDir = path.join(tmpDir, 'test-git-repo');
    fs.mkdirSync(gitRepoDir, { recursive: true });

    execFileSync('git', ['init', '-b', 'main'], { cwd: gitRepoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: gitRepoDir });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: gitRepoDir });

    // Tạo commit ban đầu để có HEAD
    fs.writeFileSync(path.join(gitRepoDir, 'README.md'), '# Test\n');
    execFileSync('git', ['add', 'README.md'], { cwd: gitRepoDir });
    execFileSync('git', ['commit', '-m', 'initial commit'], { cwd: gitRepoDir });

    // Repo hiện tại phải sạch
    const cleanStatus = await isGitDirty(gitRepoDir);
    assert.strictEqual(cleanStatus.isGit, true);
    assert.strictEqual(cleanStatus.isDirty, false);
    assert.strictEqual(cleanStatus.branch, 'main');
    assert.strictEqual(cleanStatus.filesCount, 0);

    // Thêm file mới chưa track -> phải trở thành dirty
    fs.writeFileSync(path.join(gitRepoDir, 'new-file.ts'), 'export const y = 2;\n');
    const dirtyStatus = await isGitDirty(gitRepoDir);
    assert.strictEqual(dirtyStatus.isGit, true);
    assert.strictEqual(dirtyStatus.isDirty, true);
    assert.strictEqual(dirtyStatus.filesCount, 1);
    assert(dirtyStatus.files && dirtyStatus.files[0].includes('new-file.ts'));
  });

  // Test 8: StreamingTaskRunner hỗ trợ đa instance song song
  await asyncTest('StreamingTaskRunner allows multiple independent instances simultaneously', async () => {
    const runner1 = new StreamingTaskRunner('channel-1');
    const runner2 = new StreamingTaskRunner('channel-2');

    const mockScript1 = path.join(tmpDir, 'task1.cjs');
    const mockScript2 = path.join(tmpDir, 'task2.cjs');

    fs.writeFileSync(
      mockScript1,
      'console.log("R1-start"); setTimeout(() => { console.log("R1-end"); process.exit(0); }, 150);\n'
    );
    fs.writeFileSync(
      mockScript2,
      'console.log("R2-start"); setTimeout(() => { console.log("R2-end"); process.exit(0); }, 150);\n'
    );

    const events1 = [];
    const events2 = [];

    const mockWin1 = {
      isDestroyed: () => false,
      webContents: { send: (ch, data) => events1.push({ ch, data }) },
    };
    const mockWin2 = {
      isDestroyed: () => false,
      webContents: { send: (ch, data) => events2.push({ ch, data }) },
    };

    const res1 = runner1.startTask('t1', process.execPath, [mockScript1], mockWin1);
    const res2 = runner2.startTask('t2', process.execPath, [mockScript2], mockWin2);

    assert.strictEqual(res1.success, true, 'Runner 1 starts successfully');
    assert.strictEqual(res2.success, true, 'Runner 2 starts successfully while Runner 1 is running');
    assert.strictEqual(runner1.isRunning, true);
    assert.strictEqual(runner2.isRunning, true);

    // Chờ cả 2 hoàn thành
    await new Promise((resolve) => setTimeout(resolve, 350));

    assert.strictEqual(runner1.isRunning, false);
    assert.strictEqual(runner2.isRunning, false);

    const r1Stdout = events1.filter((e) => e.data.type === 'stdout').map((e) => e.data.text).join('');
    const r2Stdout = events2.filter((e) => e.data.type === 'stdout').map((e) => e.data.text).join('');

    assert(r1Stdout.includes('R1-start') && r1Stdout.includes('R1-end'));
    assert(r2Stdout.includes('R2-start') && r2Stdout.includes('R2-end'));

    runner1.dispose();
    runner2.dispose();
  });

  // Test 9: CommitAssistantManager dry-run & cancel
  await asyncTest('CommitAssistantManager runs task and supports cancel', async () => {
    const manager = new CommitAssistantManager();
    const longScript = path.join(tmpDir, 'long-task.cjs');
    fs.writeFileSync(
      longScript,
      'console.log("Starting..."); setInterval(() => {}, 1000);\n'
    );

    const emitted = [];
    const mockWin = {
      isDestroyed: () => false,
      webContents: { send: (ch, data) => emitted.push({ ch, data }) },
    };

    const runRes = await manager.runCommit(
      process.execPath,
      { dryRun: true, cwd: tmpDir },
      mockWin
    );
    assert.strictEqual(runRes.success, true);
    assert.strictEqual(manager.isRunning, true);

    await new Promise((resolve) => setTimeout(resolve, 80));

    const cancelRes = manager.cancelCommit();
    assert.strictEqual(cancelRes.success, true);

    await new Promise((resolve) => setTimeout(resolve, 150));
    manager.dispose();
  });

  // Test 10: Preload & Main IPC contract check
  test('Preload and Main IPC contract coverage for commit assistant', () => {
    const preloadSource = fs.readFileSync(path.resolve('electron/preload.ts'), 'utf-8');
    const mainSource = fs.readFileSync(path.resolve('electron/main.ts'), 'utf-8');
    const electronTypes = fs.readFileSync(path.resolve('electron/types.ts'), 'utf-8');
    const srcTypes = fs.readFileSync(path.resolve('src/types/index.ts'), 'utf-8');

    // IPC channels in main.ts
    assert(mainSource.includes("'omp:commit-run'"), 'main.ts registers omp:commit-run');
    assert(mainSource.includes("'omp:commit-cancel'"), 'main.ts registers omp:commit-cancel');
    assert(mainSource.includes("'omp:commit-status'"), 'main.ts registers omp:commit-status');

    // Preload functions
    assert(preloadSource.includes('runCommit:'), 'preload.ts exposes runCommit');
    assert(preloadSource.includes('cancelCommit:'), 'preload.ts exposes cancelCommit');
    assert(preloadSource.includes('getCommitStatus:'), 'preload.ts exposes getCommitStatus');
    assert(preloadSource.includes('onCommitOutput:'), 'preload.ts exposes onCommitOutput');

    // Types coverage
    assert(electronTypes.includes('interface CommitRunOptions'), 'electron/types.ts defines CommitRunOptions');
    assert(srcTypes.includes('interface CommitRunOptions'), 'src/types/index.ts defines CommitRunOptions');
    assert(electronTypes.includes('interface GitStatusResult'), 'electron/types.ts defines GitStatusResult');
    assert(srcTypes.includes('interface GitStatusResult'), 'src/types/index.ts defines GitStatusResult');
  });

  // Test 11: UI Components Integration
  test('UI components integration (CanvasContainer, CommitView, App, CommitModal)', () => {
    const canvasContainerSource = fs.readFileSync(path.resolve('src/components/Canvas/CanvasContainer.tsx'), 'utf-8');
    const commitViewSource = fs.readFileSync(path.resolve('src/components/Canvas/CommitView.tsx'), 'utf-8');
    const appSource = fs.readFileSync(path.resolve('src/App.tsx'), 'utf-8');
    const commitModalSource = fs.readFileSync(path.resolve('src/components/Modals/CommitModal.tsx'), 'utf-8');

    assert(canvasContainerSource.includes("onSelectTab('commit')"), 'CanvasContainer has commit tab selection');
    assert(canvasContainerSource.includes('GitCommit'), 'CanvasContainer renders GitCommit icon in tab bar');
    assert(canvasContainerSource.includes('<CommitView'), 'CanvasContainer renders CommitView inside main canvas view');
    assert(commitViewSource.includes('parseCommitMessage'), 'CommitView uses parseCommitMessage');
    assert(commitViewSource.includes('availableModels'), 'CommitView accepts availableModels');
    assert(commitViewSource.includes('editedMessage: messageToCommit || undefined'), 'CommitView reuses generated/edited message to avoid redundant re-scan');
    assert(commitViewSource.includes('m.provider ? `${m.provider}/${m.id}` : m.id'), 'CommitView prefixes provider in model select value');
    assert(appSource.includes('CommitModal'), 'App.tsx imports and renders CommitModal');
    assert(commitModalSource.includes('parseCommitMessage'), 'CommitModal uses parseCommitMessage');
    assert(commitModalSource.includes('availableModels'), 'CommitModal accepts availableModels');
    assert(commitModalSource.includes('editedMessage: messageToCommit || undefined'), 'CommitModal reuses generated/edited message to avoid redundant re-scan');
    assert(commitModalSource.includes('m.provider ? `${m.provider}/${m.id}` : m.id'), 'CommitModal prefixes provider in model select value');
  });

  // Test 12: i18n keys parity
  test('i18n keys for commit assistant exist in both vi and en', () => {
    const requiredKeys = [
      'commitAssistant.openTitle',
      'commitAssistant.modalTitle',
      'commitAssistant.notGitRepo',
      'commitAssistant.cleanWorkingTree',
      'commitAssistant.contextLabel',
      'commitAssistant.contextPlaceholder',
      'commitAssistant.modelLabel',
      'commitAssistant.modelDefault',
      'commitAssistant.pushLabel',
      'commitAssistant.pushDesc',
      'commitAssistant.noChangelogLabel',
      'commitAssistant.noChangelogDesc',
      'commitAssistant.legacyLabel',
      'commitAssistant.legacyDesc',
      'commitAssistant.generateMessage',
      'commitAssistant.generating',
      'commitAssistant.commit',
      'commitAssistant.commitAndPush',
      'commitAssistant.committing',
      'commitAssistant.cancel',
      'commitAssistant.previewLabel',
      'commitAssistant.previewPlaceholder',
      'commitAssistant.aiGeneratedNotice',
      'commitAssistant.editedNotice',
      'commitAssistant.logsTitle',
      'commitAssistant.showLogs',
      'commitAssistant.hideLogs',
      'commitAssistant.success',
      'commitAssistant.error',
      'commitAssistant.dirtyFilesCount',
      'commitAssistant.branch',
    ];

    for (const k of requiredKeys) {
      assert(k in vi, `vi dictionary has key "${k}"`);
      assert(k in en, `en dictionary has key "${k}"`);
    }
  });

  console.log(`\nAll ${passCount} tests passed successfully!`);
} finally {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}
