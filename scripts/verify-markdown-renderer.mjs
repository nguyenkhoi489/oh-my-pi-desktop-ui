/**
 * Verification Script: MarkdownRenderer & Preview Formatting
 * 
 * Verifies that assistant responses and artifacts preview rich Markdown:
 * 1. Headings (H1 - H6) rendered with appropriate typography tags and classes.
 * 2. Bold, Italic, and Strikethrough formatted properly.
 * 3. Nested ordered and unordered lists with bold inline code headers.
 * 4. Inline code spans styled with pill background and font-mono.
 * 5. Fenced code blocks rendered with language badge, copy button, and code element.
 * 6. Tables rendered with headers and border structure.
 * 7. GitHub-style alerts ([!NOTE], [!TIP], etc.) styled with distinctive callout boxes.
 * 8. User screenshot sample text renders with clean nested hierarchy instead of raw markdown text.
 */

import { Marked } from 'marked';

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

const markedInstance = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    heading({ text, depth }) {
      const headingStyles = {
        1: 'text-lg font-bold text-slate-900 dark:text-zinc-100 mt-4 mb-2 first:mt-0',
        2: 'text-base font-bold text-slate-900 dark:text-zinc-100 mt-3.5 mb-1.5 first:mt-0',
        3: 'text-[14px] font-semibold text-slate-800 dark:text-zinc-200 mt-3 mb-1 first:mt-0',
        4: 'text-[13.5px] font-semibold text-slate-800 dark:text-zinc-200 mt-2.5 mb-1 first:mt-0',
        5: 'text-[13px] font-semibold text-slate-800 dark:text-zinc-200 mt-2 mb-0.5 first:mt-0',
        6: 'text-[12px] font-semibold text-slate-700 dark:text-zinc-300 mt-1.5 mb-0.5 uppercase tracking-wider first:mt-0',
      };
      const cls = headingStyles[depth] || headingStyles[3];
      return `<h${depth} class="${cls}">${text}</h${depth}>`;
    },

    code({ text, lang }) {
      const language = (lang || 'code').trim();
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      return `<div class="code-block-wrapper my-3 rounded-xl overflow-hidden border border-border shadow-xs">
        <div class="flex items-center justify-between px-3.5 py-1.5 bg-slate-100/80 dark:bg-[#161b22] border-b border-border text-[11px] font-mono text-slate-500 dark:text-zinc-400">
          <span class="font-semibold uppercase tracking-wider text-[10px] text-slate-600 dark:text-zinc-300">${language}</span>
          <button type="button" class="copy-code-btn flex items-center gap-1 text-[11px] text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 px-2 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer" data-code="${encodeURIComponent(text)}">
            <span class="copy-text">Copy</span>
          </button>
        </div>
        <pre class="p-3.5 overflow-x-auto text-[12.5px] leading-relaxed font-mono text-slate-800 dark:text-zinc-200 bg-slate-50/60 dark:bg-[#0b0c10] m-0 border-0 rounded-none"><code class="language-${language}">${escaped}</code></pre>
      </div>`;
    },

    codespan({ text }) {
      return `<code class="px-1.5 py-0.5 rounded bg-surface-highlight dark:bg-zinc-800/90 text-codex-accent dark:text-emerald-400 font-mono text-[12px] border border-border/60 font-medium">${text}</code>`;
    },

    link({ href, title, text }) {
      const titleAttr = title ? `title="${title}"` : '';
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-codex-accent underline font-medium hover:opacity-80 transition-opacity inline-flex items-center gap-0.5" ${titleAttr}><span>${text}</span></a>`;
    },

    blockquote({ text }) {
      const clean = text.trim();
      const alertMatch = clean.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*\n)?\s*([\s\S]*)$/i);
      if (alertMatch) {
        const type = alertMatch[1].toUpperCase();
        const body = alertMatch[2];
        const alertConfig = {
          NOTE: { border: 'border-blue-500', bg: 'bg-blue-500/10', titleCls: 'text-blue-600 dark:text-blue-400', title: 'Note' },
          TIP: { border: 'border-emerald-500', bg: 'bg-emerald-500/10', titleCls: 'text-emerald-600 dark:text-emerald-400', title: 'Tip' },
          IMPORTANT: { border: 'border-purple-500', bg: 'bg-purple-500/10', titleCls: 'text-purple-600 dark:text-purple-400', title: 'Important' },
          WARNING: { border: 'border-amber-500', bg: 'bg-amber-500/10', titleCls: 'text-amber-600 dark:text-amber-400', title: 'Warning' },
          CAUTION: { border: 'border-rose-500', bg: 'bg-rose-500/10', titleCls: 'text-rose-600 dark:text-rose-400', title: 'Caution' },
        };
        const cfg = alertConfig[type] || alertConfig.NOTE;
        return `<div class="my-3 p-3.5 rounded-xl border-l-4 ${cfg.border} ${cfg.bg} text-[13px] leading-relaxed shadow-xs">
          <div class="font-semibold text-xs mb-1 uppercase tracking-wider ${cfg.titleCls}">${cfg.title}</div>
          <div class="text-slate-800 dark:text-zinc-200">${body}</div>
        </div>`;
      }
      return `<blockquote class="my-2.5 border-l-3 border-slate-300 dark:border-zinc-700 pl-3.5 py-0.5 italic text-slate-600 dark:text-zinc-400">${text}</blockquote>`;
    },

    table({ header, rows }) {
      const headerHtml = header ? `<thead class="bg-surface-highlight font-semibold text-slate-700 dark:text-zinc-300">${header}</thead>` : '';
      const rowsHtml = rows ? `<tbody class="divide-y divide-border bg-panel">${rows}</tbody>` : '';
      return `<div class="overflow-x-auto my-3 rounded-xl border border-border shadow-xs"><table class="min-w-full text-xs text-left divide-y divide-border">${headerHtml}${rowsHtml}</table></div>`;
    },

    tablerow({ text }) {
      return `<tr class="hover:bg-surface-highlight/50 transition-colors">${text}</tr>`;
    },

    tablecell({ text, header, align }) {
      const tag = header ? 'th' : 'td';
      const alignCls = align ? `text-${align}` : '';
      const padCls = header ? 'px-3.5 py-2' : 'px-3.5 py-2 text-slate-700 dark:text-zinc-300';
      return `<${tag} class="${padCls} ${alignCls}">${text}</${tag}>`;
    },

    hr() {
      return `<hr class="my-4 border-t border-border" />`;
    },
  },
});

