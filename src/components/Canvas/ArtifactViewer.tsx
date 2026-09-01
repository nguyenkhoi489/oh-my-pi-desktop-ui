import React, { useState } from 'react';
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
  ExternalLink,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { ArtifactDocument, ThemeMode } from '../../types';
import { DEMO_ARTIFACTS } from '../../mock/demoData';

interface ArtifactViewerProps {
  artifacts?: ArtifactDocument[];
  theme?: ThemeMode;
}

export const ArtifactViewer: React.FC<ArtifactViewerProps> = ({
  artifacts = DEMO_ARTIFACTS,
  theme = 'light',
}) => {
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>(artifacts[0]?.id || '');
  const [viewMode, setViewMode] = useState<'preview' | 'document' | 'source'>('preview');
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [copied, setCopied] = useState<boolean>(false);

  const currentArtifact = artifacts.find((a) => a.id === selectedArtifactId) || artifacts[0];

  const handleCopy = () => {
    if (!currentArtifact) return;
    navigator.clipboard.writeText(currentArtifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReload = () => {
    setIframeKey((prev) => prev + 1);
  };

  if (!currentArtifact) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">
        Chưa có Artifacts nào được tạo
      </div>
    );
  }

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
      <div className="h-10 bg-surface border-b border-border flex items-center justify-between px-3 shrink-0 gap-2">
        {/* Left: Artifact Dropdown / Selector */}
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
          
          <div className="relative flex items-center">
            <select
              value={selectedArtifactId}
              onChange={(e) => {
                setSelectedArtifactId(e.target.value);
                const art = artifacts.find((a) => a.id === e.target.value);
                if (art?.type === 'markdown' || art?.type === 'plan') {
                  setViewMode('document');
                } else {
                  setViewMode('preview');
                }
              }}
              className="appearance-none bg-panel hover:bg-surface-highlight border border-border rounded-md px-2.5 py-1 pr-7 text-xs font-semibold text-slate-800 dark:text-zinc-200 outline-none cursor-pointer transition-colors"
            >
              {artifacts.map((art) => (
                <option key={art.id} value={art.id}>
                  {art.title} ({art.type.toUpperCase()})
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 pointer-events-none" />
          </div>

          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700/40">
            {currentArtifact.type}
          </span>
        </div>

        {/* Center: View Mode (Live Preview | Document | Source Code) */}
        <div className="flex items-center bg-panel rounded-lg p-0.5 border border-border">
          <button
            onClick={() => setViewMode('preview')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
              viewMode === 'preview'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Preview</span>
          </button>

          <button
            onClick={() => setViewMode('document')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
              viewMode === 'document'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Document</span>
          </button>

          <button
            onClick={() => setViewMode('source')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
              viewMode === 'source'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Source</span>
          </button>
        </div>

        {/* Right: Device Switcher & Actions */}
        <div className="flex items-center gap-1.5">
          {viewMode === 'preview' && currentArtifact.type !== 'svg' && (
            <div className="flex items-center bg-panel rounded-lg p-0.5 border border-border mr-1">
              <button
                onClick={() => setDeviceMode('desktop')}
                className={`p-1 rounded text-xs transition-colors ${
                  deviceMode === 'desktop' ? 'bg-surface-highlight text-purple-600 dark:text-purple-400' : 'text-slate-400 hover:text-slate-700'
                }`}
                title="Desktop View"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setDeviceMode('tablet')}
                className={`p-1 rounded text-xs transition-colors ${
                  deviceMode === 'tablet' ? 'bg-surface-highlight text-purple-600 dark:text-purple-400' : 'text-slate-400 hover:text-slate-700'
                }`}
                title="Tablet View (768px)"
              >
                <Tablet className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setDeviceMode('mobile')}
                className={`p-1 rounded text-xs transition-colors ${
                  deviceMode === 'mobile' ? 'bg-surface-highlight text-purple-600 dark:text-purple-400' : 'text-slate-400 hover:text-slate-700'
                }`}
                title="Mobile View (375px)"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {viewMode === 'preview' && (
            <button
              onClick={handleReload}
              className="p-1 rounded text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-surface-highlight transition-colors"
              title="Reload preview"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-slate-700 dark:text-zinc-300 hover:text-slate-900 hover:bg-surface-highlight border border-border transition-colors"
            title="Copy code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center p-4 bg-slate-100 dark:bg-[#0b0c0e] overflow-auto">
        {/* 1. LIVE PREVIEW MODE (HTML / SVG / Widget) */}
        {viewMode === 'preview' && (
          <div className={`transition-all duration-300 bg-white dark:bg-zinc-900 overflow-hidden flex flex-col ${getContainerWidth()}`}>
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
                sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
                className="w-full h-full border-0 bg-white"
              />
            )}
          </div>
        )}

        {/* 2. RICH DOCUMENT MODE (Markdown / Plans) */}
        {viewMode === 'document' && (
          <div className="w-full h-full max-w-4xl bg-panel rounded-xl border border-border p-6 overflow-y-auto shadow-sm">
            <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-100 mb-2">
              {currentArtifact.title}
            </h1>
            {currentArtifact.description && (
              <p className="text-xs text-slate-500 dark:text-zinc-400 mb-6">
                {currentArtifact.description}
              </p>
            )}
            <div className="prose dark:prose-invert max-w-none text-xs leading-relaxed font-sans text-slate-800 dark:text-zinc-300">
              <pre className="p-4 rounded-lg bg-surface border border-border font-mono whitespace-pre-wrap">
                {currentArtifact.content}
              </pre>
            </div>
          </div>
        )}

        {/* 3. RAW SOURCE CODE MODE */}
        {viewMode === 'source' && (
          <div className="w-full h-full max-w-4xl bg-panel rounded-xl border border-border overflow-hidden flex flex-col shadow-sm">
            <div className="h-8 bg-surface border-b border-border flex items-center justify-between px-3 text-[11px] text-slate-500 font-mono">
              <span>{currentArtifact.title}</span>
              <span>{currentArtifact.content.length} characters</span>
            </div>
            <pre className="flex-1 p-4 overflow-auto font-mono text-xs text-slate-800 dark:text-zinc-300 bg-white dark:bg-[#0e0f14] leading-relaxed whitespace-pre-wrap select-text">
              {currentArtifact.content}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
