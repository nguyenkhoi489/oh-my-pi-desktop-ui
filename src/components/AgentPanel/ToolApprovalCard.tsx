import React, { useEffect, useState } from 'react';
import { ShieldAlert, Check, X, Clock } from 'lucide-react';
import { OmpUiRequest } from '../../types';
import { useI18n } from '../../i18n/I18nProvider';

export interface ToolApprovalCardProps {
  request: OmpUiRequest;
  queueLength?: number;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}

export const ToolApprovalCard: React.FC<ToolApprovalCardProps> = ({
  request,
  queueLength = 1,
  onApprove,
  onDeny,
}) => {
  const { t } = useI18n();
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // Initialize countdown if request has actual engine timeout
  useEffect(() => {
    if (typeof request.timeout === 'number' && request.timeout > 0) {
      const initialSeconds = Math.max(
        1,
        Math.round(request.timeout > 1000 ? request.timeout / 1000 : request.timeout)
      );
      setTimeLeft(initialSeconds);
    } else {
      setTimeLeft(null);
    }
  }, [request.id, request.timeout]);

  // Countdown seconds timer
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  // Shortcuts: Cmd+Enter Approve, Cmd+Backspace Deny (NO ESC dismiss)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'Enter') {
          e.preventDefault();
          onApprove(request.id);
        } else if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          onDeny(request.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [request.id, onApprove, onDeny]);

  const renderTimeoutBadge = () => {
    if (timeLeft === null) return null;
    return (
      <div
        className={`flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md border shrink-0 ${
          timeLeft === 0
            ? 'bg-red-500/10 border-red-500/30 text-red-500'
            : 'bg-surface border-border text-slate-500 dark:text-zinc-400'
        }`}
        title={
          timeLeft === 0
            ? t('toolApproval.timeoutExpired')
            : t('toolApproval.timeout', { timeLeft })
        }
      >
        <Clock className="w-3 h-3" />
        <span>{timeLeft === 0 ? '0s' : `${timeLeft}s`}</span>
      </div>
    );
  };

  return (
    <div className="mx-3.5 mb-2 p-3.5 rounded-2xl bg-surface/95 dark:bg-[#161822]/95 border border-amber-500/40 shadow-lg backdrop-blur-sm animate-fade-in text-slate-800 dark:text-zinc-100 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0 border border-amber-500/30 text-amber-500">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-900 dark:text-zinc-100 truncate">
                {t('toolApproval.title')}
              </span>
              {queueLength > 1 && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                  1/{queueLength}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
              {t('toolApproval.desc')}
            </p>
          </div>
        </div>
        {renderTimeoutBadge()}
      </div>

      {/* Tool details */}
      <div className="p-2.5 rounded-xl bg-background/80 border border-border space-y-1.5 text-xs">
        <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono uppercase tracking-wider">
          {t('toolApproval.details')}
        </div>
        <pre className="p-2 rounded-lg bg-surface text-amber-600 dark:text-amber-400 font-mono text-[11px] max-h-40 overflow-y-auto whitespace-pre-wrap break-words border border-border/70 leading-relaxed selection:bg-amber-500/20">
          {request.title}
        </pre>
        {request.message && (
          <div className="text-[11.5px] text-slate-600 dark:text-zinc-300 pt-0.5">
            {request.message}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-0.5">
        <span className="text-[10.5px] text-slate-400 dark:text-zinc-500">
          {t('toolApproval.shortcutHint')}
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onDeny(request.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>{t('toolApproval.deny')}</span>
          </button>

          <button
            type="button"
            onClick={() => onApprove(request.id)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shadow-sm transition-all cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{t('toolApproval.approve')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
