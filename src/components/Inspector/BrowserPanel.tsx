import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  X,
  ExternalLink,
  Send,
  Wrench,
  Globe,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { normalizeUrl, isLocalFileTarget, extractFilePath } from '../../utils/urlHelper';
import { useI18n } from '../../i18n/I18nProvider';
import type { ElectronWebviewElement } from '../../types';

export interface BrowserPanelProps {
  initialUrl?: string;
  urlNonce?: number;
  onSendUrlToChat?: (url: string) => void;
  className?: string;
}

interface WebviewNavigateEvent extends Event {
  url?: string;
}

interface WebviewTitleEvent extends Event {
  title?: string;
}

interface WebviewFailLoadEvent extends Event {
  errorCode?: number;
  errorDescription?: string;
  validatedURL?: string;
  isMainFrame?: boolean;
}

export const BrowserPanel: React.FC<BrowserPanelProps> = memo(function BrowserPanel({
  initialUrl = 'http://localhost:5173',
  urlNonce,
  onSendUrlToChat,
  className = '',
}) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string>(initialUrl);
  const [inputUrl, setInputUrl] = useState<string>(initialUrl);
  const [pageTitle, setPageTitle] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [canGoBack, setCanGoBack] = useState<boolean>(false);
  const [canGoForward, setCanGoForward] = useState<boolean>(false);
  const [isCrashed, setIsCrashed] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<{ title: string; description: string } | null>(null);
  const [isDevToolsOpen, setIsDevToolsOpen] = useState<boolean>(false);

  const webviewRef = useRef<ElectronWebviewElement | null>(null);

  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI);

  // Navigate to target URL
  const navigateTo = useCallback((targetUrl: string) => {
    if (isLocalFileTarget(targetUrl)) {
      const filePath = extractFilePath(targetUrl);
      if (filePath) {
        window.dispatchEvent(
          new CustomEvent('omp:open-file', { detail: { path: filePath } })
        );
        return;
      }
    }
    const normalized = normalizeUrl(targetUrl);
    setUrl(normalized);
    setInputUrl(normalized);
    setLoadError(null);
    setIsCrashed(false);

    const wv = webviewRef.current;
    if (wv && typeof wv.loadURL === 'function') {
      try {
        wv.loadURL(normalized);
      } catch (err) {
        console.error('Failed to load URL in webview:', err);
      }
    }
  }, []);

  // Keep url in sync when initialUrl or urlNonce changes from external triggers
  const prevUrlRef = useRef<string>(initialUrl);
  const prevNonceRef = useRef<number | undefined>(urlNonce);

  useEffect(() => {
    const isUrlChanged = Boolean(initialUrl) && initialUrl !== prevUrlRef.current;
    const isNonceChanged = urlNonce !== undefined && urlNonce !== prevNonceRef.current;
    if (initialUrl && (isUrlChanged || isNonceChanged)) {
      prevUrlRef.current = initialUrl;
      prevNonceRef.current = urlNonce;
      navigateTo(initialUrl);
    }
  }, [initialUrl, urlNonce, navigateTo]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        navigateTo(inputUrl);
      }
    },
    [inputUrl, navigateTo]
  );

  const handleGoBack = useCallback(() => {
    const wv = webviewRef.current;
    if (wv && typeof wv.goBack === 'function' && canGoBack) {
      wv.goBack();
    }
  }, [canGoBack]);

  const handleGoForward = useCallback(() => {
    const wv = webviewRef.current;
    if (wv && typeof wv.goForward === 'function' && canGoForward) {
      wv.goForward();
    }
  }, [canGoForward]);

  const handleReloadOrStop = useCallback(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    if (isLoading && typeof wv.stop === 'function') {
      wv.stop();
    } else if (typeof wv.reload === 'function') {
      setLoadError(null);
      setIsCrashed(false);
      wv.reload();
    }
  }, [isLoading]);
  const handleRecoverReload = useCallback(() => {
    setIsLoading(false);
    setLoadError(null);
    setIsCrashed(false);
    const wv = webviewRef.current;
    if (wv && typeof wv.reload === 'function') {
      try {
        wv.reload();
      } catch {
        navigateTo(url);
      }
    } else {
      navigateTo(url);
    }
  }, [navigateTo, url]);


  const handleOpenExternal = useCallback(() => {
    if (url && window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(url);
    } else if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [url]);

  const handleSendToChat = useCallback(() => {
    if (url && onSendUrlToChat) {
      onSendUrlToChat(url);
    }
  }, [url, onSendUrlToChat]);

  const handleToggleDevTools = useCallback(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    try {
      if (typeof wv.isDevToolsOpened === 'function' && wv.isDevToolsOpened()) {
        wv.closeDevTools();
        setIsDevToolsOpen(false);
      } else if (typeof wv.openDevTools === 'function') {
        wv.openDevTools();
        setIsDevToolsOpen(true);
      }
    } catch (err) {
      console.error('Failed to toggle webview DevTools:', err);
    }
  }, []);

  // Bind webview lifecycle events
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    const onStartLoading = () => {
      setIsLoading(true);
      setLoadError(null);
      setIsCrashed(false);
    };

    const onStopLoading = () => {
      setIsLoading(false);
      try {
        if (typeof wv.canGoBack === 'function') setCanGoBack(wv.canGoBack());
        if (typeof wv.canGoForward === 'function') setCanGoForward(wv.canGoForward());
        if (typeof wv.getURL === 'function') {
          const current = wv.getURL();
          if (current && current !== 'about:blank') {
            setUrl(current);
            setInputUrl(current);
          }
        }
      } catch {
        // Suppress errors if webview is unmounted
      }
    };

    const onDidNavigate = (e: Event) => {
      const navEvent = e as WebviewNavigateEvent;
      if (navEvent.url) {
        setUrl(navEvent.url);
        setInputUrl(navEvent.url);
      }
    };

    const onPageTitleUpdated = (e: Event) => {
      const titleEvent = e as WebviewTitleEvent;
      if (titleEvent.title) {
        setPageTitle(titleEvent.title);
      }
    };

    const onDidFailLoad = (e: Event) => {
      const failEvent = e as WebviewFailLoadEvent;
      // Ignore abort/cancel errors (code -3)
      if (failEvent.errorCode !== -3 && failEvent.isMainFrame) {
        setLoadError({
          title: t('browser.loadErrorTitle'),
          description: t('browser.loadErrorDesc', {
            url: failEvent.validatedURL || url,
            error: failEvent.errorDescription || String(failEvent.errorCode),
          }),
        });
      }
    };

    const onUnresponsive = () => {
      setIsLoading(false);
      setIsCrashed(true);
    };

    const onResponsive = () => {
      setIsCrashed(false);
    };

    const onRenderProcessGone = () => {
      setIsLoading(false);
      setIsCrashed(true);
    };

    wv.addEventListener('did-start-loading', onStartLoading);
    wv.addEventListener('did-stop-loading', onStopLoading);
    wv.addEventListener('did-navigate', onDidNavigate);
    wv.addEventListener('did-navigate-in-page', onDidNavigate);
    wv.addEventListener('page-title-updated', onPageTitleUpdated);
    wv.addEventListener('did-fail-load', onDidFailLoad);
    wv.addEventListener('render-process-gone', onRenderProcessGone);
    wv.addEventListener('unresponsive', onUnresponsive);
    wv.addEventListener('responsive', onResponsive);

    return () => {
      wv.removeEventListener('did-start-loading', onStartLoading);
      wv.removeEventListener('did-stop-loading', onStopLoading);
      wv.removeEventListener('did-navigate', onDidNavigate);
      wv.removeEventListener('did-navigate-in-page', onDidNavigate);
      wv.removeEventListener('page-title-updated', onPageTitleUpdated);
      wv.removeEventListener('did-fail-load', onDidFailLoad);
      wv.removeEventListener('render-process-gone', onRenderProcessGone);
      wv.removeEventListener('unresponsive', onUnresponsive);
      wv.removeEventListener('responsive', onResponsive);
    };
  }, [t, url]);

  return (
    <div className={`flex flex-col h-full w-full bg-background overflow-hidden select-none ${className}`}>
      {/* Top Navigation & Address Toolbar */}
      <div className="h-10 px-2 bg-surface border-b border-border flex items-center gap-1.5 shrink-0 text-slate-700 dark:text-zinc-300">
        {/* History Back */}
        <button
          type="button"
          onClick={handleGoBack}
          disabled={!canGoBack}
          title={t('browser.back')}
          className="p-1 rounded-md hover:bg-surface-highlight disabled:opacity-30 disabled:pointer-events-none text-slate-600 dark:text-zinc-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* History Forward */}
        <button
          type="button"
          onClick={handleGoForward}
          disabled={!canGoForward}
          title={t('browser.forward')}
          className="p-1 rounded-md hover:bg-surface-highlight disabled:opacity-30 disabled:pointer-events-none text-slate-600 dark:text-zinc-400 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
        </button>

        {/* Reload / Stop */}
        <button
          type="button"
          onClick={handleReloadOrStop}
          title={isLoading ? t('browser.stop') : t('browser.reload')}
          className="p-1 rounded-md hover:bg-surface-highlight text-slate-600 dark:text-zinc-400 transition-colors"
        >
          {isLoading ? <X className="w-4 h-4" /> : <RotateCw className="w-4 h-4" />}
        </button>

        {/* Quick Localhost Preset */}
        <button
          type="button"
          onClick={() => navigateTo('http://localhost:5173')}
          title="Localhost (5173)"
          className="p-1 rounded-md hover:bg-surface-highlight text-slate-600 dark:text-zinc-400 transition-colors"
        >
          <Globe className="w-4 h-4" />
        </button>

        {/* Omnibox / Address Bar Input */}
        <div className="flex-1 min-w-0 flex items-center bg-surface-highlight/70 dark:bg-zinc-900/60 border border-border rounded-lg px-2.5 py-1 text-xs focus-within:border-accent focus-within:ring-1 focus-within:ring-accent transition-all">
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('browser.addressPlaceholder')}
            className="w-full bg-transparent outline-none text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 font-mono text-[11px]"
          />
        </div>

        {/* Send URL to Chat Composer */}
        {onSendUrlToChat && (
          <button
            type="button"
            onClick={handleSendToChat}
            title={t('browser.sendToChat')}
            className="p-1.5 rounded-md hover:bg-surface-highlight text-slate-600 dark:text-zinc-400 hover:text-accent transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Open External */}
        <button
          type="button"
          onClick={handleOpenExternal}
          title={t('browser.openExternal')}
          className="p-1.5 rounded-md hover:bg-surface-highlight text-slate-600 dark:text-zinc-400 hover:text-accent transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>

        {/* DevTools Toggle */}
        <button
          type="button"
          onClick={handleToggleDevTools}
          title={t('browser.toggleDevTools')}
          className={`p-1.5 rounded-md hover:bg-surface-highlight transition-colors ${
            isDevToolsOpen ? 'text-accent bg-surface-highlight' : 'text-slate-600 dark:text-zinc-400'
          }`}
        >
          <Wrench className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Loading Progress Indicator */}
      {isLoading && (
        <div className="h-0.5 w-full bg-surface-highlight overflow-hidden shrink-0">
          <div className="h-full bg-accent animate-pulse w-full origin-left transition-all duration-300" />
        </div>
      )}

      {/* Main Webview Viewport */}
      <div className="flex-1 relative w-full h-full min-h-0 bg-white dark:bg-zinc-950 overflow-hidden">
        {/* Crash State Fallback */}
        {isCrashed && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-background">
            <AlertTriangle className="w-10 h-10 text-amber-500 mb-3" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-zinc-200">
              {t('browser.crashTitle')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mt-1.5 mb-4">
              {t('browser.crashDesc')}
            </p>
            <button
              type="button"
              onClick={handleRecoverReload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t('browser.crashReload')}
            </button>
          </div>
        )}

        {/* Load Error State Fallback */}
        {loadError && !isCrashed && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-background">
            <AlertTriangle className="w-10 h-10 text-rose-500 mb-3" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-zinc-200">
              {loadError.title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mt-1.5 mb-4">
              {loadError.description}
            </p>
            <button
              onClick={handleRecoverReload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t('browser.crashReload')}
            </button>
          </div>
        )}

        {/* Browser Mock Warning when running without Electron */}
        {!isElectron ? (
          <div className="flex-1 h-full flex flex-col items-center justify-center p-8 text-center bg-background text-slate-500 dark:text-zinc-400">
            <Globe className="w-12 h-12 text-slate-400 dark:text-zinc-500 mb-3 stroke-[1.5]" />
            <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">
              {pageTitle || url}
            </p>
            <p className="text-xs mt-1.5 max-w-md">
              {t('browser.mockNotice')}
            </p>
          </div>
        ) : (
          <webview
            ref={webviewRef as unknown as React.RefObject<HTMLDivElement>}
            src={url}
            partition="persist:omp-agent-browser"
            allowpopups={false}
            className="w-full h-full border-none"
            style={{ width: '100%', height: '100%' }}
          />
        )}
      </div>
    </div>
  );
});
