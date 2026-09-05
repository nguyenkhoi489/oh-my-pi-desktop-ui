import React, { useState } from 'react';
import {
  Terminal,
  CheckCircle2,
  XCircle,
  RotateCw,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Globe,
  ExternalLink,
  Eye,
} from 'lucide-react';
import { ToolCall } from '../../types';
import { AttachmentImage } from '../Common/AttachmentImage';
import { ImageLightboxModal } from './ImageLightboxModal';
import { useI18n } from '../../i18n/I18nProvider';

interface ToolCallCardProps {
  toolCall: ToolCall;
  onOpenBrowser?: (url: string) => void;
}

function extractBrowserMeta(toolCall: ToolCall) {
  const isDirectBrowser = toolCall.name === 'browser';
  const isXdBrowser = toolCall.name === 'write' && toolCall.params?.path === 'xd://browser';
  const isXdDevice =
    toolCall.name === 'write' &&
    typeof toolCall.params?.path === 'string' &&
    toolCall.params.path.startsWith('xd://');

  let browserAction: string | null = null;
  let browserUrl: string | null = null;

  if (isDirectBrowser && toolCall.params) {
    browserAction = typeof toolCall.params.action === 'string' ? toolCall.params.action : null;
    browserUrl = typeof toolCall.params.url === 'string' ? toolCall.params.url : null;
  } else if (isXdBrowser && toolCall.params?.content) {
    try {
      const parsed =
        typeof toolCall.params.content === 'string'
          ? JSON.parse(toolCall.params.content)
          : toolCall.params.content;
      if (parsed && typeof parsed === 'object') {
        const record = parsed as Record<string, unknown>;
        browserAction = typeof record.action === 'string' ? record.action : null;
        browserUrl = typeof record.url === 'string' ? record.url : null;
      }
    } catch {
      // Ignore JSON parse error
    }
  }

  return {
    isBrowser: isDirectBrowser || isXdBrowser,
    isXdDevice,
    deviceName: isXdDevice ? (toolCall.params?.path as string).replace('xd://', '') : null,
    browserAction,
    browserUrl,
  };
}

