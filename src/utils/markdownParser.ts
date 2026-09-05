// Full Markdown parser: GitHub-flavored markdown, KaTeX math, Prism syntax highlighting, Mermaid placeholder and DOMPurify

import { Marked, type MarkedExtension, type Tokens } from 'marked';
import katex, { type KatexOptions } from 'katex';
import Prism from 'prismjs';
import DOMPurify from 'dompurify';
import { tm, type I18nKey } from '../../shared/i18n/index.ts';
// Load popular languages for Prism syntax highlighting
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-jsx.js';
import 'prismjs/components/prism-tsx.js';
import 'prismjs/components/prism-python.js';
import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-yaml.js';
import 'prismjs/components/prism-markdown.js';
import 'prismjs/components/prism-sql.js';
import 'prismjs/components/prism-rust.js';
import 'prismjs/components/prism-go.js';
import 'prismjs/components/prism-c.js';
import 'prismjs/components/prism-cpp.js';
import 'prismjs/components/prism-java.js';
import 'prismjs/components/prism-diff.js';
import 'prismjs/components/prism-docker.js';

// Map alias names to Prism language grammars
const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  javascript: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  jsx: 'jsx',
  tsx: 'tsx',
  py: 'python',
  python: 'python',
  sh: 'bash',
  bash: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  markdown: 'markdown',
  json: 'json',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  css: 'css',
  sql: 'sql',
  rust: 'rust',
  rs: 'rust',
  go: 'go',
  golang: 'go',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  java: 'java',
  diff: 'diff',
  dockerfile: 'docker',
  docker: 'docker',
};

// Safe HTML escaping
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Highlight code with Prism or fallback to escaped text
export function highlightCode(code: string, rawLang: string): string {
  const normalized = (rawLang || 'text').trim().toLowerCase();
  const targetLang = LANGUAGE_ALIASES[normalized] || normalized;

  if (targetLang && Prism.languages[targetLang]) {
    try {
      return Prism.highlight(code, Prism.languages[targetLang], targetLang);
    } catch {
      return escapeHtml(code);
    }
  }

  return escapeHtml(code);
}

interface KatexToken extends Tokens.Generic {
  type: 'inlineKatex' | 'blockKatex';
  text: string;
  displayMode: boolean;
}

// Built-in resilient KaTeX extension for Marked
export function createKatexExtension(options: KatexOptions = { throwOnError: false }): MarkedExtension {
  const inlineRule = /^(\$)(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n\$]))\1/;
  const blockRule = /^\$\$\n?([\s\S]*?)\n?\$\$/;

  return {
    extensions: [
      {
        name: 'inlineKatex',
        level: 'inline',
        start(src: string) {
          let index = src.indexOf('$');
          while (index !== -1) {
            if (index === 0 || src.charAt(index - 1) !== '$') {
              const sub = src.substring(index);
              if (sub.match(inlineRule)) {
                return index;
              }
            }
            index = src.indexOf('$', index + 1);
          }
          return -1;
        },
        tokenizer(src: string) {
          const match = src.match(inlineRule);
          if (match) {
            return {
              type: 'inlineKatex',
              raw: match[0],
              text: match[2].trim(),
              displayMode: false,
            };
          }
          return undefined;
        },
        renderer(token: Tokens.Generic) {
          const kToken = token as KatexToken;
          try {
            return katex.renderToString(kToken.text, {
              ...options,
              displayMode: false,
            });
          } catch {
            return escapeHtml(kToken.text);
          }
        },
      },
      {
        name: 'blockKatex',
        level: 'block',
        tokenizer(src: string) {
          const match = src.match(blockRule);
          if (match) {
            return {
              type: 'blockKatex',
              raw: match[0],
              text: match[1].trim(),
              displayMode: true,
            };
          }
          return undefined;
        },
        renderer(token: Tokens.Generic) {
          const kToken = token as KatexToken;
          try {
            const rendered = katex.renderToString(kToken.text, {
              ...options,
              displayMode: true,
            });
            return `<div class="katex-block my-3 text-center overflow-x-auto py-1">${rendered}</div>`;
          } catch {
            return `<div class="katex-block my-3 text-center overflow-x-auto py-1 text-rose-500">${escapeHtml(kToken.text)}</div>`;
          }
        },
      },
    ],
  };
}

