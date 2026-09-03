/**
 * Verification Script: MarkdownRenderer & Rich Preview Formatting
 * 
 * Verifies that assistant responses and artifacts preview rich Markdown:
 * 1. Headings (H1 - H6) rendered with appropriate typography tags and classes.
 * 2. Bold, Italic, and Strikethrough formatted properly.
 * 3. Fenced code blocks rendered with language badge, copy button, and Prism syntax highlighting.
 * 4. GitHub-style alerts ([!NOTE], [!TIP], etc.) styled with distinctive callout boxes.
 * 5. User screenshot sample text renders with clean nested hierarchy instead of raw markdown text.
 * 6. Tables rendered with headers, cells, and border structure (fixing [object Object] bug).
 * 7. KaTeX Math equations (Inline $E = mc^2$ and Block $$\int_0^1 x dx$$).
 * 8. Mermaid Diagrams (Emits .mermaid-block-wrapper, container, toggle button, and encoded source).
 * 9. GFM Task List checkboxes (- [ ] and - [x]).
 */

import { parseMarkdown, defaultMarkedInstance } from '../src/utils/markdownParser.ts';

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

console.log('=== Starting MarkdownRenderer Verification Suite ===\n');

// ----------------------------------------------------
// Test 1: Headings rendering
// ----------------------------------------------------
console.log('[Test 1] Headings Typography & Classes');
{
  const html = defaultMarkedInstance.parse('# Heading 1\n## Heading 2\n### Heading 3');
  assert(html.includes('<h1 class="text-lg font-bold'), 'H1 rendered with text-lg font-bold');
  assert(html.includes('<h2 class="text-base font-bold'), 'H2 rendered with text-base font-bold');
  assert(html.includes('<h3 class="text-[14px] font-semibold'), 'H3 rendered with text-[14px] font-semibold');
}
console.log();

// ----------------------------------------------------
// Test 2: Inline Code, Bold & Formatting
// ----------------------------------------------------
console.log('[Test 2] Inline Code, Bold & Formatting');
{
  const html = defaultMarkedInstance.parse('Here is `inline-code` and **bold text** with *italic*.');
  assert(html.includes('<code class="px-1.5 py-0.5 rounded bg-rose-500/10'), 'Inline code has styled background & border');
  assert(html.includes('<strong>bold text</strong>'), 'Bold text rendered as <strong>');
  assert(html.includes('<em>italic</em>'), 'Italic text rendered as <em>');
}
console.log();

// ----------------------------------------------------
// Test 3: Fenced Code Blocks with Language, Copy & Prism Highlighting
// ----------------------------------------------------
console.log('[Test 3] Fenced Code Blocks with Header, Copy Button & Prism Highlighting');
{
  const codeSample = '```typescript\ninterface Config {\n  port: number;\n}\n```';
  const html = defaultMarkedInstance.parse(codeSample);
  assert(html.includes('class="code-block-wrapper'), 'Contains code-block-wrapper container');
  assert(html.includes('typescript'), 'Displays language badge: typescript');
  assert(html.includes('class="copy-code-btn'), 'Contains copy code button');
  assert(html.includes('data-code="interface%20Config'), 'Button encodes code payload');
  assert(html.includes('<code class="language-typescript">'), 'Pre block contains language class');
  assert(html.includes('token keyword">interface</span>'), 'Prism highlights keyword "interface"');
  assert(html.includes('token builtin">number</span>'), 'Prism highlights builtin type "number"');
}
console.log();

// ----------------------------------------------------
// Test 4: GitHub-Style Alerts
// ----------------------------------------------------
console.log('[Test 4] GitHub-Style Callout Alerts');
{
  const alertSample = '> [!TIP]\n> Always verify live tests before shipping.';
  const html = defaultMarkedInstance.parse(alertSample);
  assert(html.includes('border-emerald-500') && html.includes('Tip'), 'Tip alert rendered with emerald callout');
}
console.log();

