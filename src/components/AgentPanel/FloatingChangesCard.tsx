import React from 'react';
import { FileDiff, ArrowRight, X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';

export interface FloatingChangesCardProps {
  filesChanged: number;
  insertions?: number;
  deletions?: number;
  onReview: () => void;
  onDismiss?: () => void;
  className?: string;
}

export const FloatingChangesCard: React.FC<FloatingChangesCardProps> = React.memo(({
  filesChanged,
  insertions = 0,
  deletions = 0,
  onReview,
  onDismiss,
  className = '',
}) => {
  const { t } = useI18n();

  if (filesChanged <= 0 && insertions <= 0 && deletions <= 0) {
    return null;
  }

  return (
    <div
      data-testid="floating-changes-card"
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface/95 dark:bg-zinc-800/95 backdrop-blur-md border border-border shadow-md text-xs select-none transition-all duration-200 animate-fade-in hover:shadow-lg ${className}`}
    >
      <div className="flex items-center gap-1.5 text-slate-700 dark:text-zinc-300 font-medium">
        <FileDiff className="w-3.5 h-3.5 text-blue-500 shrink-0" />
        <span>{t('floatingChanges.filesChanged', { count: filesChanged })}</span>
      </div>

      {(insertions > 0 || deletions > 0) && (
        <div className="flex items-center gap-1 font-mono text-[11px]">
          {insertions > 0 && (
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              +{insertions}
            </span>
          )}
          {deletions > 0 && (
            <span className="text-rose-600 dark:text-rose-400 font-semibold">
              -{deletions}
            </span>
          )}
        </div>
      )}

      <div className="w-px h-3 bg-border shrink-0" />

      <button
        type="button"
        onClick={onReview}
        className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors cursor-pointer"
        title={t('floatingChanges.review')}
      >
        <span>{t('floatingChanges.review')}</span>
        <ArrowRight className="w-3 h-3" />
      </button>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="p-0.5 rounded-full hover:bg-surface-highlight text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors ml-0.5"
          title={t('floatingChanges.dismiss')}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
});
