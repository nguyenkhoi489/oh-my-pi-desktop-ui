import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Share2,
  Copy,
  Check,
  ExternalLink,
  Lock,
  AlertTriangle,
  GitBranch,
  RefreshCw,
} from 'lucide-react';
import type { OmpSessionInfo } from '../../types';

interface ShareSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: OmpSessionInfo | null;
}

export const ShareSessionModal: React.FC<ShareSessionModalProps> = ({
  isOpen,
  onClose,
  session,
}) => {
  const [useGist, setUseGist] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen || !session) return null;

  const handleShare = async () => {
    if (!window.electronAPI?.shareSession) return;
    setIsLoading(true);
    setError(null);
    setShareUrl(null);

    try {
      const identifier = session.id || session.path;
      const res = await window.electronAPI.shareSession(identifier, { gist: useGist });
      if (res.success && res.url) {
        setShareUrl(res.url);
      } else if (res.success && res.rawOutput) {
        // Fallback neu link nam trong raw text
        setShareUrl(res.rawOutput);
      } else {
        setError(res.error || 'Không thể tạo liên kết chia sẻ session');
      }
    } catch (err: any) {
      setError(err?.message || 'Lỗi ngoại lệ khi chia sẻ session');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-lg bg-panel border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-surface/50">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-zinc-100">
                Chia sẻ phiên làm việc
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 truncate max-w-xs">
                {session.title || session.id}
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
        <div className="p-5 space-y-4 text-xs text-slate-600 dark:text-zinc-300">
          {/* Security Notice */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
            <Lock className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-slate-800 dark:text-zinc-200">
                Bảo mật & Mã hoá
              </p>
              <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300/90">
                Nội dung session được mã hoá đầu cuối (end-to-end). Bất kỳ ai có đường dẫn kèm mã khoá đều có thể xem lịch sử hội thoại của phiên này.
              </p>
            </div>
          </div>

          {/* Option: Gist */}
          <label className="flex items-center gap-2.5 p-3 rounded-lg border border-border bg-surface/30 hover:bg-surface/60 transition-colors cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useGist}
              onChange={(e) => setUseGist(e.target.checked)}
              className="rounded border-border text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-zinc-200">
                <GitBranch className="w-3.5 h-3.5" />
                <span>Lưu trữ trên GitHub Gist ẩn (--gist)</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                Tải nội dung lên secret gist cá nhân thay vì máy chủ chia sẻ OMP mặc định.
              </p>
            </div>
          </label>

          {/* Share Result / Link Box */}
          {shareUrl && (
            <div className="space-y-2 pt-1 animate-fade-in">
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-200">
                Liên kết chia sẻ của bạn:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 px-3 py-2 rounded-lg bg-surface border border-border text-xs text-slate-900 dark:text-zinc-100 font-mono select-all outline-none"
                />
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-sm transition-colors cursor-pointer shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Đã chép' : 'Sao chép'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border bg-surface/50">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-surface-highlight transition-colors cursor-pointer"
          >
            Đóng
          </button>

          {!shareUrl ? (
            <button
              onClick={handleShare}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
            >
              {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{isLoading ? 'Đang tạo liên kết...' : 'Tạo liên kết chia sẻ'}</span>
            </button>
          ) : (
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition-colors cursor-pointer"
            >
              <span>Mở liên kết</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
