// Rich MarkdownRenderer: VS Code parity with KaTeX math, Prism syntax highlighting and Mermaid diagrams

import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { parseMarkdown } from '../../utils/markdownParser';
import { useI18n } from '../../i18n/I18nProvider';
interface MarkdownRendererProps {
  content: string;
  className?: string;
  isStreaming?: boolean;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = React.memo(({
  content,
  className = '',
  isStreaming = false,
}) => {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse markdown to safe sanitized HTML with localized labels
  const htmlContent = useMemo(() => {
    return parseMarkdown(content, { t });
  }, [content, t]);

  // Asynchronously render Mermaid diagrams when not streaming
  useEffect(() => {
    if (isStreaming || !containerRef.current) return;

    const unrendered = containerRef.current.querySelectorAll<HTMLElement>(
      '.mermaid-diagram-container:not([data-rendered="true"])'
    );
    if (unrendered.length === 0) return;

    let isSubscribed = true;

    import('mermaid')
      .then(({ default: mermaid }) => {
        if (!isSubscribed) return;

        const isDark = document.documentElement.classList.contains('dark');
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'strict',
          fontFamily: 'JetBrains Mono, SF Mono, Menlo, monospace',
        });

        unrendered.forEach(async (el) => {
          const rawCode = el.getAttribute('data-mermaid');
          if (!rawCode) return;

          const decoded = decodeURIComponent(rawCode);
          const uniqueId = `mermaid-${Math.random().toString(36).slice(2, 10)}`;

          try {
            const { svg } = await mermaid.render(uniqueId, decoded);
            if (isSubscribed && el.isConnected) {
              const cleanSvg = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
              el.innerHTML = cleanSvg;
              el.setAttribute('data-rendered', 'true');
            }
          } catch {
            if (isSubscribed && el.isConnected) {
              const errorMessage = t('markdown.mermaid.error');
              el.innerHTML = `<div class="text-xs text-rose-500 dark:text-rose-400 p-2.5 rounded-lg border border-rose-500/20 bg-rose-500/10 flex items-center gap-2">
                <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>${errorMessage}</span>
              </div>`;
              el.setAttribute('data-rendered', 'error');

              // Automatically reveal source code on error
              const wrapper = el.closest('.mermaid-block-wrapper');
              wrapper?.querySelector('.mermaid-source-code')?.classList.remove('hidden');
            }
          }
        });
      })
      .catch(() => {
        if (!isSubscribed) return;
        const errorMessage = t('markdown.mermaid.error');
        unrendered.forEach((el) => {
          if (el.isConnected) {
            el.innerHTML = `<div class="text-xs text-rose-500 dark:text-rose-400 p-2.5 rounded-lg border border-rose-500/20 bg-rose-500/10 flex items-center gap-2">
              <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>${errorMessage}</span>
            </div>`;
            el.setAttribute('data-rendered', 'error');
            const wrapper = el.closest('.mermaid-block-wrapper');
            wrapper?.querySelector('.mermaid-source-code')?.classList.remove('hidden');
          }
        });
      });
    return () => {
      isSubscribed = false;
    };
  }, [htmlContent, isStreaming, t]);

  // Delegated click handler for copy code, mermaid code toggle, and external links
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    // 1. Copy code button
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
          textSpan.textContent = t('markdown.copied');
          copyBtn.classList.add('text-emerald-500');
          setTimeout(() => {
            textSpan.textContent = t('markdown.copy');
            copyBtn.classList.remove('text-emerald-500');
          }, 2000);
        }
      }
      return;
    }

    // 2. Toggle mermaid source code button
    const viewMermaidBtn = target.closest('.view-mermaid-source-btn') as HTMLButtonElement | null;
    if (viewMermaidBtn) {
      e.preventDefault();
      e.stopPropagation();
      const wrapper = viewMermaidBtn.closest('.mermaid-block-wrapper');
      if (wrapper) {
        const sourcePre = wrapper.querySelector('.mermaid-source-code');
        if (sourcePre) {
          const isHidden = sourcePre.classList.toggle('hidden');
          viewMermaidBtn.classList.toggle('text-purple-600', !isHidden);
          viewMermaidBtn.classList.toggle('dark:text-purple-400', !isHidden);
          viewMermaidBtn.classList.toggle('font-semibold', !isHidden);
        }
      }
      return;
    }
  }, [t]);

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className={`markdown-content select-text leading-relaxed font-sans min-w-0 max-w-full break-words [overflow-wrap:anywhere] ${className}`}
    >
      <div
        dangerouslySetInnerHTML={{ __html: htmlContent }}
        className="min-w-0 max-w-full block"
      />
      {isStreaming && (
        <span className="inline-block w-1.5 h-4 ml-1 bg-blue-500 dark:bg-blue-400 animate-pulse align-middle" />
      )}
    </div>
  );
});

MarkdownRenderer.displayName = 'MarkdownRenderer';
