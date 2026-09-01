import React, { useState, useEffect } from 'react';
import { ListFilter, HelpCircle, Edit3, Clock, FileText } from 'lucide-react';
import { OmpUiRequest } from '../../types';
import { SelectView } from './permission/SelectView';
import { ConfirmView } from './permission/ConfirmView';
import { InputView } from './permission/InputView';

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
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // Sync timeout countdown when request changes (chỉ khi có timeout thật từ engine)
  useEffect(() => {
    if (!request) {
      setTimeLeft(null);
      return;
    }

    if (typeof request.timeout === 'number' && request.timeout > 0) {
      const initialSeconds = Math.max(
        1,
        Math.round(request.timeout > 1000 ? request.timeout / 1000 : request.timeout)
      );
      setTimeLeft(initialSeconds);
    } else {
      setTimeLeft(null);
    }
  }, [request?.id, request?.timeout]);

  // Bộ đếm giây trung thực
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  // ESC key dismissal cho các UI request thông thường (select, confirm, input, editor)
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

  const renderTimeoutBadge = () => {
    if (timeLeft === null) return null;
    return (
      <div
        className={`flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded-lg border shrink-0 ${
          timeLeft === 0
            ? 'bg-red-500/10 border-red-500/30 text-red-500'
            : 'bg-surface border-border text-slate-500 dark:text-zinc-400'
        }`}
        title={
          timeLeft === 0
            ? 'Đã hết thời gian chờ engine xử lý'
            : `Engine tự xử lý sau ${timeLeft}s`
        }
      >
        <Clock className="w-3 h-3" />
        <span>{timeLeft === 0 ? '0s' : `${timeLeft}s`}</span>
      </div>
    );
  };

  const renderHeader = () => {
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
          {request.method === 'editor' ? (
            <FileText className="w-5 h-5" />
          ) : (
            <Edit3 className="w-5 h-5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 truncate">
              {request.title ||
                (request.method === 'editor' ? 'Chỉnh sửa nội dung' : 'Nhập thông tin')}
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

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
      <div className="w-full max-w-lg bg-panel border border-border rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4">
        {renderHeader()}

        {request.method === 'select' && (
          <SelectView
            request={request}
            onSelect={(val) => onRespondSelect(request.id, val)}
            onCancel={() => onDismiss(request.id)}
          />
        )}

        {request.method === 'confirm' && (
          <ConfirmView
            request={request}
            onConfirm={(val) => onRespondConfirm(request.id, val)}
            onCancel={() => onDismiss(request.id)}
          />
        )}

        {(request.method === 'input' || request.method === 'editor') && (
          <InputView
            request={request}
            onSubmit={(val) => onRespondInput(request.id, val)}
            onCancel={() => onDismiss(request.id)}
          />
        )}
      </div>
    </div>
  );
};