function extractScreenshotUrl(toolCall: ToolCall): string | null {
  const result: unknown = toolCall.result;
  if (!result) return null;

  if (typeof result === 'object') {
    const record = result as Record<string, unknown>;
    if (typeof record.screenshot === 'string') return record.screenshot;
    if (typeof record.image === 'string') return record.image;
    if (
      typeof record.path === 'string' &&
      /\.(png|jpe?g|webp|svg)$/i.test(record.path)
    ) {
      return record.path;
    }

    if (Array.isArray(record.content)) {
      for (const item of record.content) {
        if (!item || typeof item !== 'object') continue;
        const itemRecord = item as Record<string, unknown>;
        if (itemRecord.type === 'image' && typeof itemRecord.data === 'string') {
          const mime = typeof itemRecord.mimeType === 'string' ? itemRecord.mimeType : 'image/png';
          return itemRecord.data.startsWith('data:')
            ? itemRecord.data
            : `data:${mime};base64,${itemRecord.data}`;
        }
        if (typeof itemRecord.text === 'string') {
          const match = itemRecord.text.match(
            /(?:data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+|(?:(?:\/|[a-zA-Z]:\\|\.omp\/|\.\/)[^\s"']+\.(?:png|jpe?g|webp|svg)))/i
          );
          if (match) return match[0];
        }
      }
    }
  }

  if (typeof result === 'string') {
    const match = result.match(
      /(?:data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+|(?:(?:\/|[a-zA-Z]:\\|\.omp\/|\.\/)[^\s"']+\.(?:png|jpe?g|webp|svg)))/i
    );
    if (match) return match[0];
  }

  return null;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ toolCall, onOpenBrowser }) => {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);

  const browserMeta = extractBrowserMeta(toolCall);
  const screenshotUrl = extractScreenshotUrl(toolCall);

  const getStatusIcon = () => {
    switch (toolCall.status) {
      case 'running':
        return <RotateCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="w-3.5 h-3.5 text-codex-accent" />;
      case 'failed':
        return <XCircle className="w-3.5 h-3.5 text-rose-500" />;
      case 'requires_permission':
        return <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />;
      default:
        if (browserMeta.isBrowser) {
          return <Globe className="w-3.5 h-3.5 text-blue-500" />;
        }
        return <Terminal className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400" />;
    }
  };

  const toolDisplayName = browserMeta.isBrowser
    ? 'browser'
    : browserMeta.deviceName
    ? `xd:${browserMeta.deviceName}`
    : toolCall.name;

  const toolBadge = browserMeta.isBrowser
    ? t('agentPanel.toolCard.browserDevice')
    : browserMeta.isXdDevice
    ? 'device'
    : 'tool';

  return (
    <>
      <div className="my-1.5 rounded-xl border border-border bg-surface/70 dark:bg-[#14161f] overflow-hidden shadow-xs transition-all">
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-between px-3.5 py-2 hover:bg-surface-highlight cursor-pointer select-none transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            {getStatusIcon()}
            {browserMeta.isBrowser ? (
              <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            ) : null}
            <span className="font-mono font-medium text-[12.5px] text-slate-800 dark:text-zinc-200 truncate">
              {toolDisplayName}
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-highlight text-slate-600 dark:text-zinc-400 font-mono">
              {toolBadge}
            </span>
            {browserMeta.browserAction && (
              <span className="text-[10.5px] px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono">
                {browserMeta.browserAction}
              </span>
            )}
            {browserMeta.browserUrl && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  if (browserMeta.browserUrl) {
                    onOpenBrowser?.(browserMeta.browserUrl);
                    window.dispatchEvent(
                      new CustomEvent('omp:open-in-app-browser', { detail: { url: browserMeta.browserUrl } })
                    );
                  }
                }}
                className="text-[11px] text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300 truncate max-w-[160px] font-mono cursor-pointer"
                title={browserMeta.browserUrl}
              >
                {browserMeta.browserUrl}
              </span>
            )}
            {screenshotUrl && (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono">
                <Eye className="w-2.5 h-2.5" />
                preview
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {toolCall.endTime && toolCall.startTime && (
              <span className="text-[11px] text-slate-400 dark:text-zinc-500 font-mono">
                {((toolCall.endTime - toolCall.startTime) / 1000).toFixed(1)}s
              </span>
            )}
            <button className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200">
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Inline Screenshot Preview if available */}
        {screenshotUrl && (
          <div className="px-3.5 pb-2 pt-0.5">
            <div
              onClick={(e) => {
                e.stopPropagation();
                setLightboxOpen(true);
              }}
              className="group relative rounded-lg border border-border/80 bg-black/10 dark:bg-black/40 overflow-hidden cursor-zoom-in transition-all hover:border-blue-500/50 hover:shadow-md"
            >
              <div className="flex items-center justify-between px-2.5 py-1 text-[10.5px] bg-panel/90 border-b border-border/60 text-slate-500 dark:text-zinc-400">
                <span className="flex items-center gap-1.5 font-sans font-medium">
                  <Globe className="w-3 h-3 text-blue-500" />
                  {t('agentPanel.toolCard.screenshotPreview')}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Eye className="w-3 h-3" />
                  <ExternalLink className="w-2.5 h-2.5" />
                </span>
              </div>
              <div className="max-h-56 overflow-hidden flex items-center justify-center p-1 bg-surface-highlight/30">
                <AttachmentImage
                  src={screenshotUrl}
                  alt={t('agentPanel.toolCard.screenshotPreview')}
                  className="w-full object-contain max-h-52 rounded transition-transform group-hover:scale-[1.01]"
                />
              </div>
            </div>
          </div>
        )}

        {isExpanded && (
          <div className="p-3.5 border-t border-border bg-panel/80 font-mono text-[12px] space-y-2.5">
            <div>
              <div className="text-slate-400 dark:text-zinc-500 mb-1 font-semibold uppercase text-[10px] tracking-wider">
                Parameters:
              </div>
              <pre className="p-2.5 rounded-lg bg-background text-slate-800 dark:text-zinc-200 border border-border overflow-x-auto text-[11.5px]">
                {JSON.stringify(toolCall.params, null, 2)}
              </pre>
            </div>

            {toolCall.result && (
              <div>
                <div className="text-slate-400 dark:text-zinc-500 mb-1 font-semibold uppercase text-[10px] tracking-wider">
                  Result:
                </div>
                <pre className="p-2.5 rounded-lg bg-background text-emerald-600 dark:text-emerald-400 border border-border overflow-x-auto text-[11.5px]">
                  {JSON.stringify(toolCall.result, null, 2)}
                </pre>
              </div>
            )}

            {toolCall.error && (
              <div>
                <div className="text-rose-500 mb-1 font-semibold uppercase text-[10px] tracking-wider">
                  Error:
                </div>
                <pre className="p-2.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 overflow-x-auto text-[11.5px]">
                  {toolCall.error}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {screenshotUrl && (
        <ImageLightboxModal
          isOpen={lightboxOpen}
          imageUrl={screenshotUrl}
          imageName={browserMeta.browserUrl || t('agentPanel.toolCard.screenshotPreview')}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
};
