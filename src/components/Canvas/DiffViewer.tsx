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
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-zinc-500">
        <FileCode className="w-12 h-12 mb-3 text-slate-300 dark:text-zinc-600 stroke-[1.5]" />
        <div className="text-sm font-medium text-slate-700 dark:text-zinc-400">Không có thay đổi code nào đang chờ review</div>
        <div className="text-xs text-slate-500 dark:text-zinc-600 mt-1 max-w-sm">
          Khi OMP Agent sinh ra các bản vá code (hash-anchored patches), bạn sẽ thấy diff trực quan hiển thị tại đây.
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      {/* Diff Top Control Bar */}
      <div className="h-10 bg-surface border-b border-border flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          <span className="font-mono text-xs text-slate-800 dark:text-zinc-200 font-semibold">
            {diff.relativePath}
          </span>
          <div className="flex items-center gap-1.5 ml-2 text-[11px] font-mono">
            <span className="text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 font-semibold">
              +{diff.additions}
            </span>
            <span className="text-rose-700 dark:text-red-400 bg-rose-500/10 px-1.5 py-0.2 rounded border border-rose-500/20 font-semibold">
              -{diff.deletions}
            </span>
          </div>

          {diff.status === 'accepted' && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-500/30 font-medium">
              <FileCheck2 className="w-3 h-3" />
              Đã chấp nhận
            </span>
          )}
          {diff.status === 'rejected' && (
            <span className="flex items-center gap-1 text-[11px] text-rose-700 dark:text-red-400 bg-rose-50 dark:bg-red-950/60 px-2 py-0.5 rounded border border-rose-300 dark:border-red-500/30 font-medium">
              <AlertCircle className="w-3 h-3" />
              Đã từ chối
            </span>
          )}
        </div>

        {/* Action Buttons: Accept / Reject / Toggle View */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSideBySide(!isSideBySide)}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-surface-highlight border border-border transition-colors font-medium"
            title="Chuyển chế độ Side-by-side / Inline Diff"
          >
            <Split className="w-3.5 h-3.5" />
            <span>{isSideBySide ? 'Split' : 'Inline'}</span>
          </button>

          {diff.status === 'pending' && (
            <>
              <button
                onClick={onReject}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-red-400 border border-rose-500/30 transition-colors"
                title="Từ chối thay đổi"
              >
                <X className="w-3.5 h-3.5" />
                <span>Discard</span>
              </button>

              <button
                onClick={onAccept}
                className="flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-sm hover:shadow-purple-500/25 transition-all"
                title="Chấp nhận thay đổi (⌘↵)"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Accept Changes (⌘↵)</span>
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
            fontSize: 12.5,
            fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
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
