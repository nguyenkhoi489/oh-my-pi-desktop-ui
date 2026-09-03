import React from 'react';
import { Info, AlertTriangle, AlertCircle, X, Bell } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { OmpNotification } from '../../types';

interface ToastStackProps {
  notifications: OmpNotification[];
  onDismiss: (id: string) => void;
}

export const ToastStack: React.FC<ToastStackProps> = ({
  notifications,
  onDismiss,
}) => {
  const { t } = useI18n();
  if (!notifications || notifications.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none select-none"
      role="region"
      aria-label={t('toast.aria.notifications')}
    >
      {notifications.map((notif) => {
        const type = notif.notifyType?.toLowerCase();
        const isError = type === 'error';
        const isWarning = type === 'warning';
        return (
          <div
            key={notif.id}
            className={`pointer-events-auto flex items-start gap-2.5 p-3 rounded-lg border shadow-lg backdrop-blur-md transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 ${
              isError
                ? 'bg-surface/95 dark:bg-panel/95 border-rose-500/30 text-rose-600 dark:text-rose-400'
                : isWarning
                  ? 'bg-surface/95 dark:bg-panel/95 border-amber-500/30 text-amber-600 dark:text-amber-400'
                  : 'bg-surface/95 dark:bg-panel/95 border-border text-slate-700 dark:text-zinc-300'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {isError ? (
                <AlertCircle className="w-4 h-4 text-rose-500" />
              ) : isWarning ? (
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              ) : type === 'info' ? (
                <Info className="w-4 h-4 text-sky-500" />
              ) : (
                <Bell className="w-4 h-4 text-codex-accent" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs leading-relaxed text-slate-800 dark:text-zinc-200 break-words">
                {notif.message}
              </p>
              {notif.action && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      notif.action?.onClick();
                      onDismiss(notif.id);
                    }}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer shadow-xs"
                  >
                    {notif.action.label}
                  </button>
                </div>
              )}
              {notif.timestamp > 0 && (
                <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono mt-0.5 block">
                  {new Date(notif.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              )}
            </div>

            <button
              onClick={() => onDismiss(notif.id)}
              className="shrink-0 p-1 rounded-md hover:bg-surface-highlight text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
              title={t('toast.close')}
              aria-label={t('common.close')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
