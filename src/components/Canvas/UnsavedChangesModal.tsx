import React, { useEffect } from 'react';
import { AlertCircle, Save, Trash2, X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';

interface UnsavedChangesModalProps {
  isOpen: boolean;
  fileName: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  isOpen,
  fileName,
  onSave,
  onDiscard,
  onCancel,
}) => {
  const { t } = useI18n();

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onSave, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-md bg-surface border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-panel">
          <div className="flex items-center gap-2.5 text-amber-500 dark:text-amber-400">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100">
              {t('editor.unsavedModalTitle')}
            </span>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-surface transition-colors cursor-pointer"
            title={t('editor.cancel')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 text-sm text-slate-600 dark:text-zinc-300">
          <p>
            {t('editor.unsavedModalDesc', { fileName: fileName || 'file' })}
          </p>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border bg-panel">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-surface border border-border transition-colors cursor-pointer"
          >
            {t('editor.cancel')}
          </button>
          <button
            onClick={onDiscard}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/50 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('editor.discardAndContinue')}</span>
          </button>
          <button
            onClick={onSave}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-codex-accent text-white shadow-xs hover:opacity-90 transition-opacity cursor-pointer font-semibold"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{t('editor.saveAndContinue')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
