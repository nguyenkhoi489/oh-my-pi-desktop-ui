// Rich MarkdownRenderer: VS Code parity with KaTeX math, Prism syntax highlighting and Mermaid diagrams

import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { parseMarkdown } from '../../utils/markdownParser';
import { useI18n } from '../../i18n/I18nProvider';
import type { ThemeMode } from '../../types';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  isStreaming?: boolean;
  theme?: ThemeMode;
  onOpenUrl?: (url: string) => void;
}

// Prevent Mermaid v11 unsupported markdown list errors on quoted labels
const sanitizeMermaidSource = (source: string): string => {
  return source.replace(/"([^"]*)"/g, (_, inner: string) => {
    const fixedNumbered = inner.replace(/(^|\n|<br\s*\/?>)\s*(\d+)\.\s+/g, '$1$2.\u00A0');
    return `"${fixedNumbered.replace(/(^|\n|<br\s*\/?>)\s*-\s+/g, '$1• ')}"`;
  });
};
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = React.memo(({
  content,
  className = '',
  isStreaming = false,
  theme,
  onOpenUrl,
}) => {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse markdown to safe sanitized HTML with localized labels
  const htmlContent = useMemo(() => {
    return parseMarkdown(content, { t });
  }, [content, t]);

  // Synchronize theme between props and dark class on document root
  const [activeTheme, setActiveTheme] = useState<'dark' | 'light'>(() => {
    if (theme) return theme;
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
    return 'light';
  });

  useEffect(() => {
    if (theme) {
      setActiveTheme(theme);
      return;
    }
    if (typeof document === 'undefined') return;

    const syncTheme = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setActiveTheme(isDark ? 'dark' : 'light');
    };

    syncTheme();
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          syncTheme();
          break;
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [theme]);

  // Asynchronously render Mermaid diagrams when not streaming
  useEffect(() => {
    if (isStreaming || !containerRef.current) return;

    const currentThemeTag = activeTheme;
    const isDark = currentThemeTag === 'dark';

    const unrendered = containerRef.current.querySelectorAll<HTMLElement>(
      `.mermaid-diagram-container:not([data-rendered-theme="${currentThemeTag}"])`
    );
    if (unrendered.length === 0) return;

    let isSubscribed = true;

    import('mermaid')
      .then(({ default: mermaid }) => {
        if (!isSubscribed) return;

        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          securityLevel: 'strict',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          themeVariables: isDark
            ? {
                darkMode: true,
                background: 'transparent',
                mainBkg: '#1a1d28',
                nodeBorder: '#3b4254',
                primaryColor: '#1e2230',
                primaryTextColor: '#f4f4f5',
                primaryBorderColor: '#3b4254',
                lineColor: '#94a3b8',
                textColor: '#e4e4e7',
                titleColor: '#f4f4f5',
                edgeLabelBackground: '#181b24',
                clusterBkg: '#12141c',
                clusterBorder: '#272b3b',
                nodeTextColor: '#f4f4f5',
              }
            : {
                darkMode: false,
                background: 'transparent',
                mainBkg: '#ffffff',
                nodeBorder: '#cbd5e1',
                primaryColor: '#f8fafc',
                primaryTextColor: '#0f172a',
                primaryBorderColor: '#cbd5e1',
                lineColor: '#64748b',
                textColor: '#334155',
                titleColor: '#0f172a',
                edgeLabelBackground: '#f1f5f9',
                clusterBkg: '#f8fafc',
                clusterBorder: '#e2e8f0',
                nodeTextColor: '#0f172a',
              },
        });

        unrendered.forEach(async (el) => {
          const rawCode = el.getAttribute('data-mermaid');
          if (!rawCode) return;

          const decoded = decodeURIComponent(rawCode);
          const cleaned = sanitizeMermaidSource(decoded);
          const uniqueId = `mermaid-${Math.random().toString(36).slice(2, 10)}`;

          try {
            const { svg } = await mermaid.render(uniqueId, cleaned);
            if (isSubscribed && el.isConnected) {
              const cleanSvg = DOMPurify.sanitize(svg, {
                ADD_TAGS: ['foreignobject'],
                ADD_ATTR: ['dominant-baseline', 'text-anchor'],
                HTML_INTEGRATION_POINTS: {
                  foreignobject: true,
                },
              });
              el.innerHTML = cleanSvg;
              el.setAttribute('data-rendered-theme', currentThemeTag);
              el.setAttribute('data-rendered', 'true');
            }
          } catch {
            if (isSubscribed && el.isConnected) {
              const errorMessage = t('markdown.mermaid.error');
              el.innerHTML = `<div class="text-xs text-rose-500 dark:text-rose-400 p-2.5 rounded-lg border border-rose-500/20 bg-rose-500/10 flex items-center gap-2">
                <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>${errorMessage}</span>
              </div>`;
              el.setAttribute('data-rendered-theme', currentThemeTag);
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
            el.setAttribute('data-rendered-theme', currentThemeTag);
            el.setAttribute('data-rendered', 'error');
            const wrapper = el.closest('.mermaid-block-wrapper');
            wrapper?.querySelector('.mermaid-source-code')?.classList.remove('hidden');
          }
        });
      });
    return () => {
      isSubscribed = false;
    };
  }, [htmlContent, isStreaming, activeTheme, t]);

  // Update transform for Mermaid diagram container
  const updateDiagramTransform = useCallback((diagram: HTMLElement, scale: number, panX: number, panY: number) => {
    diagram.dataset.scale = scale.toFixed(2);
    diagram.dataset.panX = panX.toFixed(1);
    diagram.dataset.panY = panY.toFixed(1);
    diagram.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }, []);

  // Delegated click handler for copy code, mermaid code toggle, zoom, and reset
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

    // 3. Mermaid Zoom In button
    const zoomInBtn = target.closest('.mermaid-zoom-in-btn') as HTMLButtonElement | null;
    if (zoomInBtn) {
      e.preventDefault();
      e.stopPropagation();
      const viewport = zoomInBtn.closest('.mermaid-viewport');
      const container = viewport?.querySelector<HTMLElement>('.mermaid-diagram-container');
      if (container) {
        const scale = parseFloat(container.dataset.scale || '1');
        const panX = parseFloat(container.dataset.panX || '0');
        const panY = parseFloat(container.dataset.panY || '0');
        const nextScale = Math.min(Number((scale * 1.25).toFixed(2)), 4);
        updateDiagramTransform(container, nextScale, panX, panY);
      }
      return;
    }

    // 4. Mermaid Zoom Out button
    const zoomOutBtn = target.closest('.mermaid-zoom-out-btn') as HTMLButtonElement | null;
    if (zoomOutBtn) {
      e.preventDefault();
      e.stopPropagation();
      const viewport = zoomOutBtn.closest('.mermaid-viewport');
      const container = viewport?.querySelector<HTMLElement>('.mermaid-diagram-container');
      if (container) {
        const scale = parseFloat(container.dataset.scale || '1');
        const panX = parseFloat(container.dataset.panX || '0');
        const panY = parseFloat(container.dataset.panY || '0');
        const nextScale = Math.max(Number((scale / 1.25).toFixed(2)), 0.3);
        updateDiagramTransform(container, nextScale, panX, panY);
      }
      return;
    }

    // 5. Mermaid Reset / Fit-to-view button
    const resetBtn = target.closest('.mermaid-reset-btn') as HTMLButtonElement | null;
    if (resetBtn) {
      e.preventDefault();
      e.stopPropagation();
      const viewport = resetBtn.closest('.mermaid-viewport');
      const container = viewport?.querySelector<HTMLElement>('.mermaid-diagram-container');
      if (container) {
        updateDiagramTransform(container, 1, 0, 0);
      }
      return;
    }

    // 6. Anchor / Link click handling: route web URLs to In-App Sidebar Browser
    const anchor = target.closest('a') as HTMLAnchorElement | null;
    if (anchor) {
      const href = anchor.getAttribute('href');
      if (href) {
        // Hash anchor link (e.g. #section)
        if (href.startsWith('#')) {
          e.preventDefault();
          const targetEl = containerRef.current?.querySelector(href) || document.getElementById(href.slice(1));
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth' });
          }
          return;
        }

        // Web URL (http://, https://, //)
        const isHttpUrl = /^https?:\/\//i.test(href) || href.startsWith('//');
        if (isHttpUrl) {
          // Cmd+Click / Ctrl+Click or Middle-Click -> open in external browser
          const isModifierClick = e.metaKey || e.ctrlKey || e.button === 1;
          if (isModifierClick) {
            e.preventDefault();
            e.stopPropagation();
            if (window.electronAPI?.openExternal) {
              window.electronAPI.openExternal(href);
            } else {
              window.open(href, '_blank', 'noopener,noreferrer');
            }
            return;
          }

          // Normal click -> route to In-App Browser in sidebar
          e.preventDefault();
          e.stopPropagation();

          if (onOpenUrl) {
            onOpenUrl(href);
          }
          // Global dispatch so App.tsx can handle opening the sidebar browser
          window.dispatchEvent(
            new CustomEvent('omp:open-in-app-browser', { detail: { url: href } })
          );
          return;
        }
      }
    }
  }, [t, updateDiagramTransform, onOpenUrl]);

  // Mouse down drag-to-pan handler
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('.mermaid-controls') || target.closest('button')) return;

    const viewport = target.closest('.mermaid-viewport') as HTMLElement | null;
    if (!viewport) return;

    const container = viewport.querySelector<HTMLElement>('.mermaid-diagram-container');
    if (!container) return;

    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialPanX = parseFloat(container.dataset.panX || '0');
    const initialPanY = parseFloat(container.dataset.panY || '0');
    const currentScale = parseFloat(container.dataset.scale || '1');

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      updateDiagramTransform(container, currentScale, initialPanX + dx, initialPanY + dy);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [updateDiagramTransform]);

  // Double click on viewport resets zoom and pan
  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('.mermaid-controls') || target.closest('button')) return;

    const viewport = target.closest('.mermaid-viewport');
    if (!viewport) return;

    const container = viewport.querySelector<HTMLElement>('.mermaid-diagram-container');
    if (container) {
      e.preventDefault();
      updateDiagramTransform(container, 1, 0, 0);
    }
  }, [updateDiagramTransform]);

  // Wheel zoom with Ctrl or Meta key
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      const viewport = (e.target as HTMLElement).closest('.mermaid-viewport');
      if (!viewport) return;

      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const diagramContainer = viewport.querySelector<HTMLElement>('.mermaid-diagram-container');
        if (!diagramContainer) return;

        const currentScale = parseFloat(diagramContainer.dataset.scale || '1');
        const currentPanX = parseFloat(diagramContainer.dataset.panX || '0');
        const currentPanY = parseFloat(diagramContainer.dataset.panY || '0');
        const delta = e.deltaY < 0 ? 1.15 : 0.85;
        const nextScale = Math.min(Math.max(Number((currentScale * delta).toFixed(2)), 0.3), 4);
        updateDiagramTransform(diagramContainer, nextScale, currentPanX, currentPanY);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [updateDiagramTransform]);

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
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
