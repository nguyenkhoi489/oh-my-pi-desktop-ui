import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/I18nProvider';
import {
  X,
  Users,
  Link as LinkIcon,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface JoinSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoinedSuccess?: () => void;
}

export const JoinSessionModal: React.FC<JoinSessionModalProps> = ({
  isOpen,
  onClose,
  onJoinedSuccess,
}) => {
  const { t } = useI18n();
  const [link, setLink] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleJoin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanLink = link.trim();
    if (!cleanLink || isLoading) return;

    if (!window.electronAPI?.joinSession) {
      setError(t('join.apiUnavailable'));
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await window.electronAPI.joinSession(cleanLink);
      if (res.success) {
        setSuccessMsg(res.message || t('join.success'));
        if (onJoinedSuccess) {
          onJoinedSuccess();
        }
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setError(res.error || t('join.errorMsg'));
      }
    } catch (err: any) {
      setError(err?.message || t('join.exceptionError'));
    } finally {
      setIsLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-md bg-panel border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-surface/50">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-zinc-100">
                Tham gia Collab Session
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {t('join.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-surface-highlight transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleJoin} className="p-5 space-y-4 text-xs text-slate-600 dark:text-zinc-300">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-zinc-200">
              {t('join.linkLabel')}
            </label>
            <div className="relative flex items-center">
              <LinkIcon className="absolute left-3 w-4 h-4 text-slate-400 dark:text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder={t('join.placeholder')}
                autoFocus
                disabled={isLoading}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface border border-border text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:border-emerald-500 outline-none font-mono"
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
              {t('join.linkHint', { cmd1: 'omp share', cmd2: '/collab' })}
            </p>
          </div>

          {/* Success message */}
          {successMsg && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs animate-fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-surface-highlight transition-colors cursor-pointer"
            >
              {t('join.cancel')}
            </button>
            <button
              type="submit"
              disabled={!link.trim() || isLoading}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
            >
              {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{isLoading ? t('join.joiningStatus') : t('join.joinBtn')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
