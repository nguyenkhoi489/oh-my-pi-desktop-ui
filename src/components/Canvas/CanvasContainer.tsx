import React from 'react';
import {
  FileDiff,
  Code2,
  BookOpen,
  Terminal as TermIcon,
} from 'lucide-react';
import { ActiveCanvasTab, FileDiffItem, WorkspaceFile, ThemeMode, ArtifactDocument } from '../../types';
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
  artifacts?: ArtifactDocument[];
  selectedArtifactId?: string;
  onSelectArtifact?: (id: string) => void;
  onReloadArtifact?: (id?: string) => void;
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
  artifacts,
  selectedArtifactId,
  onSelectArtifact,
  onReloadArtifact,
}) => {
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
          onClick={() => onSelectTab('artifact')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'artifact'
              ? 'bg-surface text-slate-900 dark:text-zinc-100 font-semibold border border-border shadow-xs'
              : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-surface/60'
          }`}
        >
          <BookOpen className={`w-3.5 h-3.5 ${activeTab === 'artifact' ? 'text-amber-500 dark:text-amber-400' : 'text-slate-500 dark:text-zinc-400'}`} />
          <span>Artifacts & Plan</span>
          {artifacts && artifacts.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400">
              {artifacts.length}
            </span>
          )}
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
          <ArtifactViewer
            artifacts={artifacts}
            selectedArtifactId={selectedArtifactId}
            onSelectArtifact={onSelectArtifact}
            onReloadArtifact={onReloadArtifact}
            theme={theme}
          />
        )}

        {activeTab === 'terminal' && (
          <TerminalView theme={theme} />
        )}
      </div>
    </div>
  );
};
