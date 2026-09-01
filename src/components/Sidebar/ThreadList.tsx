import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Plus, Edit2, Trash2, Download, Check, X } from 'lucide-react';
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
  activeSessionName?: string;
  status?: OmpAgentStatus;
  onSelectSession?: (path: string) => void;
  onNewThread?: () => void;
  onRenameSession?: (name: string) => Promise<boolean>;
  onDeleteSession?: (path: string) => Promise<boolean>;
  onExportSession?: () => Promise<unknown>;
}
export const ThreadList: React.FC<ThreadListProps> = ({
  sessions = [],
  activeSessionPath = null,
  activeSessionName,
  status = 'idle',
  onSelectSession,
  onNewThread,
  onRenameSession,
  onDeleteSession,
  onExportSession,
}) => {
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI);
  const isBusy = status !== 'idle';
  const [editingSessionPath, setEditingSessionPath] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<OmpSessionInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingSessionPath && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingSessionPath]);

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

            const isEditingThis = editingSessionPath === session.path;
            const effectiveTitle =
              isActive && activeSessionName
                ? activeSessionName
                : session.title || 'New Session';

            const handleSaveRename = async () => {
              const trimmed = editTitle.trim();
              if (!trimmed || trimmed === effectiveTitle) {
                setEditingSessionPath(null);
                return;
              }
              if (onRenameSession) {
                setIsRenaming(true);
                try {
                  await onRenameSession(trimmed);
                } finally {
                  setIsRenaming(false);
                  setEditingSessionPath(null);
                }
              } else {
                setEditingSessionPath(null);
              }
            };

            return (
              <div
                key={session.id || session.path}
                onClick={() => {
                  if (!isBusy && !isActive && !isEditingThis && onSelectSession) {
                    onSelectSession(session.path);
                  }
                }}
                className={`group flex items-start gap-2.5 p-2 rounded-lg transition-colors select-none ${
                  isActive
                    ? 'bg-surface border border-border text-slate-900 dark:text-zinc-100 shadow-xs cursor-default'
                    : isBusy
                      ? 'text-slate-400 dark:text-zinc-500 opacity-60 cursor-not-allowed'
                      : 'text-slate-700 dark:text-zinc-400 hover:bg-surface hover:text-slate-900 dark:hover:text-zinc-200 cursor-pointer'
                }`}
                title={isBusy ? 'Đang xử lý prompt...' : effectiveTitle}
              >
                <MessageSquare
                  className={`w-4 h-4 mt-0.5 shrink-0 ${
                    isActive ? 'text-codex-accent' : 'text-slate-400 dark:text-zinc-500'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  {isEditingThis ? (
                    <div
                      className="flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveRename();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditingSessionPath(null);
                          }
                        }}
                        disabled={isRenaming}
                        className="w-full text-[12.5px] px-1.5 py-0.5 rounded bg-panel border border-codex-accent text-slate-900 dark:text-zinc-100 focus:outline-hidden font-medium"
                      />
                      <button
                        onClick={handleSaveRename}
                        disabled={isRenaming || !editTitle.trim()}
                        className="p-1 rounded text-emerald-500 hover:bg-surface-highlight cursor-pointer"
                        title="Lưu tên"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setEditingSessionPath(null)}
                        disabled={isRenaming}
                        className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-surface-highlight cursor-pointer"
                        title="Hủy"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="font-medium truncate text-[12.5px] leading-tight">
                        {effectiveTitle}
                      </div>
                      <div className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
                        {formatRelativeTime(session.updatedAt || session.timestamp)}
                      </div>
                    </>
                  )}
                </div>

                {!isEditingThis && (
                  <div
                    className="flex items-center gap-0.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isActive ? (
                      <>
                        <button
                          onClick={() => {
                            if (!isBusy) {
                              setEditTitle(effectiveTitle);
                              setEditingSessionPath(session.path);
                            }
                          }}
                          disabled={isBusy}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-highlight text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 transition-opacity cursor-pointer"
                          title="Đổi tên phiên"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={async () => {
                            if (onExportSession && !isBusy && !isExporting) {
                              setIsExporting(true);
                              try {
                                await onExportSession();
                              } finally {
                                setIsExporting(false);
                              }
                            }
                          }}
                          disabled={isBusy || isExporting}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-highlight text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 transition-opacity cursor-pointer"
                          title="Xuất phiên ra HTML"
                        >
                          <Download className="w-3 h-3" />
                        </button>
                        <span className="w-1.5 h-1.5 rounded-full bg-codex-accent shrink-0 mt-0.5 ml-1" />
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          if (!isBusy) {
                            setSessionToDelete(session);
                          }
                        }}
                        disabled={isBusy}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition-opacity cursor-pointer"
                        title="Xóa phiên làm việc"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {sessionToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-surface dark:bg-panel border border-border rounded-xl shadow-2xl max-w-sm w-full p-4.5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-rose-500/10 text-rose-500 shrink-0 mt-0.5">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                  Xác nhận xóa phiên
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  Bạn có chắc chắn muốn xóa phiên làm việc{' '}
                  <span className="font-medium text-slate-700 dark:text-zinc-200">
                    "{sessionToDelete.title || 'New Session'}"
                  </span>{' '}
                  không?
                </p>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1.5">
                  Tệp nhật ký và các phiên subagent liên quan sẽ bị xóa vĩnh viễn khỏi đĩa.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-border">
              <button
                onClick={() => setSessionToDelete(null)}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-surface-highlight transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={async () => {
                  if (onDeleteSession && sessionToDelete) {
                    setIsDeleting(true);
                    try {
                      await onDeleteSession(sessionToDelete.path);
                      setSessionToDelete(null);
                    } finally {
                      setIsDeleting(false);
                    }
                  }
                }}
                disabled={isDeleting}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isDeleting ? 'Đang xóa...' : 'Xóa phiên'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
