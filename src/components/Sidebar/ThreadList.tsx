import React from 'react';
import { MessageSquare, Plus } from 'lucide-react';

interface ThreadListProps {
  onNewThread?: () => void;
}

export const ThreadList: React.FC<ThreadListProps> = ({ onNewThread }) => {
  const demoThreads = [
    { id: '1', title: 'Hoàn thiện hàm validateUser JWT', active: true, time: '2m trước' },
    { id: '2', title: 'Refactor cấu trúc auth middleware', active: false, time: '1h trước' },
    { id: '3', title: 'Sửa lỗi build Vite + TypeScript', active: false, time: 'Hôm qua' },
  ];

  return (
    <div className="flex flex-col border-t border-border p-2.5 bg-panel shrink-0">
      <div className="flex items-center justify-between px-1.5 py-1 mb-1.5 text-[11px] font-bold text-slate-400 dark:text-zinc-500 tracking-wider uppercase">
        <span>Recent Sessions</span>
        <button
          onClick={onNewThread}
          className="p-1 rounded-md hover:bg-surface-highlight text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
          title="Tạo phiên mới"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-1">
        {demoThreads.map((thread) => (
          <div
            key={thread.id}
            className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-colors ${
              thread.active
                ? 'bg-surface border border-border text-slate-900 dark:text-zinc-100 shadow-xs'
                : 'text-slate-700 dark:text-zinc-400 hover:bg-surface hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <MessageSquare
              className={`w-4 h-4 mt-0.5 shrink-0 ${
                thread.active ? 'text-codex-accent' : 'text-slate-400 dark:text-zinc-500'
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate text-[12.5px] leading-tight">
                {thread.title}
              </div>
              <div className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
                {thread.time}
              </div>
            </div>
            {thread.active && (
              <span className="w-1.5 h-1.5 rounded-full bg-codex-accent shrink-0 mt-1.5" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
