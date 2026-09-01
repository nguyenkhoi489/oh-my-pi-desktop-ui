import React from 'react';
import { MessageSquare, Plus } from 'lucide-react';
import { OmpSessionInfo, OmpAgentStatus } from '../../types';

export function formatRelativeTime(dateInput?: string | number | Date): string {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (isNaN(diffMs)) return '';

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Vừa xong';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m trước`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h trước`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return 'Hôm qua';
  if (diffDay < 7) return `${diffDay}d trước`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface ThreadListProps {
  sessions?: OmpSessionInfo[];
  activeSessionPath?: string | null;
  status?: OmpAgentStatus;
  onSelectSession?: (path: string) => void;
  onNewThread?: () => void;
}

export const ThreadList: React.FC<ThreadListProps> = ({
  sessions = [],
  activeSessionPath = null,
  status = 'idle',
  onSelectSession,
  onNewThread,
}) => {
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI);
  const isBusy = status !== 'idle';

  const demoThreads = [
    { id: '1', title: 'Hoàn thiện hàm validateUser JWT', active: true, time: '2m trước' },
    { id: '2', title: 'Refactor cấu trúc auth middleware', active: false, time: '1h trước' },
    { id: '3', title: 'Sửa lỗi build Vite + TypeScript', active: false, time: 'Hôm qua' },
  ];

  const renderDemoFallback = !isElectron && sessions.length === 0;

  return (
    <div className="flex flex-col border-t border-border p-2.5 bg-panel shrink-0 max-h-[40%] overflow-hidden">
      <div className="flex items-center justify-between px-1.5 py-1 mb-1.5 text-[11px] font-bold text-slate-400 dark:text-zinc-500 tracking-wider uppercase shrink-0">
        <span>Recent Sessions</span>
        <button
          onClick={() => {
            if (!isBusy && onNewThread) {
              onNewThread();
            }
          }}
          disabled={isBusy}
          className={`p-1 rounded-md transition-colors ${
            isBusy
              ? 'opacity-40 cursor-not-allowed text-slate-400 dark:text-zinc-600'
              : 'hover:bg-surface-highlight text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 cursor-pointer'
          }`}
          title={isBusy ? 'Đang xử lý...' : 'Tạo phiên mới'}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-1 overflow-y-auto min-h-0 flex-1 pr-0.5">
        {renderDemoFallback ? (
          demoThreads.map((thread) => (
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
          ))
        ) : sessions.length === 0 ? (
          <div className="px-2 py-4 text-center select-none">
            <MessageSquare className="w-5 h-5 mx-auto text-slate-300 dark:text-zinc-600 mb-1" />
            <div className="text-[12px] text-slate-400 dark:text-zinc-500">Chưa có phiên làm việc</div>
          </div>
        ) : (
          sessions.map((session) => {
            const isActive = activeSessionPath
              ? session.path === activeSessionPath
              : Boolean(session.active);

            return (
              <div
                key={session.id || session.path}
                onClick={() => {
                  if (!isBusy && !isActive && onSelectSession) {
                    onSelectSession(session.path);
                  }
                }}
                className={`flex items-start gap-2.5 p-2 rounded-lg transition-colors select-none ${
                  isActive
                    ? 'bg-surface border border-border text-slate-900 dark:text-zinc-100 shadow-xs cursor-default'
                    : isBusy
                      ? 'text-slate-400 dark:text-zinc-500 opacity-60 cursor-not-allowed'
                      : 'text-slate-700 dark:text-zinc-400 hover:bg-surface hover:text-slate-900 dark:hover:text-zinc-200 cursor-pointer'
                }`}
                title={isBusy ? 'Đang xử lý prompt...' : session.title}
              >
                <MessageSquare
                  className={`w-4 h-4 mt-0.5 shrink-0 ${
                    isActive ? 'text-codex-accent' : 'text-slate-400 dark:text-zinc-500'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-[12.5px] leading-tight">
                    {session.title || 'New Session'}
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
                    {formatRelativeTime(session.updatedAt || session.timestamp)}
                  </div>
                </div>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-codex-accent shrink-0 mt-1.5" />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
