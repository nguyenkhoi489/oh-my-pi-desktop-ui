import React, { useState } from 'react';
import {
  AlertTriangle,
  Terminal,
  Copy,
  Check,
  RotateCw,
  FolderSearch,
  Sparkles,
} from 'lucide-react';
import { OmpInstallStatus } from '../../types';

interface OmpRequiredModalProps {
  isOpen: boolean;
  installStatus?: OmpInstallStatus | null;
  isChecking: boolean;
  onRecheck: () => void;
  onContinueDemo: () => void;
  onSelectCustomFile?: () => void;
  onSetCustomPath?: (path: string) => void;
}

export const OmpRequiredModal: React.FC<OmpRequiredModalProps> = ({
  isOpen,
  isChecking,
  onRecheck,
  onContinueDemo,
  onSelectCustomFile,
  onSetCustomPath,
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [manualPath, setManualPath] = useState<string>('');

  if (!isOpen) return null;

  const installMethods = [
    {
      name: '1. Cài đặt qua Bun (Khuyên dùng)',
      cmd: 'bun install -g @oh-my-pi/pi-coding-agent',
      tag: 'Recommended ⭐',
      desc: 'Tối ưu tốc độ cao nhất với Bun runtime trên macOS.',
    },
    {
      name: '2. Cài đặt qua Homebrew',
      cmd: 'brew install can1357/tap/omp',
      tag: 'Homebrew',
      desc: 'Tự động quản lý PATH và cập nhật gói qua brew.',
    },
    {
      name: '3. Cài đặt bằng Shell Script',
      cmd: 'curl -fsSL https://omp.sh/install | sh',
      tag: 'Direct Curl',
      desc: 'Tự động tải và cài đặt binary vào hệ thống.',
    },
  ];

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleApplyManualPath = () => {
    if (manualPath.trim() && onSetCustomPath) {
      onSetCustomPath(manualPath.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in select-none p-4">
      <div className="w-full max-w-xl bg-panel border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-6 bg-gradient-to-r from-amber-500/10 via-surface to-transparent border-b border-border flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                Requirement
              </span>
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-zinc-100 mt-1">
              Chưa phát hiện oh-my-pi (OMP) Engine
            </h2>
            <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1 leading-relaxed">
              Ứng dụng <strong>OMP Agent</strong> cần engine lõi <strong>oh-my-pi</strong> để thực hiện phân tích cú pháp AST, kiểm tra LSP và chạy chế độ RPC ngầm.
            </p>
          </div>
        </div>

        {/* Installation Instructions */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[58vh]">
          {/* Quick Manual Browse / Path Input */}
          <div className="p-4 rounded-xl bg-surface border border-border flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-codex-accent" />
                Nếu bạn đã cài OMP ở đường dẫn riêng:
              </span>
              <button
                onClick={onSelectCustomFile}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-highlight hover:bg-surface border border-border text-slate-800 dark:text-zinc-200 transition-colors cursor-pointer"
                title="Chọn file nhị phân trên máy"
              >
                <FolderSearch className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400" />
                <span>Chọn file nhị phân...</span>
              </button>
            </div>

            <div className="flex gap-2 pt-1">
              <input
                type="text"
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                placeholder="Hoặc dán đường dẫn (ví dụ: ~/.bun/bin/omp, /usr/local/bin/omp)"
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-border bg-panel text-slate-800 dark:text-zinc-200 outline-none font-mono focus:border-codex-accent"
              />
              <button
                onClick={handleApplyManualPath}
                disabled={!manualPath.trim()}
                className="px-3.5 py-1.5 text-xs font-semibold bg-surface-highlight hover:bg-surface text-slate-800 dark:text-zinc-200 rounded-lg border border-border transition-colors disabled:opacity-40 cursor-pointer"
              >
                Apply
              </button>
            </div>
          </div>

          <div className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5 pt-1">
            <Terminal className="w-4 h-4 text-codex-accent" />
            <span>Hoặc mở Terminal trên Mac và chạy 1 trong các lệnh sau:</span>
          </div>

          {installMethods.map((method, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl bg-surface border border-border hover:border-codex-accent/40 transition-all space-y-2.5 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                  {method.name}
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-surface-highlight text-slate-600 dark:text-zinc-400 border border-border">
                  {method.tag}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-[#0c0d11] text-emerald-400 font-mono text-xs border border-border/60">
                <span className="truncate">{method.cmd}</span>
                <button
                  onClick={() => handleCopy(method.cmd, idx)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white transition-colors text-[11px] shrink-0 cursor-pointer"
                  title="Copy lệnh"
                >
                  {copiedIndex === idx ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-medium">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              <p className="text-[11.5px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                {method.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-surface border-t border-border flex items-center justify-between gap-3">
          <button
            onClick={onContinueDemo}
            className="text-xs text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 font-medium transition-colors cursor-pointer"
          >
            Dùng thử Demo UI trước →
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onRecheck}
              disabled={isChecking}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-codex-accent hover:bg-codex-accent-hover text-white shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'Đang kiểm tra...' : 'Kiểm tra lại'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
