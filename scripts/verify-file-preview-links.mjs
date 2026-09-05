import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  isLocalFileTarget,
  extractFilePath,
  toFileUrl,
} from '../src/utils/urlHelper.ts';
import { parseMarkdown } from '../src/utils/markdownParser.ts';
import { vi } from '../shared/i18n/vi.ts';
import { en } from '../shared/i18n/en.ts';

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ PASSED: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAILED: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('=== Starting File Preview Links Verification ===\n');

// ----------------------------------------------------
// Test 1: isLocalFileTarget Detection
// ----------------------------------------------------
console.log('[Test 1] isLocalFileTarget detection');
await test('Identifies file:/// URI protocol', () => {
  assert.equal(
    isLocalFileTarget('file:///Users/nguyenkhoi/Data/Web_Project/api-vietnam/docs/AI_CHATBOT_API_CONTRACT.md'),
    true
  );
});

await test('Identifies localhost mistakenly prepended to local file path', () => {
  assert.equal(
    isLocalFileTarget('http://localhost:5173/Users/nguyenkhoi/Data/Web_Project/api-vietnam/docs/AI_CHATBOT_API_CONTRACT.md'),
    true
  );
  assert.equal(
    isLocalFileTarget('http://127.0.0.1:5173/home/user/project/README.md'),
    true
  );
});

await test('Identifies POSIX absolute file path', () => {
  assert.equal(
    isLocalFileTarget('/Users/nguyenkhoi/Data/Web_Project/api-vietnam/docs/AI_CHATBOT_API_CONTRACT.md'),
    true
  );
});

await test('Identifies relative file paths with known extensions', () => {
  assert.equal(isLocalFileTarget('docs/AI_CHATBOT_API_CONTRACT.md'), true);
  assert.equal(isLocalFileTarget('./src/App.tsx'), true);
  assert.equal(isLocalFileTarget('../package.json'), true);
});

await test('Does not falsely identify web URLs as local files', () => {
  assert.equal(isLocalFileTarget('https://github.com'), false);
  assert.equal(isLocalFileTarget('http://localhost:5173'), false);
  assert.equal(isLocalFileTarget('http://localhost:5173/'), false);
  assert.equal(isLocalFileTarget('http://127.0.0.1:8095/widget/demo'), false);
  assert.equal(isLocalFileTarget('mailto:test@example.com'), false);
  assert.equal(isLocalFileTarget('#section-header'), false);
});

// ----------------------------------------------------
// Test 2: extractFilePath and toFileUrl
// ----------------------------------------------------
console.log('\n[Test 2] extractFilePath and toFileUrl normalization');
const TARGET_PATH = '/Users/nguyenkhoi/Data/Web_Project/api-vietnam/docs/AI_CHATBOT_API_CONTRACT.md';

await test('extractFilePath strips file:// prefix', () => {
  assert.equal(extractFilePath(`file://${TARGET_PATH}`), TARGET_PATH);
});

await test('extractFilePath strips http://localhost:5173 prefix from local file path', () => {
  assert.equal(extractFilePath(`http://localhost:5173${TARGET_PATH}`), TARGET_PATH);
});

await test('extractFilePath returns raw path for plain POSIX path', () => {
  assert.equal(extractFilePath(TARGET_PATH), TARGET_PATH);
});

await test('toFileUrl normalizes any local file representation to file:/// format', () => {
  assert.equal(toFileUrl(TARGET_PATH), `file://${TARGET_PATH}`);
  assert.equal(toFileUrl(`http://localhost:5173${TARGET_PATH}`), `file://${TARGET_PATH}`);
  assert.equal(toFileUrl(`file://${TARGET_PATH}`), `file://${TARGET_PATH}`);
});

// ----------------------------------------------------
// Test 3: Markdown Parser Link Rendering
// ----------------------------------------------------
console.log('\n[Test 3] Markdown parser link rendering');
await test('Renders local file path with file:/// href, file icon and editor tooltip', () => {
  const html = parseMarkdown(`[Contract Document](${TARGET_PATH})`);
  assert(html.includes(`href="file://${TARGET_PATH}"`), 'Must format href as file:/// URI');
  assert(html.includes('data-file-path='), 'Must include data-file-path attribute');
  assert(html.includes(vi['markdown.openFileInEditor']), 'Must use editor preview title');
  assert(html.includes('text-blue-500'), 'Must include file icon styling');
});