// ----------------------------------------------------
// Test 5: User Screenshot Exact Sample (Complex Nested Lists & Code)
// ----------------------------------------------------
console.log('[Test 5] User Screenshot Sample Text Rendering');
{
  const screenshotSample = `Đã chuyển layout hiển thị giá trị metric và badge từ 1 hàng sang 2 hàng riêng biệt:

### Thay đổi đã thực hiện:
1. **\`admin-ui/src/components/dashboard/dashboard-metrics-grid.tsx\`**:
  - Thay thế \`flex items-baseline justify-between gap-2\` bằng container \`space-y-1.5\`.
  - Giá trị số (\`m.value\`) nằm ở hàng trên, có \`truncate\` và toàn bộ chiều rộng thẻ để hiển thị số lớn (hàng triệu/tỷ tokens) mà không bị ép co lại.
  - Badge trạng thái (\`m.badge\`) nằm ở hàng dưới với \`inline-block\`, không còn bị tràn khỏi viền card.

2. **\`admin-ui/src/pages/dashboard-overview-page.tsx\`**:
  - Điều chỉnh chiều cao skeleton loader từ \`h-28\` thành \`h-36\` để khớp với kích thước card mới.`;

  const html = defaultMarkedInstance.parse(screenshotSample);

  // Assert it does NOT contain unparsed markdown hashes or raw backtick-asterisk chains
  assert(html.includes('<h3 class="text-[14px] font-semibold text-slate-800 dark:text-zinc-200 mt-3 mb-1 first:mt-0">Thay đổi đã thực hiện:</h3>'), 'Header "### Thay đổi đã thực hiện:" parsed to <h3>');
  assert(html.includes('<ol>'), 'Ordered list opened');
  assert(html.includes('<li><strong><code class="px-1.5 py-0.5 rounded'), 'List items have bold code badges');
  assert(html.includes('<ul>'), 'Nested bullet list opened');
  assert(html.includes('<li>Thay thế <code class="px-1.5 py-0.5 rounded'), 'Nested item 1 formatted with code tag');
  assert(html.includes('<li>Giá trị số (<code class="px-1.5 py-0.5 rounded'), 'Nested item 2 formatted with code tag');
  assert(html.includes('<li>Badge trạng thái (<code class="px-1.5 py-0.5 rounded'), 'Nested item 3 formatted with code tag');
  assert(html.includes('<ol start="2">'), 'Second ordered item parsed');
}
console.log();

// ----------------------------------------------------
// Test 6: Tech Stack Table Rendering (No [object Object] Bug)
// ----------------------------------------------------
console.log('[Test 6] Tech Stack Table Rendering');
{
  const tableSample = `## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js >= 20 |
| Language | TypeScript (ES2022) |
| HTTP Framework | Fastify 5 |
| Database | SQLite (better-sqlite3, WAL mode) |
| Validation | Zod |
| Logging | Pino + pino-pretty |
| Auth | google-auth-library, OAuth 2.0 + PKCE |
| Bundler | tsup |
| Testing | Vitest (80% coverage threshold) |
| Frontend | React 19, React Router 7, Tailwind CSS 4, Vite 5 |
| Deployment | PM2, Nginx |`;

  const html = defaultMarkedInstance.parse(tableSample);
  assert(!html.includes('[object Object]'), 'Output does NOT contain [object Object]');
  assert(html.includes('<table class="min-w-full text-xs text-left border border-border border-collapse">'), 'Table rendered with table tag and border-border');
  assert(html.includes('<th class="px-3.5 py-2.5 font-semibold text-slate-900 dark:text-zinc-100 border border-border">Layer</th>'), 'Header cell Layer rendered');
  assert(html.includes('<th class="px-3.5 py-2.5 font-semibold text-slate-900 dark:text-zinc-100 border border-border">Technology</th>'), 'Header cell Technology rendered');
  assert(html.includes('<td class="px-3.5 py-2 text-slate-700 dark:text-zinc-300 border border-border">Runtime</td>'), 'Data cell Runtime rendered');
  assert(html.includes('<td class="px-3.5 py-2 text-slate-700 dark:text-zinc-300 border border-border">Node.js &gt;= 20</td>'), 'Data cell Node.js >= 20 rendered');
  assert(html.includes('<td class="px-3.5 py-2 text-slate-700 dark:text-zinc-300 border border-border">Fastify 5</td>'), 'Data cell Fastify 5 rendered');
  assert(html.includes('<td class="px-3.5 py-2 text-slate-700 dark:text-zinc-300 border border-border">SQLite (better-sqlite3, WAL mode)</td>'), 'Data cell SQLite rendered');
}
console.log();

