import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  X,
  Moon,
  Sun,
  Cpu,
  Terminal,
  Shield,
  Brain,
  FolderSearch,
  AlertTriangle,
  Check,
  RotateCw,
  Sliders,
  Database,
} from 'lucide-react';
import {
  ThemeMode,
  OmpInstallStatus,
  OmpModelInfo,
  OmpThinkingLevel,
  OmpApprovalMode,
  AppSettings,
} from '../../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  installStatus?: OmpInstallStatus | null;
  onSelectBinaryFile?: () => Promise<string | null>;
  onSetCustomBinaryPath?: (path: string) => Promise<void | OmpInstallStatus>;
  availableModels: OmpModelInfo[];
  onRestartEngine?: () => Promise<void>;
  isEngineRunning?: boolean;
}

const THINKING_LEVELS: { id: OmpThinkingLevel; label: string; desc: string }[] = [
  { id: 'off', label: 'Tắt (Off)', desc: 'Không sử dụng reasoning block' },
  { id: 'minimal', label: 'Tối thiểu (Minimal)', desc: 'Chỉ reasoning rất ngắn' },
  { id: 'low', label: 'Thấp (Low)', desc: 'Reasoning mức cơ bản' },
  { id: 'medium', label: 'Vừa (Medium)', desc: 'Reasoning cân bằng hiệu năng' },
  { id: 'high', label: 'Cao (High)', desc: 'Reasoning sâu, kỹ lưỡng' },
  { id: 'xhigh', label: 'Rất cao (XHigh)', desc: 'Reasoning chuyên sâu cho tác vụ khó' },
  { id: 'max', label: 'Tối đa (Max)', desc: 'Tối đa ngân sách suy nghĩ của model' },
  { id: 'auto', label: 'Tự động (Auto)', desc: 'Model tự điều chỉnh mức độ suy nghĩ' },
];