// Create Marked instance with KaTeX, syntax highlighting, and custom renderers
export function createMarkedInstance(translateFn?: (key: I18nKey) => string): Marked {
  const t = translateFn || tm;
  const marked = new Marked({
    gfm: true,
    breaks: true,
    tokenizer: {
      code() {
        return undefined;
      },
    },
    renderer: {
      heading({ text, depth }) {
        const headingStyles: Record<number, string> = {
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
        const language = (lang || 'text').trim();
        const lowerLang = language.toLowerCase();

        // Mermaid Diagram block: emit container for client-side SVG rendering
        if (lowerLang === 'mermaid') {
          const escaped = escapeHtml(text);
          return `<div class="mermaid-block-wrapper group relative my-3 rounded-xl border border-border bg-[#f6f8fa] dark:bg-[#14161d] overflow-hidden shadow-xs">
            <div class="flex items-center justify-between px-3.5 py-1.5 bg-slate-100 dark:bg-[#1a1d26] border-b border-border text-[11px] font-mono text-slate-500 dark:text-zinc-400">
              <div class="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-[10px] text-purple-600 dark:text-purple-400">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="8" x="2" y="2" rx="1"/><rect width="8" height="8" x="14" y="2" rx="1"/><rect width="8" height="8" x="8" y="14" rx="1"/><line x1="6" y1="10" x2="6" y2="12"/><line x1="18" y1="10" x2="18" y2="12"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="12" y1="12" x2="12" y2="14"/></svg>
                <span>MERMAID</span>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" class="view-mermaid-source-btn text-[11px] text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 px-2 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer" title="${t('markdown.mermaid.viewCode')}">
                  ${t('markdown.mermaid.code')}
                </button>
                <button type="button" class="copy-code-btn flex items-center gap-1 text-[11px] text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 px-2 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer" data-code="${encodeURIComponent(text)}">
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                  <span class="copy-text">${t('markdown.copy')}</span>
                </button>
              </div>
            </div>
            <div class="mermaid-viewport relative overflow-hidden bg-white dark:bg-[#0f1117] min-h-[160px] flex items-center justify-center select-none cursor-grab active:cursor-grabbing">
              <div class="mermaid-controls absolute top-2.5 right-2.5 z-10 flex items-center gap-0.5 p-1 rounded-lg bg-surface/90 dark:bg-[#161822]/90 backdrop-blur-md border border-border shadow-xs opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 pointer-events-auto">
                <button type="button" class="mermaid-zoom-out-btn p-1.5 rounded hover:bg-surface-highlight text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition-colors cursor-pointer" title="${t('markdown.mermaid.zoomOut')}">
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                </button>
                <button type="button" class="mermaid-zoom-in-btn p-1.5 rounded hover:bg-surface-highlight text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition-colors cursor-pointer" title="${t('markdown.mermaid.zoomIn')}">
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                </button>
                <button type="button" class="mermaid-reset-btn p-1.5 rounded hover:bg-surface-highlight text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition-colors cursor-pointer" title="${t('markdown.mermaid.reset')}">
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
                </button>
              </div>
              <div class="mermaid-diagram-container w-full h-full p-6 flex justify-center items-center transform-gpu origin-center transition-transform duration-75" data-mermaid="${encodeURIComponent(text)}" data-scale="1" data-pan-x="0" data-pan-y="0">
                <div class="mermaid-loading flex items-center gap-2 text-xs text-slate-400 animate-pulse">
                  <span>${t('markdown.mermaid.loading')}</span>
                </div>
              </div>
            </div>
            <pre class="mermaid-source-code hidden p-3.5 overflow-x-auto text-[12.5px] leading-relaxed font-mono text-slate-800 dark:text-zinc-200 bg-[#f8fafc]/70 dark:bg-[#0f1117] m-0 border-t border-border"><code class="language-mermaid">${escaped}</code></pre>
          </div>`;
        }

        // Standard Code block: Prism syntax highlighting
        const highlighted = highlightCode(text, language);

        return `<div class="code-block-wrapper my-3 rounded-xl overflow-hidden border border-border bg-[#f6f8fa] dark:bg-[#14161d] shadow-xs">
          <div class="flex items-center justify-between px-3.5 py-1.5 bg-slate-100 dark:bg-[#1a1d26] border-b border-border text-[11px] font-mono text-slate-500 dark:text-zinc-400">
            <span class="font-semibold uppercase tracking-wider text-[10px] text-slate-600 dark:text-zinc-300">${language}</span>
            <button type="button" class="copy-code-btn flex items-center gap-1 text-[11px] text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 px-2 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer" data-code="${encodeURIComponent(text)}">
              <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              <span class="copy-text">${t('markdown.copy')}</span>
            </button>
          </div>
          <pre class="p-3.5 overflow-x-auto text-[12.5px] leading-relaxed font-mono text-slate-800 dark:text-zinc-200 bg-[#f8fafc]/70 dark:bg-[#0f1117] m-0 border-0 rounded-none"><code class="language-${language}">${highlighted}</code></pre>
        </div>`;
      },

      codespan({ text }) {
        return `<code class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800/80 text-slate-800 dark:text-zinc-200 font-mono text-[12px] border border-slate-200/80 dark:border-zinc-700/60 font-medium break-all [overflow-wrap:anywhere] whitespace-normal">${text}</code>`;
      },

      checkbox({ checked }) {
        const checkedAttr = checked ? 'checked="" ' : '';
        return `<input type="checkbox" ${checkedAttr}disabled="" class="task-list-item-checkbox mr-2 rounded border-border text-blue-600 focus:ring-0 align-middle pointer-events-none" />`;
      },

      link({ href, title, text }) {
        const titleAttr = title ? `title="${title}"` : `title="${t('markdown.openInSidebarBrowser')}"`;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline font-medium transition-colors inline-flex items-center gap-0.5 cursor-pointer" ${titleAttr}><span>${text}</span><svg class="w-3 h-3 inline opacity-60 ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`;
      },

      blockquote({ text }) {
        const clean = text.trim();
        const alertMatch = clean.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*\n)?\s*([\s\S]*)$/i);
        if (alertMatch) {
          const type = alertMatch[1].toUpperCase();
          const body = alertMatch[2];
          const alertConfig: Record<string, { border: string; bg: string; titleCls: string; title: string }> = {
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

      table(token) {
        let headerHtml = '';
        if (token.header && Array.isArray(token.header)) {
          for (let i = 0; i < token.header.length; i++) {
            headerHtml += this.tablecell(token.header[i]);
          }
        }
        headerHtml = `<thead class="bg-surface-highlight font-semibold text-slate-900 dark:text-zinc-100">${this.tablerow({ text: headerHtml })}</thead>`;

        let bodyHtml = '';
        if (token.rows && Array.isArray(token.rows)) {
          for (let i = 0; i < token.rows.length; i++) {
            let rowHtml = '';
            for (let j = 0; j < token.rows[i].length; j++) {
              rowHtml += this.tablecell(token.rows[i][j]);
            }
            bodyHtml += this.tablerow({ text: rowHtml });
          }
        }
        bodyHtml = `<tbody class="divide-y divide-border bg-transparent">${bodyHtml}</tbody>`;

        return `<div class="overflow-x-auto my-3"><table class="min-w-full text-xs text-left border border-border border-collapse">${headerHtml}${bodyHtml}</table></div>`;
      },

      tablerow(token) {
        return `<tr class="hover:bg-surface-highlight/40 transition-colors">${token.text}</tr>`;
      },

      tablecell(token) {
        const tag = token.header ? 'th' : 'td';
        const alignCls = token.align ? ` text-${token.align}` : '';
        const padCls = token.header
          ? 'px-3.5 py-2.5 font-semibold text-slate-900 dark:text-zinc-100 border border-border'
          : 'px-3.5 py-2 text-slate-700 dark:text-zinc-300 border border-border';
        const content = token.tokens ? this.parser.parseInline(token.tokens) : (token.text || '');
        return `<${tag} class="${padCls}${alignCls}">${content}</${tag}>`;
      },

      hr() {
        return `<hr class="my-4 border-t border-border" />`;
      },
    },
  });

  marked.use(createKatexExtension({ throwOnError: false }));

  return marked;
}

// Shared marked instance
export const defaultMarkedInstance = createMarkedInstance();

// DOMPurify whitelist config for KaTeX, SVG, and HTML elements
const SANITIZE_CONFIG = {
  USE_PROFILES: { html: true, mathMl: true, svg: true },
  ADD_TAGS: [
    'semantics',
    'annotation',
    'annotation-xml',
    'math',
    'mrow',
    'mi',
    'mo',
    'mn',
    'msup',
    'msub',
    'mfrac',
    'mtable',
    'mtr',
    'mtd',
    'mtext',
    'mspace',
    'mover',
    'munder',
    'munderover',
    'msqrt',
    'mroot',
    'svg',
    'g',
    'path',
    'rect',
    'circle',
    'line',
    'polyline',
    'polygon',
    'text',
    'foreignobject',
    'foreignObject',
  ],
  ADD_ATTR: [
    'target',
    'rel',
    'data-code',
    'data-mermaid',
    'xmlns',
    'display',
    'aria-hidden',
    'viewBox',
    'd',
    'fill',
    'stroke',
    'stroke-width',
    'dominant-baseline',
    'text-anchor',
  ],
  HTML_INTEGRATION_POINTS: {
    foreignobject: true,
  },
};
// Sanitize HTML output to prevent XSS attacks while preserving KaTeX & SVG
export function sanitizeMarkdownHtml(html: string): string {
  if (!html) return '';

  if (typeof DOMPurify.sanitize === 'function') {
    return DOMPurify.sanitize(html, SANITIZE_CONFIG);
  }

  if (typeof window !== 'undefined') {
    try {
      const purifier = DOMPurify(window);
      return purifier.sanitize(html, SANITIZE_CONFIG);
    } catch {
      return html;
    }
  }

  return html;
}

// Parse markdown to sanitized HTML string
export interface ParseMarkdownOptions {
  sanitize?: boolean;
  t?: (key: I18nKey) => string;
}

// Parse markdown to safe sanitized HTML string
export function parseMarkdown(content: string, options?: ParseMarkdownOptions | boolean): string {
  if (!content) return '';
  const sanitize = typeof options === 'boolean' ? options : (options?.sanitize ?? true);
  const translateFn = typeof options === 'object' ? options.t : undefined;
  try {
    const parser = translateFn ? createMarkedInstance(translateFn) : defaultMarkedInstance;
    const rawHtml = parser.parse(content) as string;
    return sanitize ? sanitizeMarkdownHtml(rawHtml) : rawHtml;
  } catch {
    return escapeHtml(content);
  }
}
