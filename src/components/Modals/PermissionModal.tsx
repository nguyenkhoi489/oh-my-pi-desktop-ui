import React from 'react';
import { ShieldAlert, Check, X } from 'lucide-react';
import { PermissionRequest } from '../../types';

interface PermissionModalProps {
  request: PermissionRequest | null;
  onRespond: (approved: boolean) => void;
}

export const PermissionModal: React.FC<PermissionModalProps> = ({
  request,
  onRespond,
}) => {
  if (!request) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-md bg-panel border border-amber-300 dark:border-amber-500/40 rounded-2xl shadow-2xl overflow-hidden p-5 space-y-4">
        <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-300 dark:border-amber-500/30">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">Cấp quyền thực thi cho Agent</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400">OMP Agent yêu cầu quyền chạy hành động sau:</p>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-surface border border-border space-y-2 text-xs">
          <div className="font-semibold text-slate-800 dark:text-zinc-200">{request.description}</div>

          {request.command && (
            <div className="space-y-1">
              <div className="text-[10px] text-slate-500 font-mono uppercase">Lệnh Shell:</div>
              <pre className="p-2 rounded bg-slate-900 text-amber-300 font-mono text-[11px] overflow-x-auto">
                {request.command}
              </pre>
            </div>
          )}

          {request.targetFile && (
            <div className="space-y-1">
              <div className="text-[10px] text-slate-500 font-mono uppercase">File bị tác động:</div>
              <div className="font-mono text-slate-800 dark:text-zinc-300 text-[11px]">{request.targetFile}</div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={() => onRespond(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            <span>Từ chối (Deny)</span>
          </button>

          <button
            onClick={() => onRespond(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/20 transition-all"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Cho phép (Allow)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