// ----------------------------------------------------
// Test 7: KaTeX Math Equations (Inline & Block)
// ----------------------------------------------------
console.log('[Test 7] KaTeX Math Equations');
{
  const mathSample = `Phương trình năng lượng: $E = mc^2$ và tích phân Gaussian:

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$`;

  const html = parseMarkdown(mathSample, false);
  assert(html.includes('class="katex"'), 'Inline equation renders with katex class');
  assert(html.includes('<math xmlns="http://www.w3.org/1998/Math/MathML">'), 'Equation includes MathML accessibility markup');
  assert(html.includes('class="katex-block'), 'Block equation rendered inside .katex-block container');
  assert(html.includes('class="katex-html"'), 'Equation includes HTML display markup');
}
console.log();

// ----------------------------------------------------
// Test 8: Mermaid Diagrams
// ----------------------------------------------------
console.log('[Test 8] Mermaid Diagrams');
{
  const mermaidSample = `\`\`\`mermaid
flowchart TD
    Start --> Stop
\`\`\``;

  const html = parseMarkdown(mermaidSample, false);
  assert(html.includes('class="mermaid-block-wrapper'), 'Mermaid block has wrapper container');
  assert(html.includes('class="mermaid-diagram-container'), 'Mermaid diagram container present');
  assert(html.includes('data-mermaid="flowchart%20TD'), 'Container encodes raw diagram source for client render');
  assert(html.includes('class="view-mermaid-source-btn'), 'Toggle source code button present');
  assert(html.includes('class="mermaid-source-code hidden'), 'Source code initially hidden');
}
console.log();

// ----------------------------------------------------
// Test 9: GFM Task Lists Checkboxes
// ----------------------------------------------------
console.log('[Test 9] GFM Task List Checkboxes');
{
  const taskSample = `- [ ] Task cần làm\n- [x] Task đã hoàn thành`;
  const html = parseMarkdown(taskSample, false);
  assert(html.includes('type="checkbox"'), 'Task list contains checkbox inputs');
  assert(html.includes('class="task-list-item-checkbox'), 'Checkbox styled with task-list-item-checkbox');
  assert(html.includes('checked=""'), 'Completed task has checked attribute');
}
console.log();
// ----------------------------------------------------
// Test 10: Localization of Markdown Buttons & Labels
// ----------------------------------------------------
console.log('[Test 10] Localization of Markdown Buttons & Labels');
{
  const sample = '```mermaid\ngraph TD\nA-->B\n```\n\n```ts\nconst x = 1;\n```';
  const mockViT = (key) => {
    if (key === 'markdown.mermaid.viewCode') return 'Xem mã nguồn';
    if (key === 'markdown.mermaid.code') return 'Mã nguồn';
    if (key === 'markdown.copy') return 'Sao chép';
    if (key === 'markdown.mermaid.loading') return 'Đang tải sơ đồ...';
    return key;
  };
  const viHtml = parseMarkdown(sample, { t: mockViT, sanitize: false });
  assert(viHtml.includes('title="Xem mã nguồn"'), 'Mermaid view code button localized');
  assert(viHtml.includes('Mã nguồn'), 'Mermaid code label localized');
  assert(viHtml.includes('Đang tải sơ đồ...'), 'Mermaid loading text localized');
  assert(viHtml.includes('Sao chép'), 'Copy code button text localized');

  const defaultHtml = parseMarkdown(sample, { sanitize: false });
  assert(defaultHtml.includes('class="copy-code-btn'), 'Default render includes copy button');
}
console.log();

// Summary
console.log('====================================================');
console.log(`MarkdownRenderer Verification: ${passed} passed, ${failed} failed.`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
}
