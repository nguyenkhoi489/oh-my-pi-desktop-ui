import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  GitCommit,
  GitBranch,
  FileCode,
  Send,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Sparkles,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { parseCommitMessage } from '../../utils/commitMessage';
import type { OmpModelInfo, GitStatusResult, TaskOutputEvent } from '../../types';

export interface CommitViewProps {
  workspacePath?: string;
  availableModels?: OmpModelInfo[];
  selectedModel?: OmpModelInfo | string | null;
  onCommitSuccess?: () => void;
}

export const CommitView: React.FC<CommitViewProps> = ({
  workspacePath,
  availableModels = [],
  selectedModel,
  onCommitSuccess,
}) => {
  const { t } = useI18n();

  // Git status state
  const [gitStatus, setGitStatus] = useState<GitStatusResult | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // Configuration form state
  const [context, setContext] = useState('');
  const [model, setModel] = useState<string>('');
  const [push, setPush] = useState(false);
  const [noChangelog, setNoChangelog] = useState(false);
  const [legacy, setLegacy] = useState(false);

  // Execution state & results
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [proposedMessage, setProposedMessage] = useState('');
  const [initialAiMessage, setInitialAiMessage] = useState('');
  const [isEdited, setIsEdited] = useState(false);

  // Log streaming
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const fullStdoutRef = useRef<string>('');
  const isGeneratingRef = useRef<boolean>(false);
  const isPushingRef = useRef<boolean>(false);
  const isCommittingRef = useRef<boolean>(false);

  isGeneratingRef.current = isGenerating;
  isCommittingRef.current = isCommitting;

  // Initialize default model from selectedModel
  useEffect(() => {
    if (selectedModel) {
      const modelId = typeof selectedModel === 'string' ? selectedModel : selectedModel.id;
      setModel(modelId);
    }
  }, [selectedModel]);

  // Check Git status
  const checkStatus = useCallback(async () => {
    setGitStatus(null);
    if (!workspacePath || !window.electronAPI?.getCommitStatus) return;
    setIsCheckingStatus(true);
    setErrorMessage(null);
    try {
      const res = await window.electronAPI.getCommitStatus(workspacePath);
      setGitStatus(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setGitStatus({
        isGit: false,
        isDirty: false,
        error: msg || t('commitAssistant.statusError'),
      });
    } finally {
      setIsCheckingStatus(false);
    }
  }, [workspacePath, t]);

  useEffect(() => {
    checkStatus();
    setProposedMessage('');
    setInitialAiMessage('');
    setIsEdited(false);
    setLogs([]);
    setErrorMessage(null);
    setSuccessMessage(null);
    fullStdoutRef.current = '';
  }, [checkStatus]);

  // Subscribe to task output events from main process
  useEffect(() => {
    if (!window.electronAPI?.onCommitOutput) return;

    const cleanup = window.electronAPI.onCommitOutput((event: TaskOutputEvent) => {
      if (event.type === 'stdout' || event.type === 'stderr') {
        const text = event.text || '';
        if (event.type === 'stdout') {
          fullStdoutRef.current += text;
        }
        setLogs((prev) => [...prev.slice(-500), text]);
      } else if (event.type === 'status') {
        if (event.text) {
          setLogs((prev) => [...prev.slice(-500), `[STATUS] ${event.text}`]);
        }

        // Handle task completion
        if (event.status === 'done') {
          if (isGeneratingRef.current) {
            setIsGenerating(false);
            const parsed = parseCommitMessage(fullStdoutRef.current);
            if (parsed) {
              setProposedMessage(parsed);
              setInitialAiMessage(parsed);
              setIsEdited(false);
            } else {
              setErrorMessage(t('commitAssistant.extractError'));
            }
          } else if (isCommittingRef.current) {
            if (isPushingRef.current && event.taskId === 'commit-custom') {
              return;
            }
            setIsCommitting(false);
            setSuccessMessage(t('commitAssistant.success'));
            onCommitSuccess?.();
            checkStatus();
          }
        } else if (event.status === 'error') {
          if (isGeneratingRef.current) {
            setIsGenerating(false);
          }
          if (isCommittingRef.current) {
            setIsCommitting(false);
          }
          setErrorMessage(event.text || t('commitAssistant.error'));
        }
      }
    });

    return () => {
      cleanup();
    };
  }, [t, onCommitSuccess, checkStatus]);

  // Auto-scroll logs
  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogs]);

  // Trigger dry-run message generation
  const handleGenerate = async () => {
    if (!workspacePath || !window.electronAPI?.runCommit) return;
    setIsGenerating(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setLogs([]);
    fullStdoutRef.current = '';

    try {
      const res = await window.electronAPI.runCommit({
        dryRun: true,
        context,
        model: model || undefined,
        noChangelog,
        legacy,
        cwd: workspacePath,
      });

      if (!res.success) {
        setIsGenerating(false);
        setErrorMessage(res.error || t('commitAssistant.error'));
      }
    } catch (err: unknown) {
      setIsGenerating(false);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg || t('commitAssistant.error'));
    }
  };

  // Trigger actual commit execution
  const handleCommit = async (shouldPush = false) => {
    if (!workspacePath || !window.electronAPI?.runCommit) return;
    const willPush = shouldPush || push;
    isPushingRef.current = willPush;
    setIsCommitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setLogs([]);
    fullStdoutRef.current = '';

    // Use generated or user-provided message to commit directly, avoiding duplicate AI scan
    const messageToCommit = proposedMessage.trim();

    try {
      const res = await window.electronAPI.runCommit({
        dryRun: false,
        push: willPush,
        context,
        model: model || undefined,
        noChangelog,
        legacy,
        editedMessage: messageToCommit || undefined,
        cwd: workspacePath,
      });

      if (!res.success) {
        setIsCommitting(false);
        setErrorMessage(res.error || t('commitAssistant.error'));
      }
    } catch (err: unknown) {
      setIsCommitting(false);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg || t('commitAssistant.error'));
    }
  };

  // Cancel running task
  const handleCancel = async () => {
    if (!window.electronAPI?.cancelCommit) return;
    try {
      await window.electronAPI.cancelCommit();
    } catch {}
  };

  const isBusy = isGenerating || isCommitting;
  const isGit = gitStatus?.isGit !== false;
  const isDirty = Boolean(gitStatus?.isDirty);
  const canRun = isGit && isDirty && !isBusy && !isCheckingStatus;

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden text-slate-900 dark:text-zinc-100">
      {/* Top Status Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <GitCommit className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold flex items-center gap-2">
              <span>{t('commitAssistant.modalTitle')}</span>
              {gitStatus?.branch && (
                <span className="inline-flex items-center gap-1 text-[11px] font-normal px-2 py-0.5 rounded-full bg-surface-highlight border border-border text-slate-600 dark:text-zinc-400">
                  <GitBranch className="w-3 h-3 text-emerald-500" />
                  {gitStatus.branch}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              {gitStatus?.filesCount !== undefined
                ? gitStatus.filesCount > 0
                  ? t('commitAssistant.dirtyFilesCount', { count: gitStatus.filesCount })
                  : t('commitAssistant.cleanWorkingTree')
                : t('commitAssistant.openTitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={checkStatus}
            disabled={isBusy || isCheckingStatus}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-surface-highlight border border-border transition-colors disabled:opacity-40 cursor-pointer"
            title={t('commitAssistant.refreshGitStatus')}
          >
            <RotateCw className={`w-3.5 h-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('commitAssistant.refreshGitStatus')}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Git status warning */}
          {!isCheckingStatus && !isGit && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{t('commitAssistant.notGitRepo')}</span>
            </div>
          )}

          {!isCheckingStatus && isGit && !isDirty && (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-400 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{t('commitAssistant.cleanWorkingTree')}</span>
            </div>
          )}

          {/* Error banner */}
          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Success banner */}
          {successMessage && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Context & Model Configuration Box */}
          <div className="space-y-3 bg-surface p-4 rounded-xl border border-border shadow-xs">
            {/* Context */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                {t('commitAssistant.contextLabel')}
              </label>
              <textarea
                rows={2}
                value={context}
                onChange={(e) => setContext(e.target.value)}
                disabled={isBusy}
                placeholder={t('commitAssistant.contextPlaceholder')}
                className="w-full text-xs px-3 py-2 rounded-lg bg-panel border border-border focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 resize-none disabled:opacity-50"
              />
            </div>

            {/* Model & Push Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {/* Model selection */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                  {t('commitAssistant.modelLabel')}
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={isBusy}
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-panel border border-border text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                >
                  <option value="">{t('commitAssistant.modelDefault')}</option>
                  {availableModels.map((m) => (
                    <option key={`${m.provider}/${m.id}`} value={m.id}>
                      {m.name || m.id} ({m.provider})
                    </option>
                  ))}
                </select>
              </div>

              {/* Push toggle */}
              <div className="flex flex-col justify-center">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-zinc-300 py-1">
                  <input
                    type="checkbox"
                    checked={push}
                    onChange={(e) => setPush(e.target.checked)}
                    disabled={isBusy}
                    className="rounded border-border text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 cursor-pointer disabled:opacity-50"
                  />
                  <span>{t('commitAssistant.pushLabel')}</span>
                </label>
                <span className="text-[11px] text-slate-500 dark:text-zinc-400 pl-5.5">
                  {t('commitAssistant.pushDesc')}
                </span>
              </div>
            </div>

            {/* Advanced Toggles */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-border/60">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={noChangelog}
                  onChange={(e) => setNoChangelog(e.target.checked)}
                  disabled={isBusy}
                  className="rounded border-border text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 cursor-pointer disabled:opacity-50"
                />
                <span>{t('commitAssistant.noChangelogLabel')}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={legacy}
                  onChange={(e) => setLegacy(e.target.checked)}
                  disabled={isBusy}
                  className="rounded border-border text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 cursor-pointer disabled:opacity-50"
                />
                <span>{t('commitAssistant.legacyLabel')}</span>
              </label>
            </div>
          </div>

          {/* Generate Message Action Bar */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={handleGenerate}
              disabled={!canRun}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('commitAssistant.generating')}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{t('commitAssistant.generateMessage')}</span>
                </>
              )}
            </button>

            {isBusy && (
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 rounded-lg text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition-colors cursor-pointer"
              >
                {t('commitAssistant.cancel')}
              </button>
            )}
          </div>

          {/* Message Preview & Edit Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-700 dark:text-zinc-300">
                {t('commitAssistant.previewLabel')}
              </label>
              {proposedMessage && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${
                    isEdited
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  }`}
                >
                  {isEdited
                    ? t('commitAssistant.editedNotice')
                    : t('commitAssistant.aiGeneratedNotice')}
                </span>
              )}
            </div>
            <textarea
              rows={5}
              value={proposedMessage}
              onChange={(e) => {
                setProposedMessage(e.target.value);
                if (initialAiMessage && e.target.value !== initialAiMessage) {
                  setIsEdited(true);
                }
              }}
              disabled={isBusy}
              placeholder={t('commitAssistant.previewPlaceholder')}
              className="w-full text-xs font-mono px-3 py-2.5 rounded-xl bg-surface border border-border focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 resize-none disabled:opacity-50"
            />
          </div>

          {/* Final Commit Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              onClick={() => handleCommit(false)}
              disabled={!canRun || !proposedMessage.trim()}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-surface-highlight hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-900 dark:text-zinc-100 border border-border transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isCommitting && !push ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('commitAssistant.committing')}</span>
                </>
              ) : (
                <>
                  <GitCommit className="w-3.5 h-3.5" />
                  <span>{t('commitAssistant.commit')}</span>
                </>
              )}
            </button>

            <button
              onClick={() => handleCommit(true)}
              disabled={!canRun || !proposedMessage.trim()}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isCommitting && push ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('commitAssistant.committing')}</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>{t('commitAssistant.commitAndPush')}</span>
                </>
              )}
            </button>
          </div>

          {/* Log Stream Collapsible */}
          <div className="border border-border rounded-xl overflow-hidden bg-surface">
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="w-full flex items-center justify-between px-3.5 py-2 text-xs text-slate-600 dark:text-zinc-400 hover:bg-surface-highlight transition-colors cursor-pointer"
            >
              <span className="font-medium flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-slate-500" />
                {t('commitAssistant.logsTitle')}
                {logs.length > 0 && (
                  <span className="text-[10px] bg-panel px-1.5 py-0.2 rounded border border-border">
                    {logs.length}
                  </span>
                )}
              </span>
              {showLogs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showLogs && (
              <div className="p-3.5 bg-panel border-t border-border font-mono text-[11px] text-slate-700 dark:text-zinc-300 max-h-48 overflow-y-auto space-y-1">
                {logs.length === 0 ? (
                  <div className="text-slate-400 dark:text-zinc-500 italic">
                    {t('commitAssistant.noLogs')}
                  </div>
                ) : (
                  logs.map((line, idx) => (
                    <div key={idx} className="whitespace-pre-wrap leading-relaxed">
                      {line}
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
