import React, { useState, useEffect, useCallback } from 'react';
import {
  FileDiff,
  Code2,
  Globe,
  Terminal as TermIcon,
  GitCommit,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { ActiveCanvasTab, FileDiffItem, WorkspaceFile, ThemeMode, OmpModelInfo } from '../../types';
import { DiffViewer } from './DiffViewer';
import { CodeEditor } from './CodeEditor';
import { TerminalView } from './TerminalView';
import { CommitView } from './CommitView';
import { BrowserPanel } from '../Inspector/BrowserPanel';
import { toFileUrl } from '../../utils/urlHelper';
import { isHtmlFile } from '../../utils/fileLanguage';
interface CanvasContainerProps {
  activeTab: ActiveCanvasTab;
  onSelectTab: (tab: ActiveCanvasTab) => void;
  diff: FileDiffItem | null;
  onAcceptDiff: () => void;
  onRejectDiff: () => void;
  selectedFile: WorkspaceFile | null;
  fileContent: string;
  theme?: ThemeMode;
  onSaveFile?: (filePath: string, content: string) => Promise<boolean>;
  onDirtyChange?: (dirty: boolean) => void;
  onDraftChange?: (draft: string) => void;
  workspacePath?: string;
  availableModels?: OmpModelInfo[];
  selectedModel?: OmpModelInfo | string | null;
  onCommitSuccess?: () => void;
  onOpenCommitModal?: () => void;
  isCommitDisabled?: boolean;
}

export const CanvasContainer: React.FC<CanvasContainerProps> = ({
  activeTab,
  onSelectTab,
  diff,
  onAcceptDiff,
  onRejectDiff,
  selectedFile,
  fileContent,
  theme = 'light',
  onSaveFile,
  onDirtyChange,
  onDraftChange,
  workspacePath,
  availableModels = [],
  selectedModel,
  onCommitSuccess,
  isCommitDisabled,
}) => {
  const { t } = useI18n();
  const [hasVisitedBrowser, setHasVisitedBrowser] = useState<boolean>(activeTab === 'browser');
  const [previewNonce, setPreviewNonce] = useState<number>(0);

  useEffect(() => {
    if (activeTab === 'browser') {
      setHasVisitedBrowser(true);
      setPreviewNonce((prev) => prev + 1);
    }
  }, [activeTab]);

  const handleOpenLivePreview = useCallback(() => {
    setHasVisitedBrowser(true);
    setPreviewNonce((prev) => prev + 1);
    onSelectTab('browser');
  }, [onSelectTab]);

  const previewUrl = selectedFile?.path && isHtmlFile(selectedFile.path)
    ? toFileUrl(selectedFile.path)
    : undefined;

  return (
    <div className="flex-1 flex flex-col h-full bg-background border-r border-border overflow-hidden">
      {/* Codex Canvas Tab Bar */}
      <div className="h-10 bg-panel border-b border-border flex items-center px-3 gap-1 select-none shrink-0">
        <button
          onClick={() => onSelectTab('diff')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'diff'
              ? 'bg-surface text-slate-900 dark:text-zinc-100 font-semibold border border-border shadow-xs'
              : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-surface/60'
          }`}
        >
          <FileDiff className={`w-3.5 h-3.5 ${activeTab === 'diff' ? 'text-codex-accent' : 'text-slate-500 dark:text-zinc-400'}`} />
          <span>Visual Diff</span>
          {diff && diff.status === 'pending' && (
            <span className="w-2 h-2 rounded-full bg-codex-accent animate-pulse ml-0.5" />
          )}
        </button>

        <button
          onClick={() => onSelectTab('editor')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'editor'
              ? 'bg-surface text-slate-900 dark:text-zinc-100 font-semibold border border-border shadow-xs'
              : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-surface/60'
          }`}
        >
          <Code2 className={`w-3.5 h-3.5 ${activeTab === 'editor' ? 'text-blue-500 dark:text-blue-400' : 'text-slate-500 dark:text-zinc-400'}`} />
          <span>Code Editor</span>
        </button>

        <button
          onClick={() => onSelectTab('browser')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'browser'
              ? 'bg-surface text-slate-900 dark:text-zinc-100 font-semibold border border-border shadow-xs'
              : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-surface/60'
          }`}
        >
          <Globe className={`w-3.5 h-3.5 ${activeTab === 'browser' ? 'text-amber-500 dark:text-amber-400' : 'text-slate-500 dark:text-zinc-400'}`} />
          <span>{t('canvas.browserTab')}</span>
        </button>

        <button
          onClick={() => onSelectTab('terminal')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'terminal'
              ? 'bg-surface text-slate-900 dark:text-zinc-100 font-semibold border border-border shadow-xs'
              : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-surface/60'
          }`}
        >
          <TermIcon className={`w-3.5 h-3.5 ${activeTab === 'terminal' ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-500 dark:text-zinc-400'}`} />
          <span>Terminal Logs</span>
        </button>

        <button
          onClick={() => onSelectTab('commit')}
          disabled={isCommitDisabled}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            isCommitDisabled
              ? 'opacity-40 cursor-not-allowed text-slate-400 dark:text-zinc-600'
              : activeTab === 'commit'
              ? 'bg-surface text-slate-900 dark:text-zinc-100 font-semibold border border-border shadow-xs'
              : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-surface/60'
          }`}
          title={t('header.commitAssistantTooltip')}
        >
          <GitCommit className={`w-3.5 h-3.5 ${activeTab === 'commit' ? 'text-codex-accent' : 'text-slate-500 dark:text-zinc-400'}`} />
          <span>Commit Assistant</span>
        </button>
      </div>

      {/* Main Canvas View */}
      <div className="flex-1 min-h-0 flex flex-col">
        {activeTab === 'diff' && (
          <DiffViewer
            diff={diff}
            onAccept={onAcceptDiff}
            onReject={onRejectDiff}
            theme={theme}
          />
        )}

        {activeTab === 'editor' && (
          <CodeEditor
            file={selectedFile}
            content={fileContent}
            theme={theme}
            onSaveFile={onSaveFile}
            onDirtyChange={onDirtyChange}
            onDraftChange={onDraftChange}
            onOpenLivePreview={handleOpenLivePreview}
          />
        )}

        {hasVisitedBrowser && (
          <div className={`flex-1 min-h-0 ${activeTab === 'browser' ? 'flex flex-col' : 'hidden'}`}>
            <BrowserPanel
              initialUrl={previewUrl}
              urlNonce={previewNonce}
              partition="persist:omp-agent-preview"
            />
          </div>
        )}

        {activeTab === 'terminal' && (
          <TerminalView theme={theme} />
        )}

        {activeTab === 'commit' && (
          <CommitView
            workspacePath={workspacePath}
            availableModels={availableModels}
            selectedModel={selectedModel}
            onCommitSuccess={onCommitSuccess}
          />
        )}
      </div>
    </div>
  );
};
