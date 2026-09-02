import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Sparkles, Download, ArrowRight, Folder, RefreshCw, AlertCircle } from 'lucide-react';
import type { ForeignSessionCandidate } from '../../types';
import { formatRelativeTime } from './ThreadList';

interface ImportSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (newSessionPath: string) => void;
  currentCwd?: string;
}

export const ImportSessionModal: React.FC<ImportSessionModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
  currentCwd,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'claude' | 'codex'>('all');
  const [candidates, setCandidates] = useState<ForeignSessionCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCurrentProjectOnly, setFilterCurrentProjectOnly] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchCandidates = async () => {
    if (!window.electronAPI?.listImportCandidates) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await window.electronAPI.listImportCandidates();
      if (res.success && res.candidates) {
        setCandidates(res.candidates);
      } else {
        setErrorMessage(res.error || 'Không thể tải danh sách session');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Lỗi quét session');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCandidates();
      setSearchQuery('');
      setErrorMessage(null);
    }
  }, [isOpen]);

  const filteredCandidates = useMemo(() => {
    return candidates.filter((item) => {
      if (activeTab !== 'all' && item.source !== activeTab) {
        return false;
      }
      if (filterCurrentProjectOnly && currentCwd && item.cwd) {
        const normItem = item.cwd.toLowerCase().replace(/[/\\]+$/, '');
        const normCur = currentCwd.toLowerCase().replace(/[/\\]+$/, '');
        if (!normItem.includes(normCur) && !normCur.includes(normItem)) {
          return false;
        }
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchTitle = (item.title || '').toLowerCase().includes(q);
      const matchFirst = (item.firstMessage || '').toLowerCase().includes(q);
      const matchCwd = (item.cwd || '').toLowerCase().includes(q);
      return matchTitle || matchFirst || matchCwd;
    });
  }, [candidates, activeTab, filterCurrentProjectOnly, currentCwd, searchQuery]);

  const handleImport = async (candidate: ForeignSessionCandidate) => {
    if (!window.electronAPI?.importSession || importingId) return;
    setImportingId(candidate.id);
    setErrorMessage(null);
    try {
      const res = await window.electronAPI.importSession(candidate, currentCwd);
      if (res.success && res.sessionPath) {
        onImportSuccess(res.sessionPath);
        onClose();
      } else {
        setErrorMessage(res.error || 'Import thất bại');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Lỗi trong quá trình import');
    } finally {
      setImportingId(null);
    }
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in select-none"
      onClick={onClose}
    >
      <div
        className="bg-panel border border-border rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[85vh] overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-codex-accent/10 text-codex-accent flex items-center justify-center">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                Nhập phiên làm việc từ Claude Code / Codex
              </h2>
              <p className="text-[12px] text-slate-500 dark:text-zinc-400">
                Chuyển đổi lịch sử chat, công cụ và trạng thái vào OMP Desktop
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-surface-highlight transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar & Filters */}
        <div className="p-4 border-b border-border space-y-3 bg-surface/40 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex items-center p-0.5 bg-panel border border-border rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  activeTab === 'all'
                    ? 'bg-surface text-slate-900 dark:text-zinc-100 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-zinc-300'
                }`}
              >
                Tất cả ({candidates.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('claude')}
                className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  activeTab === 'claude'
                    ? 'bg-surface text-slate-900 dark:text-zinc-100 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-zinc-300'
                }`}
              >
                Claude Code ({candidates.filter((c) => c.source === 'claude').length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('codex')}
                className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  activeTab === 'codex'
                    ? 'bg-surface text-slate-900 dark:text-zinc-100 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-zinc-300'
                }`}
              >
                Codex ({candidates.filter((c) => c.source === 'codex').length})
              </button>
            </div>

            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm theo tiêu đề, tin nhắn, thư mục..."
                className="w-full text-xs pl-8 pr-3 py-1.5 rounded-xl bg-panel border border-border text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-hidden focus:border-codex-accent"
              />
            </div>

            <button
              type="button"
              onClick={fetchCandidates}
              disabled={isLoading}
              className="p-1.5 rounded-xl border border-border bg-panel hover:bg-surface-highlight text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200 transition-colors cursor-pointer disabled:opacity-50"
              title="Quét lại"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {currentCwd && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterCurrentProjectOnly}
                  onChange={(e) => setFilterCurrentProjectOnly(e.target.checked)}
                  className="rounded border-border text-codex-accent focus:ring-0 cursor-pointer"
                />
                <span>Chỉ hiển thị session thuộc project hiện tại</span>
              </label>
            </div>
          )}
        </div>

        {/* Error notification */}
        {errorMessage && (
          <div className="mx-4 mt-3 p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Candidate List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[250px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 space-y-2">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span className="text-xs">Đang quét session từ Claude Code và Codex...</span>
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-zinc-500 space-y-2 text-center px-4">
              <Sparkles className="w-6 h-6 stroke-1" />
              <p className="text-xs font-medium text-slate-600 dark:text-zinc-400">
                Không tìm thấy phiên làm việc phù hợp
              </p>
              <p className="text-[11px] text-slate-400 dark:text-zinc-500 max-w-sm">
                Đảm bảo bạn đã từng chạy phiên làm việc với Claude Code (~/.claude) hoặc Codex (~/.codex) trên máy tính này.
              </p>
            </div>
          ) : (
            filteredCandidates.map((item) => {
              const isImportingThis = importingId === item.id;
              const sourceBadgeColor =
                item.source === 'claude'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';

              return (
                <div
                  key={`${item.source}-${item.id}`}
                  className="flex items-start justify-between gap-3 p-3 rounded-xl bg-surface border border-border hover:border-codex-accent/50 transition-all group"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${sourceBadgeColor}`}
                      >
                        {item.source === 'claude' ? 'Claude' : 'Codex'}
                      </span>
                      <h4 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 truncate">
                        {item.title || 'Untitled Session'}
                      </h4>
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500 ml-auto shrink-0">
                        {formatRelativeTime(item.modified || item.created)}
                      </span>
                    </div>

                    {item.firstMessage && (
                      <p className="text-[11px] text-slate-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                        {item.firstMessage}
                      </p>
                    )}

                    {item.cwd && (
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-zinc-500 pt-0.5">
                        <Folder className="w-3 h-3 shrink-0" />
                        <span className="truncate">{item.cwd}</span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleImport(item)}
                    disabled={Boolean(importingId)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-codex-accent hover:bg-codex-accent/90 text-white transition-all cursor-pointer shadow-xs shrink-0 self-center disabled:opacity-50"
                  >
                    {isImportingThis ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Đang nhập...</span>
                      </>
                    ) : (
                      <>
                        <span>Nhập</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-surface/30 shrink-0">
          <span className="text-[11px] text-slate-400 dark:text-zinc-500">
            Tìm thấy {filteredCandidates.length} phiên khả dụng
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-surface-highlight transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
