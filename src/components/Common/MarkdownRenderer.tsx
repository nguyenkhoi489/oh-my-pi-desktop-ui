import React, { useMemo, useCallback } from 'react';
import { Marked } from 'marked';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  isStreaming?: boolean;
}

// Instantiate Marked parser with GitHub-flavored markdown and custom renderer
const markedInstance = new Marked({
  gfm: true,
  breaks: true,
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
      const language = (lang || 'code').trim();
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      return `<div class="code-block-wrapper my-3 rounded-xl overflow-hidden border border-border shadow-xs">
        <div class="flex items-center justify-between px-3.5 py-1.5 bg-slate-100/80 dark:bg-[#161b22] border-b border-border text-[11px] font-mono text-slate-500 dark:text-zinc-400">
          <span class="font-semibold uppercase tracking-wider text-[10px] text-slate-600 dark:text-zinc-300">${language}</span>
          <button type="button" class="copy-code-btn flex items-center gap-1 text-[11px] text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 px-2 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer" data-code="${encodeURIComponent(text)}">
            <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
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
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-codex-accent underline font-medium hover:opacity-80 transition-opacity inline-flex items-center gap-0.5" ${titleAttr}><span>${text}</span><svg class="w-3 h-3 inline opacity-60 ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`;
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

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = '',
  isStreaming = false,
}) => {
  const htmlContent = useMemo(() => {
    if (!content) return '';
    try {
      return markedInstance.parse(content) as string;
    } catch {
      return content;
    }
  }, [content]);

  // Delegated click handler for copy-code buttons and external links
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    // Handle Copy Code Button
    const copyBtn = target.closest('.copy-code-btn') as HTMLButtonElement | null;
    if (copyBtn) {
      e.preventDefault();
      e.stopPropagation();
      const rawCode = copyBtn.getAttribute('data-code');
      if (rawCode) {
        const decoded = decodeURIComponent(rawCode);
        navigator.clipboard.writeText(decoded);
        const textSpan = copyBtn.querySelector('.copy-text');
        if (textSpan) {
          textSpan.textContent = 'Copied!';
          copyBtn.classList.add('text-emerald-500');
          setTimeout(() => {
            textSpan.textContent = 'Copy';
            copyBtn.classList.remove('text-emerald-500');
          }, 2000);
        }
      }
      return;
    }

    // Handle External Links
    const anchor = target.closest('a') as HTMLAnchorElement | null;
    if (anchor && anchor.href && anchor.href.startsWith('http')) {
      // Allow browser or electron window to open
    }
  }, []);

  return (
    <div
      onClick={handleClick}
      className={`markdown-content select-text leading-relaxed font-sans ${className}`}
    >
      <div
        dangerouslySetInnerHTML={{ __html: htmlContent }}
        className="inline"
      />
      {isStreaming && (
        <span className="inline-block w-2 h-4 ml-1 bg-codex-accent animate-pulse align-middle" />
      )}
    </div>
  );
};
