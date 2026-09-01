import React, { useState, useEffect } from 'react';
import { ShieldAlert, Check, X, ListFilter, HelpCircle, Edit3, Clock, FileText } from 'lucide-react';
import { OmpUiRequest } from '../../types';

export interface PermissionModalProps {
  request: OmpUiRequest | null;
  queueLength?: number;
  onRespondSelect: (id: string, value: string) => void;
  onRespondConfirm: (id: string, confirmed: boolean) => void;
  onRespondInput: (id: string, value: string) => void;
  onDismiss: (id: string) => void;
}

export const PermissionModal: React.FC<PermissionModalProps> = ({
  request,
  queueLength = 0,
  onRespondSelect,
  onRespondConfirm,
  onRespondInput,
  onDismiss,
}) => {
  const [inputValue, setInputValue] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // Sync input value & timeout countdown when request changes
  useEffect(() => {
    if (!request) {
      setInputValue('');
      setTimeLeft(null);
      return;
    }

    setInputValue(request.prefill || '');

    if (typeof request.timeout === 'number' && request.timeout > 0) {
      const initialSeconds = Math.max(1, Math.round(request.timeout > 1000 ? request.timeout / 1000 : request.timeout));
      setTimeLeft(initialSeconds);
    } else {
      setTimeLeft(null);
    }
  }, [request?.id, request?.prefill, request?.timeout]);

  // Timeout countdown ticker
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  // ESC key dismissal
  useEffect(() => {
    if (!request) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss(request.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [request?.id, onDismiss]);

  if (!request) return null;

  const isToolApproval =
    request.isToolApproval ||
    (request.method === 'select' &&
      Array.isArray(request.options) &&
      request.options.length === 2 &&
      request.options.includes('Approve') &&
      request.options.includes('Deny'));

  // Header styling by request type
  const renderHeader = () => {
    if (isToolApproval) {
      return (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0 border border-amber-500/30 text-amber-500">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 truncate">
                Cấp quyền thực thi công cụ
              </h3>
              {queueLength > 1 && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-border text-slate-500 dark:text-zinc-400 shrink-0">
                  1/{queueLength}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 truncate">
              OMP Agent yêu cầu quyền chạy hành động sau:
            </p>
          </div>
          {renderTimeoutBadge()}
        </div>
      );
    }

    if (request.method === 'select') {
      return (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center shrink-0 border border-indigo-500/30 text-indigo-500">
            <ListFilter className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 truncate">
                {request.title || 'Lựa chọn tùy chọn'}
              </h3>
              {queueLength > 1 && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-border text-slate-500 dark:text-zinc-400 shrink-0">
                  1/{queueLength}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 truncate">
              {request.message || 'Vui lòng chọn một tùy chọn bên dưới để tiếp tục:'}
            </p>
          </div>
          {renderTimeoutBadge()}
        </div>
      );
    }

    if (request.method === 'confirm') {
      return (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/15 flex items-center justify-center shrink-0 border border-sky-500/30 text-sky-500">
            <HelpCircle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 truncate">
                {request.title || 'Xác nhận hành động'}
              </h3>
              {queueLength > 1 && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-border text-slate-500 dark:text-zinc-400 shrink-0">
                  1/{queueLength}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 truncate">
              {request.message || 'Vui lòng xác nhận để tiếp tục:'}
            </p>
          </div>
          {renderTimeoutBadge()}
        </div>
      );
    }

    // method === 'input' || method === 'editor'
    return (
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0 border border-emerald-500/30 text-emerald-500">
          {request.method === 'editor' ? <FileText className="w-5 h-5" /> : <Edit3 className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 truncate">
              {request.title || (request.method === 'editor' ? 'Chỉnh sửa nội dung' : 'Nhập thông tin')}
            </h3>
            {queueLength > 1 && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-border text-slate-500 dark:text-zinc-400 shrink-0">
                1/{queueLength}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 truncate">
            {request.message || 'Vui lòng cung cấp nội dung cần thiết:'}
          </p>
        </div>
        {renderTimeoutBadge()}
      </div>
    );
  };

  const renderTimeoutBadge = () => {
    if (timeLeft === null) return null;
    return (
      <div
        className={`flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded-lg border shrink-0 ${
          timeLeft === 0
            ? 'bg-red-500/10 border-red-500/30 text-red-500'
            : 'bg-surface border-border text-slate-500 dark:text-zinc-400'
        }`}
        title={timeLeft === 0 ? 'Đã hết thời gian chờ engine xử lý' : `Tự động xử lý sau ${timeLeft}s`}
      >
        <Clock className="w-3 h-3" />
        <span>{timeLeft === 0 ? '0s' : `${timeLeft}s`}</span>
      </div>
    );
  };

  // Body content & actions by type
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
      <div className="w-full max-w-lg bg-panel border border-border rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4">
        {renderHeader()}

        {/* 1. Tool Approval View */}
        {isToolApproval && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-surface border border-border space-y-2 text-xs">
              <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono uppercase tracking-wider">
                Chi tiết công cụ & yêu cầu:
              </div>
              <pre className="p-3 rounded-lg bg-background text-amber-600 dark:text-amber-400 font-mono text-[11.5px] max-h-60 overflow-y-auto whitespace-pre-wrap break-words border border-border leading-relaxed selection:bg-amber-500/20">
                {request.title}
              </pre>
              {request.message && (
                <div className="text-xs text-slate-600 dark:text-zinc-300 pt-1">
                  {request.message}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => onRespondSelect(request.id, 'Deny')}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Từ chối (Deny)</span>
              </button>

              <button
                type="button"
                onClick={() => onRespondSelect(request.id, 'Approve')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shadow-sm transition-all cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Cho phép chạy (Approve)</span>
              </button>
            </div>
          </div>
        )}

        {/* 2. Generic Select View */}
        {!isToolApproval && request.method === 'select' && (
          <div className="space-y-4">
            <div className="space-y-2 max-h-72 overflow-y-auto py-1">
              {(request.options || []).map((option, idx) => {
                const detail = request.optionDetails?.[idx];
                return (
                  <button
                    key={`${option}-${idx}`}
                    type="button"
                    onClick={() => onRespondSelect(request.id, option)}
                    className="w-full text-left p-3 rounded-xl bg-surface hover:bg-surface-highlight border border-border hover:border-indigo-500/50 dark:hover:border-indigo-400/50 transition-all cursor-pointer group flex flex-col gap-0.5"
                  >
                    <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {option}
                    </span>
                    {detail?.description && (
                      <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                        {detail.description}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => onDismiss(request.id)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Hủy (Cancel)</span>
              </button>
            </div>
          </div>
        )}

        {/* 3. Confirm View */}
        {!isToolApproval && request.method === 'confirm' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-surface border border-border text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">
              {request.message || request.title}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => onRespondConfirm(request.id, false)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Từ chối</span>
              </button>

              <button
                type="button"
                onClick={() => onRespondConfirm(request.id, true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-sm transition-all cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Xác nhận</span>
              </button>
            </div>
          </div>
        )}

        {/* 4. Input / Editor View */}
        {!isToolApproval && (request.method === 'input' || request.method === 'editor') && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onRespondInput(request.id, inputValue);
            }}
            className="space-y-4"
          >
            {request.message && (
              <div className="text-xs text-slate-600 dark:text-zinc-300">
                {request.message}
              </div>
            )}

            {request.method === 'editor' ? (
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    onRespondInput(request.id, inputValue);
                  }
                }}
                placeholder={request.placeholder || 'Nhập nội dung... (⌘+Enter để gửi)'}
                rows={7}
                autoFocus
                className="w-full p-3.5 rounded-xl bg-background border border-border text-xs font-mono focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-zinc-200 resize-y max-h-80"
              />
            ) : (
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={request.placeholder || 'Nhập giá trị...'}
                autoFocus
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-xs focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-zinc-200"
              />
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => onDismiss(request.id)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Hủy (Cancel)</span>
              </button>

              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Gửi (Submit)</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
