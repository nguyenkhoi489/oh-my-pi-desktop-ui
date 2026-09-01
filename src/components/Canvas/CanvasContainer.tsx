import React from 'react';
import {
  FileDiff,
  Code2,
  BookOpen,
  Terminal as TermIcon,
} from 'lucide-react';
import { ActiveCanvasTab, FileDiffItem, WorkspaceFile, ThemeMode } from '../../types';
import { DiffViewer } from './DiffViewer';
import { CodeEditor } from './CodeEditor';
import { ArtifactViewer } from './ArtifactViewer';
import { TerminalView } from './TerminalView';

interface CanvasContainerProps {
  activeTab: ActiveCanvasTab;
  onSelectTab: (tab: ActiveCanvasTab) => void;
  diff: FileDiffItem | null;
  onAcceptDiff: () => void;
  onRejectDiff: () => void;
  selectedFile: WorkspaceFile | null;
  fileContent: string;
  theme?: ThemeMode;
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
}) => {
  return (
    <div className="flex-1 flex flex-col h-full bg-background border-r border-border overflow-hidden">
      {/* Antigravity Canvas Tab Bar */}
      <div className="h-9 bg-panel border-b border-border flex items-center px-2 gap-1 select-none shrink-0">
        <button
          onClick={() => onSelectTab('diff')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
            activeTab === 'diff'
              ? 'bg-surface text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-500/30 shadow-xs'
              : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-surface/50'
          }`}
        >
          <FileDiff className="w-3.5 h-3.5" />
          <span>Visual Diff</span>
          {diff && diff.status === 'pending' && (
            <span className="w-2 h-2 rounded-full bg-purple-600 dark:bg-purple-500 animate-pulse ml-0.5" />
          )}
        </button>

        <button
          onClick={() => onSelectTab('editor')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
            activeTab === 'editor'
              ? 'bg-surface text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-500/30 shadow-xs'
              : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-surface/50'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>Editor</span>
        </button>

        <button
          onClick={() => onSelectTab('artifact')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
            activeTab === 'artifact'
              ? 'bg-surface text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30 shadow-xs'
              : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-surface/50'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Artifacts / Plan</span>
        </button>

        <button
          onClick={() => onSelectTab('terminal')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
            activeTab === 'terminal'
              ? 'bg-surface text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30 shadow-xs'
              : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-surface/50'
          }`}
        >
          <TermIcon className="w-3.5 h-3.5" />
          <span>Terminal Logs</span>
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
          />
        )}

        {activeTab === 'artifact' && (
          <ArtifactViewer theme={theme} />
        )}

        {activeTab === 'terminal' && (
          <TerminalView theme={theme} />
        )}
      </div>
    </div>
  );
};
