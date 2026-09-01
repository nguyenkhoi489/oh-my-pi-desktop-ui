import React, { useState, KeyboardEvent } from 'react';
import {
  AtSign,
  CornerDownLeft,
  X,
  Paperclip,
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
    <div className="p-3.5 bg-panel border-t border-border flex flex-col gap-2.5">
      {/* Attached Context Pills */}
      {attachedFiles.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {attachedFiles.map((file) => (
            <span
              key={file}
              className="flex items-center gap-1.5 text-[11.5px] font-mono px-2.5 py-1 rounded-lg bg-surface border border-border text-slate-800 dark:text-zinc-200 font-medium"
            >
              <AtSign className="w-3.5 h-3.5 text-codex-accent" />
              <span>{file}</span>
              <button
                onClick={() => removeAttachment(file)}
                className="ml-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input Box */}
      <div className="relative rounded-2xl border border-border focus-within:border-codex-accent bg-surface/50 dark:bg-[#14161f] focus-within:bg-surface dark:focus-within:bg-[#181a24] transition-all shadow-xs p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Yêu cầu OMP Agent xử lý code hoặc gõ /plan, /diff..."
          rows={3}
          className="w-full bg-transparent text-[13.5px] text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 resize-none outline-none font-sans leading-relaxed"
        />

        {/* Toolbar Bottom */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50 mt-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (!attachedFiles.includes('src/index.ts')) {
                  setAttachedFiles([...attachedFiles, 'src/index.ts']);
                }
              }}
              className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 px-2 py-1 rounded-md hover:bg-surface-highlight transition-colors font-medium cursor-pointer"
              title="Thêm file context (@file)"
            >
              <Paperclip className="w-3.5 h-3.5" />
              <span>Attach</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 dark:text-zinc-500 hidden sm:inline">
              ↵ send
            </span>
            <button
              onClick={handleSend}
              disabled={!input.trim() || status !== 'idle'}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                input.trim() && status === 'idle'
                  ? 'bg-codex-accent hover:bg-codex-accent-hover text-white shadow-sm'
                  : 'bg-surface-highlight text-slate-400 dark:text-zinc-500 cursor-not-allowed'
              }`}
            >
              <span>Send</span>
              <CornerDownLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