const APPROVAL_OPTIONS: { id: OmpApprovalMode; label: string; desc: string }[] = [
  { id: 'always-ask', label: 'Luôn hỏi (Always Ask)', desc: 'Hỏi xác nhận trước mọi thao tác đọc/ghi file hoặc chạy lệnh' },
  { id: 'write', label: 'Chỉ hỏi khi ghi (Write)', desc: 'Tự động cấp quyền đọc, chỉ hỏi khi sửa file hoặc chạy lệnh' },
  { id: 'yolo', label: 'Tự động toàn bộ (Yolo)', desc: 'Tự động cấp tất cả quyền thực thi mà không cần hỏi lại' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  theme,
  onThemeChange,
  installStatus,
  onSelectBinaryFile,
  onSetCustomBinaryPath,
  availableModels,
  onRestartEngine,
  isEngineRunning = false,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'engine'>('general');
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'light',
    approvalMode: 'always-ask',
    defaultThinkingLevel: 'off',
    autoCompaction: false,
  });
  const [customPathInput, setCustomPathInput] = useState<string>('');
  const [hasEngineChanged, setHasEngineChanged] = useState<boolean>(false);
  const [isRestarting, setIsRestarting] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      if (window.electronAPI?.getSettings) {
        const loaded = await window.electronAPI.getSettings();
        setSettings(loaded);
        setCustomPathInput(loaded.customBinaryPath || '');
      } else {
        const raw = localStorage.getItem('omp_settings');
        if (raw) {
          const parsed = JSON.parse(raw);
          setSettings(parsed);
          setCustomPathInput(parsed.customBinaryPath || '');
        }
      }
    } catch (err) {
      console.warn('[SettingsModal] Lỗi khi tải cài đặt:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      setHasEngineChanged(false);
      setSaveStatus(null);
    }
  }, [isOpen, loadSettings]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const savePartial = async (partial: Partial<AppSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    try {
      if (window.electronAPI?.setSettings) {
        await window.electronAPI.setSettings(partial);
      } else {
        localStorage.setItem('omp_settings', JSON.stringify(next));
      }
      setSaveStatus('Đã lưu');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      console.error('[SettingsModal] Lỗi khi lưu cài đặt:', err);
    }
  };

  const handleThemeSelect = (newTheme: ThemeMode) => {
    onThemeChange(newTheme);
    savePartial({ theme: newTheme });
  };

  const handleModelSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (!value) {
      savePartial({ defaultProvider: undefined, defaultModel: undefined });
      setHasEngineChanged(true);
      return;
    }
    const [provider, modelId] = value.split(':::');
    savePartial({ defaultProvider: provider, defaultModel: modelId });
    setHasEngineChanged(true);
  };

  const handleThinkingLevelSelect = (level: OmpThinkingLevel) => {
    savePartial({ defaultThinkingLevel: level });
    setHasEngineChanged(true);
  };

  const handleApprovalModeSelect = (mode: OmpApprovalMode) => {
    savePartial({ approvalMode: mode });
    setHasEngineChanged(true);
  };

  const handleAutoCompactionToggle = () => {
    const nextVal = !settings.autoCompaction;
    savePartial({ autoCompaction: nextVal });
    setHasEngineChanged(true);
  };

  const handleApplyCustomPath = async () => {
    const path = customPathInput.trim();
    await savePartial({ customBinaryPath: path });
    if (onSetCustomBinaryPath) {
      await onSetCustomBinaryPath(path);
    }
    setHasEngineChanged(true);
  };

  const handleBrowseBinary = async () => {
    if (onSelectBinaryFile) {
      const selected = await onSelectBinaryFile();
      if (selected) {
        setCustomPathInput(selected);
        await savePartial({ customBinaryPath: selected });
        if (onSetCustomBinaryPath) {
          await onSetCustomBinaryPath(selected);
        }
        setHasEngineChanged(true);
      }
    }
  };

  const handleRestartEngine = async () => {
    if (onRestartEngine) {
      setIsRestarting(true);
      try {
        await onRestartEngine();
        setHasEngineChanged(false);
      } finally {
        setIsRestarting(false);
      }
    }
  };

  // Group models by provider
  const groupedModels = availableModels.reduce<Record<string, OmpModelInfo[]>>((acc, m) => {
    const provider = m.provider || 'khác';
    if (!acc[provider]) acc[provider] = [];
    acc[provider].push(m);
    return acc;
  }, {});

  const currentModelValue =
    settings.defaultProvider && settings.defaultModel
      ? `${settings.defaultProvider}:::${settings.defaultModel}`
      : '';

  const isCurrentModelInCatalog =
    !currentModelValue ||
    availableModels.some(
      (m) => m.provider === settings.defaultProvider && m.id === settings.defaultModel
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4 select-none">
      <div className="w-full max-w-2xl bg-panel border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-surface-highlight border border-border text-codex-accent">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Cài đặt</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">Tùy chỉnh giao diện và cấu hình OMP Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saveStatus && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                {saveStatus}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-surface-highlight text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
              title="Đóng (ESC)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border bg-surface/50 px-6 gap-2">
          <button
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'general'
                ? 'border-codex-accent text-codex-accent'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Giao diện
          </button>
          <button
            onClick={() => setActiveTab('engine')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'engine'
                ? 'border-codex-accent text-codex-accent'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            Engine & Khởi động
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* Theme Settings */}
              <div>
                <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100 block mb-2">
                  Chủ đề giao diện (Theme)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleThemeSelect('light')}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all cursor-pointer text-left ${
                      theme === 'light'
                        ? 'bg-surface-highlight border-codex-accent ring-2 ring-codex-accent/20'
                        : 'bg-surface border-border hover:border-slate-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
                      <Sun className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-900 dark:text-zinc-100">Giao diện Sáng (Light)</div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400">Tone trắng thanh lịch, tương phản cao</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleThemeSelect('dark')}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all cursor-pointer text-left ${
                      theme === 'dark'
                        ? 'bg-surface-highlight border-codex-accent ring-2 ring-codex-accent/20'
                        : 'bg-surface border-border hover:border-slate-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 shrink-0">
                      <Moon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-900 dark:text-zinc-100">Giao diện Tối (Dark)</div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400">Tone đen xám dịu mắt, phong cách Codex</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'engine' && (
            <div className="space-y-6">
              {/* Binary Path Section */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-codex-accent" />
                  Đường dẫn OMP Binary
                </label>
                <div className="p-3 bg-surface rounded-xl border border-border space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-zinc-400">Đường dẫn tự phát hiện:</span>
                    <span className="font-mono text-[11px] text-slate-700 dark:text-zinc-300 max-w-[320px] truncate">
                      {installStatus?.binaryPath || 'Chưa tìm thấy'}
                    </span>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 dark:text-zinc-400 block mb-1">
                      Đường dẫn tùy chỉnh (Custom override):
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customPathInput}
                        onChange={(e) => setCustomPathInput(e.target.value)}
                        placeholder="Ví dụ: /usr/local/bin/omp hoặc ~/.local/bin/omp"
                        className="flex-1 px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:border-codex-accent"
                      />
                      <button
                        onClick={handleBrowseBinary}
                        className="px-3 py-1.5 bg-surface hover:bg-surface-highlight border border-border rounded-lg text-xs font-medium text-slate-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer"
                        title="Chọn file từ ổ cứng"
                      >
                        <FolderSearch className="w-3.5 h-3.5" />
                        Chọn file
                      </button>
                      <button
                        onClick={handleApplyCustomPath}
                        className="px-3 py-1.5 bg-codex-accent text-white rounded-lg text-xs font-medium hover:bg-codex-accent/90 transition-colors cursor-pointer"
                      >
                        Áp dụng
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Default Model & Provider */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Brain className="w-3.5 h-3.5 text-codex-accent" />
                    Model & Provider mặc định khi khởi động
                  </span>
                  {!isCurrentModelInCatalog && (
                    <span className="text-[11px] text-amber-500 flex items-center gap-1 font-normal">
                      <AlertTriangle className="w-3 h-3" />
                      Model không có trong catalog hiện tại
                    </span>
                  )}
                </label>
                <div className="bg-surface rounded-xl border border-border p-3 space-y-2">
                  <select
                    value={currentModelValue}
                    onChange={handleModelSelect}
                    className="w-full px-3 py-2 bg-surface-highlight border border-border rounded-lg text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent cursor-pointer"
                  >
                    <option value="">(Mặc định của Engine / Cấu hình OMP)</option>
                    {Object.entries(groupedModels).map(([provider, models]) => (
                      <optgroup key={provider} label={provider.toUpperCase()}>
                        {models.map((m) => (
                          <option key={`${provider}:::${m.id}`} value={`${provider}:::${m.id}`}>
                            {m.name || m.id} {m.reasoning ? '🧠' : ''}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    {!isCurrentModelInCatalog && settings.defaultModel && settings.defaultProvider && (
                      <optgroup label="MODEL ĐÃ LƯU TRƯỚC ĐÓ">
                        <option value={currentModelValue}>
                          {settings.defaultModel} ({settings.defaultProvider})
                        </option>
                      </optgroup>
                    )}
                  </select>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    {availableModels.length > 0
                      ? `Đã tải ${availableModels.length} models từ catalog thật của Engine.`
                      : 'Chưa kết nối engine hoặc catalog rỗng. Sẽ tự động tải khi engine hoạt động.'}
                  </p>
                </div>
              </div>

              {/* Thinking Level */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5 text-indigo-400" />
                  Mức độ suy nghĩ mặc định (Thinking Level)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {THINKING_LEVELS.map((tl) => {
                    const isSelected = (settings.defaultThinkingLevel || 'off') === tl.id;
                    return (
                      <button
                        key={tl.id}
                        onClick={() => handleThinkingLevelSelect(tl.id)}
                        className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-surface-highlight border-codex-accent ring-1 ring-codex-accent/30'
                            : 'bg-surface border-border hover:border-slate-300 dark:hover:border-zinc-700'
                        }`}
                      >
                        <div className="text-xs font-medium text-slate-900 dark:text-zinc-100 flex items-center justify-between">
                          {tl.label}
                          {isSelected && <Check className="w-3.5 h-3.5 text-codex-accent" />}
                        </div>
                        <div className="text-[10.5px] text-slate-500 dark:text-zinc-400 mt-0.5">{tl.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Approval Mode */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-500" />
                  Chế độ phê duyệt mặc định (Approval Mode)
                </label>
                <div className="space-y-2">
                  {APPROVAL_OPTIONS.map((opt) => {
                    const isSelected = (settings.approvalMode || 'always-ask') === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleApprovalModeSelect(opt.id)}
                        className={`w-full p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-surface-highlight border-codex-accent ring-1 ring-codex-accent/30'
                            : 'bg-surface border-border hover:border-slate-300 dark:hover:border-zinc-700'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-medium text-slate-900 dark:text-zinc-100">{opt.label}</div>
                          <div className="text-[11px] text-slate-500 dark:text-zinc-400">{opt.desc}</div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-codex-accent shrink-0 ml-3" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Auto Compaction */}
              <div className="p-3.5 bg-surface rounded-xl border border-border flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Database className="w-4 h-4 text-codex-accent shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                      Tự động nén ngữ cảnh (Auto-compaction)
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Tự động tóm tắt ngữ cảnh khi dung lượng token vượt quá ngưỡng cho phép
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleAutoCompactionToggle}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                    settings.autoCompaction ? 'bg-codex-accent justify-end' : 'bg-slate-300 dark:bg-zinc-700 justify-start'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-white shadow-xs" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer / Restart Banner */}
        <div className="p-4 border-t border-border bg-surface flex items-center justify-between">
          <div className="flex items-center gap-2">
            {hasEngineChanged && (
              <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Thay đổi sẽ có hiệu lực khi khởi động lại engine.
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            {hasEngineChanged && onRestartEngine && (
              <button
                onClick={handleRestartEngine}
                disabled={isRestarting}
                className="px-3 py-1.5 bg-codex-accent text-white rounded-lg text-xs font-medium hover:bg-codex-accent/90 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isRestarting ? 'animate-spin' : ''}`} />
                {isRestarting ? 'Đang khởi động lại...' : isEngineRunning ? 'Khởi động lại Engine ngay' : 'Khởi động Engine ngay'}
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-surface hover:bg-surface-highlight border border-border rounded-lg text-xs font-medium text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
