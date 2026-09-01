import React, { useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import {
  Check,
  X,
  FileCode,
  Split,
  FileCheck2,
  AlertCircle,
} from 'lucide-react';
import { FileDiffItem, ThemeMode } from '../../types';

interface DiffViewerProps {
  diff: FileDiffItem | null;
  onAccept: () => void;
  onReject: () => void;
  theme?: ThemeMode;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  diff,
  onAccept,
  onReject,
  theme = 'light',
}) => {
  const [isSideBySide, setIsSideBySide] = useState<boolean>(true);

  if (!diff) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-zinc-500 bg-background">
        <div className="w-14 h-14 rounded-2xl bg-surface border border-border flex items-center justify-center mb-4">
          <FileCode className="w-7 h-7 text-slate-400 dark:text-zinc-500 stroke-[1.5]" />
        </div>
        <div className="text-sm font-semibold text-slate-800 dark:text-zinc-300">Không có thay đổi code nào đang chờ review</div>
        <div className="text-xs text-slate-500 dark:text-zinc-500 mt-1.5 max-w-md leading-relaxed">
          Khi OMP Agent sinh ra các bản vá code (hash-anchored patches), bạn sẽ thấy diff trực quan hiển thị tại đây để duyệt trước khi ghi file.
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      {/* Diff Top Control Bar */}
      <div className="h-11 bg-surface border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <FileCode className="w-4 h-4 text-codex-accent" />
          <span className="font-mono text-xs text-slate-800 dark:text-zinc-200 font-semibold">
            {diff.relativePath}
          </span>
          <div className="flex items-center gap-1.5 ml-1.5 text-[11px] font-mono">
            <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md font-semibold">
              +{diff.additions}
            </span>
            <span className="text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md font-semibold">
              -{diff.deletions}
            </span>
          </div>

          {diff.status === 'accepted' && (
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-md font-medium">
              <FileCheck2 className="w-3.5 h-3.5" />
              Đã chấp nhận
            </span>
          )}
          {diff.status === 'rejected' && (
            <span className="flex items-center gap-1.5 text-[11px] text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-md font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              Đã từ chối
            </span>
          )}
        </div>

        {/* Action Buttons: Accept / Reject / Toggle View */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSideBySide(!isSideBySide)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-700 dark:text-zinc-300 hover:bg-surface-highlight border border-border transition-colors font-medium cursor-pointer"
            title="Chuyển chế độ Side-by-side / Inline Diff"
          >
            <Split className="w-3.5 h-3.5" />
            <span>{isSideBySide ? 'Side by Side' : 'Inline'}</span>
          </button>

          {diff.status === 'pending' && (
            <>
              <button
                onClick={onReject}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 transition-colors cursor-pointer"
                title="Từ chối thay đổi"
              >
                <X className="w-3.5 h-3.5" />
                <span>Discard</span>
              </button>

              <button
                onClick={onAccept}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-codex-accent hover:bg-codex-accent-hover text-white shadow-sm transition-all cursor-pointer"
                title="Chấp nhận thay đổi (⌘↵)"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Accept Changes</span>
                <kbd className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded ml-1">⌘↵</kbd>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Monaco Diff Editor with dynamic theme */}
      <div className="flex-1 min-h-0 relative">
        <DiffEditor
          height="100%"
          language="typescript"
          original={diff.originalContent}
          modified={diff.modifiedContent}
          theme={theme === 'dark' ? 'vs-dark' : 'vs'}
          options={{
            readOnly: true,
            renderSideBySide: isSideBySide,
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: 'JetBrains Mono, SF Mono, Menlo, Monaco, monospace',
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            diffWordWrap: 'off',
          }}
        />
      </div>
    </div>
  );
};
