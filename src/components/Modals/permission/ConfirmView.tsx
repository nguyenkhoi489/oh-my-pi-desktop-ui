import React from 'react';
import { Check, X } from 'lucide-react';
import { OmpUiRequest } from '../../../types';

export interface ConfirmViewProps {
  request: OmpUiRequest;
  onConfirm: (confirmed: boolean) => void;
  onCancel: () => void;
}

export const ConfirmView: React.FC<ConfirmViewProps> = ({
  request,
  onConfirm,
  onCancel,
}) => {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-surface border border-border text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">
        {request.message || request.title}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-zinc-300 transition-colors cursor-pointer"
        >
          <span>Hủy (ESC)</span>
        </button>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onConfirm(false)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Từ chối</span>
          </button>

          <button
            type="button"
            onClick={() => onConfirm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-sm transition-all cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Xác nhận</span>
          </button>
        </div>
      </div>
    </div>
  );
};