await test('Renders external web URL with standard external link styling and browser tooltip', () => {
  const html = parseMarkdown('[GitHub](https://github.com)');
  assert(html.includes('href="https://github.com"'), 'Must keep https:// href');
  assert(!html.includes('data-file-path'), 'Web URL must not have data-file-path');
  assert(html.includes(vi['markdown.openInSidebarBrowser']), 'Must use in-app browser title');
});

// ----------------------------------------------------
// Test 4: Source Code Wiring Contracts
// ----------------------------------------------------
console.log('\n[Test 4] Source code wiring contracts');
await test('MarkdownRenderer accepts onOpenFile and gates on href || dataFilePath', () => {
  const src = fs.readFileSync(path.resolve('src/components/Common/MarkdownRenderer.tsx'), 'utf8');
  assert(src.includes('onOpenFile?: (filePath: string) => void;'), 'Props must include onOpenFile');
  assert(src.includes('if (href || dataFilePath)'), 'Must gate on href || dataFilePath');
  assert(src.includes('isLocalFileTarget'), 'Must check isLocalFileTarget');
  assert(src.includes('omp:open-file'), 'Must dispatch omp:open-file custom event');
});

await test('markdownParser.ts configures ALLOWED_URI_REGEXP to preserve file: scheme', () => {
  const src = fs.readFileSync(path.resolve('src/utils/markdownParser.ts'), 'utf8');
  assert(src.includes('ALLOWED_URI_REGEXP'), 'Must define ALLOWED_URI_REGEXP in SANITIZE_CONFIG');
  assert(src.includes('file):'), 'ALLOWED_URI_REGEXP must allow file: scheme');
});

await test('ChatHistory forwards onOpenFile to MarkdownRenderer', () => {
  const src = fs.readFileSync(path.resolve('src/components/AgentPanel/ChatHistory.tsx'), 'utf8');
  assert(src.includes('onOpenFile={onOpenFile}'), 'ChatHistory must pass onOpenFile to MarkdownRenderer');
});

await test('App.tsx normalizes targetPath with extractFilePath in handleOpenFileByPath', () => {
  const src = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
  assert(src.includes('const normalizedPath = extractFilePath(targetPath) || targetPath;'), 'handleOpenFileByPath normalizes targetPath with extractFilePath');
  assert(src.includes('handleOpenFileByPathRef.current(filePath)'), 'handleOpenBrowser redirects files to handleOpenFileByPath');
  assert(src.includes('window.addEventListener(\'omp:open-file\''), 'App.tsx listens to omp:open-file event');
});

await test('ProjectGroupList does not nest button inside button', () => {
  const src = fs.readFileSync(path.resolve('src/components/Sidebar/ProjectGroupList.tsx'), 'utf8');
  assert(!src.includes('<button\n                          key={session.path}'), 'Session rows must not be button elements');
  assert(src.includes('role="button"'), 'Session rows must use role="button"');
});

await test('electron/main.ts intercepts local filesystem paths in setWindowOpenHandler', () => {
  const src = fs.readFileSync(path.resolve('electron/main.ts'), 'utf8');
  assert(src.includes('omp:host-open-request'), 'setWindowOpenHandler emits omp:host-open-request for file links');
});

// ----------------------------------------------------
// Test 5: i18n Key Parity
// ----------------------------------------------------
console.log('\n[Test 5] i18n key parity');
await test('markdown.openFileInEditor registered in vi and en', () => {
  assert(vi['markdown.openFileInEditor'], 'vi dictionary has markdown.openFileInEditor');
  assert(en['markdown.openFileInEditor'], 'en dictionary has markdown.openFileInEditor');
});

console.log(`\n====================================================`);
console.log(`File Preview Links: ${passed} passed, 0 failed.`);
console.log(`====================================================\n`);
