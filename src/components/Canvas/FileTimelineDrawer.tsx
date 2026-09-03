import React, { useState, useEffect } from 'react';
import { GitCommit, Clock, User, X, Loader2, AlertCircle } from 'lucide-react';
import { WorkspaceFile, GitCommitSummary, ThemeMode } from '../../types';
import { useI18n } from '../../i18n/I18nProvider';

interface FileTimelineDrawerProps {
  file: WorkspaceFile;
  selectedCommitHash: string | null;
  onSelectCommit: (commit: GitCommitSummary) => void;
  onClose: () => void;
  theme?: ThemeMode;
}

export const FileTimelineDrawer: React.FC<FileTimelineDrawerProps> = ({
  file,
  selectedCommitHash,
  onSelectCommit,
  onClose,
}) => {
  const { t } = useI18n();
  const [commits, setCommits] = useState<GitCommitSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    const fetchHistory = async () => {
      if (window.electronAPI?.getFileHistory) {
        try {
          const res = await window.electronAPI.getFileHistory(file.path);
          if (!isMounted) return;
          if (res.success && res.commits) {
            setCommits(res.commits);
          } else {
            setCommits([]);
            if (res.error) {
              setError(res.error);
            }
          }
        } catch (err: any) {
          if (!isMounted) return;
          console.error('[FileTimelineDrawer] Failed to fetch git history:', err);
          setError(err?.message || 'Error');
          setCommits([]);
        } finally {
          if (isMounted) setIsLoading(false);
        }
      } else {
        // Fallback in browser preview
        if (isMounted) {
          setCommits([
            {
              hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
              shortHash: 'a1b2c3d',
              author: 'Developer',
              date: '2 hours ago',
              message: 'feat: add initial implementation',
            },
            {
              hash: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
              shortHash: 'b2c3d4e',
              author: 'Developer',
              date: 'yesterday',
              message: 'docs: update comments and types',
            },
          ]);
          setIsLoading(false);
        }
      }
    };

    fetchHistory();

    return () => {
      isMounted = false;
    };
  }, [file.path]);

  return (
    <div className="w-80 h-full bg-surface border-l border-border flex flex-col shrink-0 select-none overflow-hidden animate-in slide-in-from-right-4 duration-150">
      {/* Drawer Header */}
      <div className="h-11 bg-panel border-b border-border flex items-center justify-between px-3.5 shrink-0">
        <div className="flex items-center gap-2">
          <GitCommit className="w-4 h-4 text-codex-accent shrink-0" />
          <span className="text-xs font-semibold text-slate-800 dark:text-zinc-100">
            {t('editor.timeline')}
          </span>
          {commits.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-surface text-slate-500 dark:text-zinc-400 border border-border">
              {commits.length}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-surface transition-colors cursor-pointer"
          title={t('editor.closeTimeline')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-zinc-500">
            <Loader2 className="w-6 h-6 animate-spin mb-2 text-codex-accent" />
            <span className="text-xs">{t('editor.loadingTimeline')}</span>
          </div>
        ) : error && commits.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400 dark:text-zinc-500">
            <AlertCircle className="w-6 h-6 mb-2 text-amber-500" />
            <span className="text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
              {t('editor.noGitHistory')}
            </span>
            <span className="text-[11px] text-slate-400 dark:text-zinc-500">
              {error}
            </span>
          </div>
        ) : commits.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-zinc-500">
            <GitCommit className="w-7 h-7 mb-2 text-slate-300 dark:text-zinc-600" />
            <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">
              {t('editor.noGitHistory')}
            </span>
          </div>
        ) : (
          commits.map((commit) => {
            const isSelected = selectedCommitHash === commit.hash;
            return (
              <div
                key={commit.hash}
                onClick={() => onSelectCommit(commit)}
                className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-codex-accent/10 border-codex-accent text-slate-900 dark:text-zinc-100 shadow-xs'
                    : 'bg-background hover:bg-panel border-border text-slate-700 dark:text-zinc-300'
                }`}
              >
                {/* Commit Message */}
                <div className="text-xs font-medium line-clamp-2 leading-relaxed mb-2">
                  {commit.message}
                </div>

                {/* Meta info */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="bg-surface px-1.5 py-0.5 rounded-sm border border-border font-semibold text-codex-accent">
                      {commit.shortHash}
                    </span>
                    <span className="flex items-center gap-1 max-w-[100px] truncate text-[10.5px]">
                      <User className="w-3 h-3 shrink-0" />
                      {commit.author}
                    </span>
                  </div>
                  <span className="flex items-center gap-1 text-[10.5px]">
                    <Clock className="w-3 h-3 shrink-0" />
                    {commit.date}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
