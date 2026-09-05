import React, { memo } from 'react';
import {
  FileCode,
  FilePlus,
  FileMinus,
  FileEdit,
  Image as ImageIcon,
  ChevronRight,
  Sparkles,
  Paperclip,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import type { FileDiffItem, ChatFileAttachment } from '../../types';

export interface ArtifactsOverviewProps {
  diffFiles?: FileDiffItem[];
  sources?: ChatFileAttachment[];
  onSelectDiff?: (index: number) => void;
  className?: string;
}

function isImageFile(filePath: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(filePath);
}

function getFileName(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts.pop() || filePath;
}

function getFileDir(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  parts.pop();
  return parts.join('/');
}

export const ArtifactsOverview: React.FC<ArtifactsOverviewProps> = memo(function ArtifactsOverview({
  diffFiles = [],
  sources = [],
  onSelectDiff,
  className = '',
}) {
  const { t } = useI18n();

  return (
    <div className={`flex flex-col h-full w-full bg-background overflow-y-auto p-4 select-none space-y-6 ${className}`}>
      {/* 1. Outputs Section (ChatGPT Style) */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-zinc-200">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            <span>{t('inspector.artifacts.outputs', { count: diffFiles.length })}</span>
          </div>
          {diffFiles.length > 0 && (
            <span className="text-[11px] text-slate-400 dark:text-zinc-500 font-mono">
              {diffFiles.length}
            </span>
          )}
        </div>

        {diffFiles.length === 0 ? (
          <div className="p-3.5 rounded-xl border border-border/70 bg-surface/40 text-xs text-slate-400 dark:text-zinc-500 text-center flex flex-col items-center justify-center gap-1.5 py-6">
            <FileCode className="w-5 h-5 stroke-1 text-slate-300 dark:text-zinc-600" />
            <span>{t('inspector.artifacts.noOutputs')}</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {diffFiles.map((file, idx) => {
              const fileName = file.relativePath || getFileName(file.filePath);
              const fileDir = getFileDir(file.filePath);
              const op = file.op || 'modify';

              return (
                <div
                  key={file.id || `${file.filePath}-${idx}`}
                  onClick={() => onSelectDiff?.(idx)}
                  className="group p-2.5 rounded-xl border border-border/80 bg-surface hover:bg-surface-highlight/70 transition-all duration-150 cursor-pointer flex items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="p-1.5 rounded-lg bg-surface-highlight/80 shrink-0">
                      {op === 'create' ? (
                        <FilePlus className="w-4 h-4 text-emerald-500" />
                      ) : op === 'delete' ? (
                        <FileMinus className="w-4 h-4 text-rose-500" />
                      ) : (
                        <FileEdit className="w-4 h-4 text-blue-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-slate-800 dark:text-zinc-200 truncate group-hover:text-accent transition-colors">
                        {fileName}
                      </div>
                      {fileDir && (
                        <div className="text-[11px] font-mono text-slate-400 dark:text-zinc-500 truncate">
                          {fileDir}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[10.5px] px-1.5 py-0.5 rounded-md font-medium ${
                        file.status === 'accepted'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : file.status === 'rejected'
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {file.status === 'accepted'
                        ? t('inspector.artifacts.statusAccepted')
                        : file.status === 'rejected'
                        ? t('inspector.artifacts.statusRejected')
                        : t('inspector.artifacts.statusPending')}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-zinc-200 transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Sources & Attachments Section */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-zinc-200">
            <Paperclip className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
            <span>{t('inspector.artifacts.sources', { count: sources.length })}</span>
          </div>
          {sources.length > 0 && (
            <span className="text-[11px] text-slate-400 dark:text-zinc-500 font-mono">
              {sources.length}
            </span>
          )}
        </div>

        {sources.length === 0 ? (
          <div className="p-3.5 rounded-xl border border-border/70 bg-surface/40 text-xs text-slate-400 dark:text-zinc-500 text-center flex flex-col items-center justify-center gap-1.5 py-6">
            <Paperclip className="w-5 h-5 stroke-1 text-slate-300 dark:text-zinc-600" />
            <span>{t('inspector.artifacts.noSources')}</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {sources.map((src, idx) => {
              const name = src.name || getFileName(src.path);
              const isImg = isImageFile(src.path);

              return (
                <div
                  key={`${src.path}-${idx}`}
                  className="p-2 rounded-xl border border-border/80 bg-surface hover:bg-surface-highlight/70 transition-all duration-150 flex flex-col gap-1.5 shadow-2xs min-w-0"
                  title={src.path}
                >
                  <div className="h-16 rounded-lg bg-surface-highlight flex items-center justify-center overflow-hidden border border-border/40">
                    {isImg ? (
                      <img
                        src={`file://${src.path}`}
                        alt={name}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <FileCode className="w-6 h-6 text-slate-400" />
                    )}
                    {isImg && (
                      <ImageIcon className="w-6 h-6 text-slate-400 hidden group-has-[img[style*='none']]:block" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-slate-800 dark:text-zinc-200 truncate">
                      {name}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});
