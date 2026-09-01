import React, { useState, KeyboardEvent } from 'react';
import {
  AtSign,
  CornerDownLeft,
} from 'lucide-react';
import { OmpAgentStatus } from '../../types';

interface PromptComposerProps {
  onSendMessage: (prompt: string, contextFiles?: string[]) => void;
  status: OmpAgentStatus;
}

export const PromptComposer: React.FC<PromptComposerProps> = ({
  onSendMessage,
  status,
}) => {
  const [input, setInput] = useState<string>('');
  const [attachedFiles, setAttachedFiles] = useState<string[]>(['src/auth/service.ts']);

  const handleSend = () => {
    if (!input.trim() || status !== 'idle') return;
    onSendMessage(input, attachedFiles);
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const removeAttachment = (file: string) => {
    setAttachedFiles(attachedFiles.filter((f) => f !== file));
  };

  return (
    <div className="p-3 bg-panel border-t border-border flex flex-col gap-2">
      {/* Attached Context Pills */}
      {attachedFiles.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {attachedFiles.map((file) => (
            <span
              key={file}
              className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-purple-50 dark:bg-surface border border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-300 font-medium"
            >
              <AtSign className="w-3 h-3 text-purple-600 dark:text-purple-400" />
              <span>{file}</span>
              <button
                onClick={() => removeAttachment(file)}
                className="ml-1 text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input Box */}
      <div className="relative rounded-xl border border-border focus-within:border-purple-500 bg-white dark:bg-surface/70 focus-within:bg-white dark:focus-within:bg-surface transition-all shadow-xs">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Yêu cầu OMP Agent xử lý code hoặc gõ /plan, /diff..."
          rows={3}
          className="w-full bg-transparent px-3 py-2.5 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 resize-none outline-none font-sans leading-relaxed"
        />

        {/* Toolbar Bottom */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 dark:border-white/[0.04]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (!attachedFiles.includes('src/index.ts')) {
                  setAttachedFiles([...attachedFiles, 'src/index.ts']);
                }
              }}
              className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 px-1.5 py-0.5 rounded hover:bg-surface-highlight transition-colors font-medium"
              title="Thêm file context (@file)"
            >
              <AtSign className="w-3 h-3" />
              <span>Attach File</span>
            </button>
          </div>

          <button
            onClick={handleSend}
            disabled={!input.trim() || status !== 'idle'}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              input.trim() && status === 'idle'
                ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-500/20'
                : 'bg-slate-200 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500 cursor-not-allowed'
            }`}
          >
            <span>Send</span>
            <CornerDownLeft className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
