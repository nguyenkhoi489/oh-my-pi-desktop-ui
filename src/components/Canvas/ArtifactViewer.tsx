import React, { useState, useEffect } from 'react';
import {
  Eye,
  Code,
  FileText,
  Copy,
  Check,
  RotateCw,
  Smartphone,
  Tablet,
  Monitor,
  ChevronDown,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { ArtifactDocument } from '../../types';
import { DEMO_ARTIFACTS } from '../../mock/demoData';
import { MarkdownRenderer } from '../Common/MarkdownRenderer';
import { stripMarkdownFrontmatter } from '../../utils/artifactDiscovery';
import { useI18n } from '../../i18n/I18nProvider';

interface ArtifactViewerProps {
  artifacts?: ArtifactDocument[];
  selectedArtifactId?: string;
  onSelectArtifact?: (id: string) => void;
  onReloadArtifact?: (id?: string) => void;
  theme?: string;
}

export const ArtifactViewer: React.FC<ArtifactViewerProps> = ({
  artifacts = DEMO_ARTIFACTS,
  selectedArtifactId: controlledArtifactId,
  onSelectArtifact,
  onReloadArtifact,
}) => {
  const { t } = useI18n();
  const [internalArtifactId, setInternalArtifactId] = useState<string>(artifacts[0]?.id || '');
  const [viewMode, setViewMode] = useState<'preview' | 'document' | 'source'>('preview');
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [copied, setCopied] = useState<boolean>(false);

  const activeId = controlledArtifactId !== undefined ? controlledArtifactId : internalArtifactId;
  const currentArtifact = artifacts.find((a) => a.id === activeId) || artifacts[0];

  // Sync default viewMode by artifact type when active artifact changes
  useEffect(() => {
    if (currentArtifact) {
      if (currentArtifact.type === 'markdown' || currentArtifact.type === 'plan') {
        setViewMode('document');
      } else {
        setViewMode('preview');
      }
    }
  }, [currentArtifact?.id, currentArtifact?.type]);

  const handleCopy = () => {
    if (!currentArtifact) return;
    navigator.clipboard.writeText(currentArtifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReload = () => {
    setIframeKey((prev) => prev + 1);
    if (currentArtifact && onReloadArtifact) {
      onReloadArtifact(currentArtifact.id);
    }
  };

  if (!currentArtifact || artifacts.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-zinc-500 text-xs">
        <Sparkles className="w-8 h-8 text-slate-300 dark:text-zinc-600 mb-2 stroke-[1.5]" />
        <p className="font-medium text-slate-600 dark:text-zinc-400">{t('artifact.emptyTitle')}</p>
        <p className="mt-1 text-slate-400 dark:text-zinc-500 max-w-sm">
          {t('artifact.emptyDesc')}
        </p>
      </div>
    );
  }

  const isLoading = currentArtifact.isLoaded === false && !currentArtifact.content;
  const isEmptyContent = currentArtifact.isLoaded === true && !currentArtifact.content;

  const getContainerWidth = () => {
    switch (deviceMode) {
      case 'mobile':
        return 'max-w-[375px] h-[667px] shadow-2xl rounded-2xl border-4 border-slate-300 dark:border-zinc-700 my-auto';
      case 'tablet':
        return 'max-w-[768px] h-[800px] shadow-2xl rounded-xl border-2 border-slate-300 dark:border-zinc-700 my-auto';
      default:
        return 'w-full h-full';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden select-none">
      {/* Top Header: Artifact Selector & View Mode Switcher */}
      <div className="h-11 bg-surface border-b border-border flex items-center justify-between px-4 shrink-0 gap-2">
        {/* Left: Artifact Dropdown / Selector */}
        <div className="flex items-center gap-2.5 min-w-0">
          <Sparkles className="w-4 h-4 text-codex-accent shrink-0" />
          
          <div className="relative flex items-center max-w-[280px] sm:max-w-[380px]">
            <select
              value={currentArtifact.id}
              onChange={(e) => {
                const targetId = e.target.value;
                if (onSelectArtifact) {
                  onSelectArtifact(targetId);
                } else {
                  setInternalArtifactId(targetId);
                }
              }}
              className="appearance-none bg-panel hover:bg-surface-highlight border border-border rounded-lg px-3 py-1.5 pr-8 text-xs font-semibold text-slate-800 dark:text-zinc-200 outline-none cursor-pointer transition-colors truncate w-full"
            >
              {artifacts.map((art) => (
                <option key={art.id} value={art.id}>
                  {art.title} ({art.type.toUpperCase()})
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
          </div>

          <span className="text-[11px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-codex-500/10 text-codex-600 dark:text-codex-400 border border-codex-500/20 shrink-0">
            {currentArtifact.type}
          </span>
        </div>

        {/* Center: View Mode (Live Preview | Document | Source Code) */}
        <div className="flex items-center bg-panel rounded-lg p-0.5 border border-border shrink-0">
          <button
            onClick={() => setViewMode('preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'preview'
                ? 'bg-codex-accent text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Preview</span>
          </button>

          <button
            onClick={() => setViewMode('document')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'document'
                ? 'bg-codex-accent text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Document</span>
          </button>

          <button
            onClick={() => setViewMode('source')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'source'
                ? 'bg-codex-accent text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Source</span>
          </button>
        </div>

        {/* Right: Device Switcher & Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {viewMode === 'preview' && currentArtifact.type !== 'svg' && (
            <div className="flex items-center bg-panel rounded-lg p-0.5 border border-border mr-1">
              <button
                onClick={() => setDeviceMode('desktop')}
                className={`p-1.5 rounded text-xs transition-colors cursor-pointer ${
                  deviceMode === 'desktop' ? 'bg-surface-highlight text-codex-accent' : 'text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200'
                }`}
                title="Desktop View"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setDeviceMode('tablet')}
                className={`p-1.5 rounded text-xs transition-colors cursor-pointer ${
                  deviceMode === 'tablet' ? 'bg-surface-highlight text-codex-accent' : 'text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200'
                }`}
                title="Tablet View (768px)"
              >
                <Tablet className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setDeviceMode('mobile')}
                className={`p-1.5 rounded text-xs transition-colors cursor-pointer ${
                  deviceMode === 'mobile' ? 'bg-surface-highlight text-codex-accent' : 'text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200'
                }`}
                title="Mobile View (375px)"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            onClick={handleReload}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-surface-highlight transition-colors cursor-pointer"
            title={t('artifact.reloadFromDisk')}
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-zinc-300 hover:text-slate-900 hover:bg-surface-highlight border border-border transition-colors cursor-pointer"
            title={t('artifact.copyCode')}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center p-6 bg-background overflow-auto">
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-zinc-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{t('artifact.reading', { title: currentArtifact.title })}</span>
          </div>
        )}

        {isEmptyContent && (
          <div className="text-xs text-slate-400 dark:text-zinc-500">
            {t('artifact.emptyOrUnreadable', { title: currentArtifact.title })}
          </div>
        )}

        {/* 1. LIVE PREVIEW MODE (HTML / SVG / Widget) */}
        {!isLoading && !isEmptyContent && viewMode === 'preview' && (
          <div className={`transition-all duration-300 bg-white dark:bg-zinc-900 overflow-hidden flex flex-col rounded-xl border border-border ${getContainerWidth()}`}>
            {currentArtifact.type === 'svg' ? (
              <div
                className="w-full h-full flex items-center justify-center p-6"
                dangerouslySetInnerHTML={{ __html: currentArtifact.content }}
              />
            ) : (
              <iframe
                key={iframeKey}
                title={currentArtifact.title}
                srcDoc={currentArtifact.content}
                sandbox="allow-scripts allow-modals allow-forms"
                className="w-full h-full border-0 bg-white"
              />
            )}
          </div>
        )}

        {/* 2. RICH DOCUMENT MODE (Markdown / Plans) */}
        {!isLoading && !isEmptyContent && viewMode === 'document' && (
          <div className="w-full h-full max-w-4xl bg-panel rounded-2xl border border-border p-8 overflow-y-auto shadow-sm">
            <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-100 mb-2">
              {currentArtifact.title}
            </h1>
            {currentArtifact.description && (
              <p className="text-xs text-slate-500 dark:text-zinc-400 mb-6 leading-relaxed">
                {currentArtifact.description}
              </p>
            )}
            <MarkdownRenderer content={stripMarkdownFrontmatter(currentArtifact.content)} />
          </div>
        )}

        {/* 3. RAW SOURCE CODE MODE */}
        {!isLoading && !isEmptyContent && viewMode === 'source' && (
          <div className="w-full h-full max-w-4xl bg-panel rounded-2xl border border-border overflow-hidden flex flex-col shadow-sm">
            <div className="h-9 bg-surface border-b border-border flex items-center justify-between px-4 text-xs text-slate-500 font-mono">
              <span>{currentArtifact.title}</span>
              <span>{currentArtifact.content.length} characters</span>
            </div>
            <pre className="flex-1 p-5 overflow-auto font-mono text-xs text-slate-800 dark:text-zinc-300 bg-background leading-relaxed whitespace-pre-wrap select-text">
              {currentArtifact.content}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