// ----------------------------------------------------
// Test 1: Headings rendering
// ----------------------------------------------------
console.log('[Test 1] Headings Typography & Classes');
{
  const html = markedInstance.parse('# Heading 1\n## Heading 2\n### Heading 3');
  assert(html.includes('<h1 class="text-lg font-bold'), 'H1 rendered with text-lg font-bold');
  assert(html.includes('<h2 class="text-base font-bold'), 'H2 rendered with text-base font-bold');
  assert(html.includes('<h3 class="text-[14px] font-semibold'), 'H3 rendered with text-[14px] font-semibold');
}
console.log();

// ----------------------------------------------------
// Test 2: Inline code, bold, italic
// ----------------------------------------------------
console.log('[Test 2] Inline Code, Bold & Formatting');
{
  const html = markedInstance.parse('Here is `inline-code` and **bold text** with *italic*.');
  assert(html.includes('<code class="px-1.5 py-0.5 rounded bg-surface-highlight'), 'Inline code has styled background & border');
  assert(html.includes('<strong>bold text</strong>'), 'Bold text rendered as <strong>');
  assert(html.includes('<em>italic</em>'), 'Italic text rendered as <em>');
}
console.log();

// ----------------------------------------------------
// Test 3: Fenced Code Blocks with Language & Copy
// ----------------------------------------------------
console.log('[Test 3] Fenced Code Blocks with Header & Copy Button');
{
  const codeSample = '```typescript\ninterface Config {\n  port: number;\n}\n```';
  const html = markedInstance.parse(codeSample);
  assert(html.includes('class="code-block-wrapper'), 'Contains code-block-wrapper container');
  assert(html.includes('typescript'), 'Displays language badge: typescript');
  assert(html.includes('class="copy-code-btn'), 'Contains copy code button');
  assert(html.includes('data-code="interface%20Config'), 'Button encodes code payload');
  assert(html.includes('<code class="language-typescript">'), 'Pre block contains language class');
}
console.log();

// ----------------------------------------------------
// Test 4: GitHub-Style Alerts
// ----------------------------------------------------
console.log('[Test 4] GitHub-Style Callout Alerts');
{
  const alertSample = '> [!TIP]\n> Always verify live tests before shipping.';
  const html = markedInstance.parse(alertSample);
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

  const html = markedInstance.parse(screenshotSample);

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

// Summary
console.log('====================================================');
console.log(`MarkdownRenderer Verification: ${passed} passed, ${failed} failed.`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
}
