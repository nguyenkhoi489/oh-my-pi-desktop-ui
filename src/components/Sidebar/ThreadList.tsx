import React from 'react';
import { MessageSquare, Plus, CheckCircle2 } from 'lucide-react';

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
    <div className="flex flex-col border-t border-border p-2">
      <div className="flex items-center justify-between px-1 py-1 mb-1 text-[11px] font-semibold text-slate-400 dark:text-zinc-500 tracking-wider uppercase">
        <span>Sessions / Tasks</span>
        <button
          onClick={onNewThread}
          className="p-0.5 rounded hover:bg-surface-highlight text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
          title="Tạo phiên mới"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-1">
        {demoThreads.map((thread) => (
          <div
            key={thread.id}
            className={`flex items-start gap-2 p-2 rounded-md cursor-pointer transition-colors text-xs ${
              thread.active
                ? 'bg-surface border border-purple-300 dark:border-purple-500/30 text-slate-900 dark:text-zinc-200 shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-surface-highlight hover:text-slate-900 dark:hover:text-zinc-300'
            }`}
          >
            <MessageSquare className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${thread.active ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400 dark:text-zinc-500'}`} />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate text-[11px]">{thread.title}</div>
              <div className="text-[10px] text-slate-400 dark:text-zinc-500">{thread.time}</div>
            </div>
            {thread.active && <CheckCircle2 className="w-3 h-3 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />}
          </div>
        ))}
      </div>
    </div>
  );
};
