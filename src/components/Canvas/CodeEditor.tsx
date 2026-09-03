import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import {
  FileCode,
  FileText,
  Eye,
  Columns,
  Code2,
  Save,
  Loader2,
  AlertTriangle,
  History,
  RotateCcw,
  X,
  GitCommit,
} from 'lucide-react';
import { WorkspaceFile, ThemeMode, GitCommitSummary } from '../../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { FileTimelineDrawer } from './FileTimelineDrawer';
import { getFileLanguage, getLanguageLabel, isMarkdownFile } from '../../utils/fileLanguage';
import { useI18n } from '../../i18n/I18nProvider';

interface CodeEditorProps {
  file: WorkspaceFile | null;
  content: string;
  theme?: ThemeMode;
  onSaveFile?: (filePath: string, content: string) => Promise<boolean>;
  onDirtyChange?: (dirty: boolean) => void;
  onDraftChange?: (draft: string) => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  file,
  content,
  theme = 'light',
  onSaveFile,
  onDirtyChange,
  onDraftChange,
}) => {
  const { t } = useI18n();
  const [editorValue, setEditorValue] = useState<string>(content);
  const [isUserDirty, setIsUserDirty] = useState<boolean>(false);
  const [markdownMode, setMarkdownMode] = useState<'source' | 'split' | 'preview'>('source');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState<boolean>(false);
  const [selectedCommit, setSelectedCommit] = useState<GitCommitSummary | null>(null);
  const [historicalContent, setHistoricalContent] = useState<string | null>(null);
  const [isLoadingCommitContent, setIsLoadingCommitContent] = useState<boolean>(false);

  const prevFilePathRef = useRef<string | null>(file?.path || null);
  const currentFilePathRef = useRef<string | null>(file?.path || null);
  currentFilePathRef.current = file?.path || null;
  const savedContentRef = useRef<string>(content);
  const latestEditorValueRef = useRef<string>(editorValue);
  latestEditorValueRef.current = editorValue;

  const isDirty = Boolean(file && isUserDirty && editorValue !== savedContentRef.current);

  // Notify parent of dirty state changes
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const [hasExternalConflict, setHasExternalConflict] = useState<boolean>(false);

  // Synchronize internal state when content prop changes
  useEffect(() => {
    // 1. File path changed: reset everything to the newly selected file
    if (file?.path !== prevFilePathRef.current) {
      prevFilePathRef.current = file?.path || null;
      savedContentRef.current = content;
      setEditorValue(content);
      setIsUserDirty(false);
      setHasExternalConflict(false);
      setSelectedCommit(null);
      setHistoricalContent(null);
      onDraftChange?.(content);
      return;
    }

    // 2. Same file, but disk content prop changed
    if (content !== savedContentRef.current) {
      if (!isUserDirty) {
        // User has not edited, safely auto-update to new disk content
        savedContentRef.current = content;
        setEditorValue(content);
        setHasExternalConflict(false);
        onDraftChange?.(content);
      } else {
        // User has unsaved edits AND disk content changed -> real external conflict!
        setHasExternalConflict(true);
      }
    }
  }, [content, file?.path, isUserDirty, onDraftChange]);
  const handleSave = useCallback(async () => {
    if (!file || !isDirty || isSaving) return;
    setIsSaving(true);
    const saveTargetFilePath = file.path;
    const contentToSave = editorValue;
    try {
      let success = false;
      if (onSaveFile) {
        success = await onSaveFile(saveTargetFilePath, contentToSave);
      } else if (window.electronAPI) {
        success = await window.electronAPI.saveFile(saveTargetFilePath, contentToSave);
      }

      // Check against currentFilePathRef to verify file hasn't switched during await
      if (success && currentFilePathRef.current === saveTargetFilePath) {
        savedContentRef.current = contentToSave;
        setHasExternalConflict(false);
        // Only clear isUserDirty if user didn't type newer edits while saving
        if (latestEditorValueRef.current === contentToSave) {
          setIsUserDirty(false);
        }
      }
    } catch (err) {
      console.error('[CodeEditor] Failed to save file:', err);
    } finally {
      setIsSaving(false);
    }
  }, [file, isDirty, isSaving, editorValue, onSaveFile]);

  const handleSelectCommit = useCallback(async (commit: GitCommitSummary) => {
    if (!file) return;
    setSelectedCommit(commit);
    setIsLoadingCommitContent(true);
    if (window.electronAPI?.getFileAtCommit) {
      try {
        const res = await window.electronAPI.getFileAtCommit(commit.hash, file.path);
        if (res.success && typeof res.content === 'string') {
          setHistoricalContent(res.content);
        } else {
          setHistoricalContent('');
        }
      } catch (err) {
        console.error('[CodeEditor] Failed to fetch commit content:', err);
        setHistoricalContent('');
      } finally {
        setIsLoadingCommitContent(false);
      }
    } else {
      // Browser preview fallback
      setHistoricalContent(`// Historical version of ${file.relativePath} at ${commit.shortHash}\n${content}`);
      setIsLoadingCommitContent(false);
    }
  }, [file, content]);

  const handleRestoreVersion = useCallback(() => {
    if (historicalContent !== null) {
      setEditorValue(historicalContent);
      setIsUserDirty(historicalContent !== savedContentRef.current);
      onDraftChange?.(historicalContent);
      setSelectedCommit(null);
      setHistoricalContent(null);
      setIsTimelineOpen(false);
    }
  }, [historicalContent, onDraftChange]);

  const handleCloseDiff = useCallback(() => {
    setSelectedCommit(null);
    setHistoricalContent(null);
  }, []);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  // Global Cmd+S / Ctrl+S key listener
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        e.stopPropagation();
        handleSaveRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  if (!file) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-zinc-500 bg-background">
        <div className="w-14 h-14 rounded-2xl bg-surface border border-border flex items-center justify-center mb-4">
          <FileCode className="w-7 h-7 text-slate-400 dark:text-zinc-500 stroke-[1.5]" />
        </div>
        <div className="text-sm font-semibold text-slate-800 dark:text-zinc-300">{t('editor.noFileSelectedTitle')}</div>
        <div className="text-xs text-slate-500 dark:text-zinc-500 mt-1.5 max-w-sm">
          {t('editor.noFileSelectedDesc')}
        </div>
      </div>
    );
  }

  const isMarkdown = isMarkdownFile(file.name);
  const language = getFileLanguage(file.name);
  const languageLabel = getLanguageLabel(file.name);

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      {/* Editor Header Bar */}
      <div className="h-11 bg-surface border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0 shrink">
          {isMarkdown ? (
            <FileText className="w-4 h-4 text-purple-500 dark:text-purple-400 shrink-0" />
          ) : (
            <FileCode className="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0" />
          )}
          <span className="font-mono text-xs text-slate-800 dark:text-zinc-200 font-semibold truncate">
            {file.relativePath}
          </span>
          {isDirty && (
            <span
              className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0"
              title={t('editor.unsavedChanges')}
            />
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* External Change Conflict Warning Icon & Tooltip */}
          {hasExternalConflict && (
            <div className="relative group shrink-0">
              <button
                type="button"
                className="flex items-center justify-center p-1.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-colors cursor-pointer"
                title={t('editor.externalChangeBanner')}
              >
                <AlertTriangle className="w-3.5 h-3.5 animate-pulse" />
              </button>

              {/* Floating Tooltip / Popover on hover */}
              <div className="absolute right-0 top-full mt-2 w-72 p-3 bg-surface border border-border rounded-xl shadow-xl z-50 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-150 pointer-events-none group-hover:pointer-events-auto">
                <div className="flex items-start gap-2 text-xs text-slate-700 dark:text-zinc-200 mb-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span className="leading-snug">{t('editor.externalChangeBanner')}</span>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      setEditorValue(content);
                      savedContentRef.current = content;
                      setIsUserDirty(false);
                      setHasExternalConflict(false);
                      onDraftChange?.(content);
                    }}
                    className="px-2.5 py-1 bg-surface border border-border hover:bg-panel rounded-md text-[11px] font-medium text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                  >
                    {t('editor.reloadFromDisk')}
                  </button>
                  <button
                    onClick={() => {
                      savedContentRef.current = content;
                      setHasExternalConflict(false);
                    }}
                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-[11px] font-medium transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                  >
                    {t('editor.keepDraft')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Timeline Toggle Button */}
          <button
            onClick={() => setIsTimelineOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isTimelineOpen
                ? 'bg-codex-accent text-white font-semibold shadow-xs'
                : 'bg-surface text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 border border-border hover:bg-surface/80'
            }`}
            title={t('editor.timeline')}
          >
            <History className="w-3.5 h-3.5 shrink-0" />
            <span>{t('editor.timeline')}</span>
          </button>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isDirty
                ? 'bg-codex-accent text-white font-semibold shadow-xs hover:opacity-90'
                : 'bg-surface text-slate-400 dark:text-zinc-600 border border-border cursor-not-allowed opacity-60'
            }`}
            title={isDirty ? `${t('editor.save')} (⌘S)` : t('editor.save')}
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            ) : (
              <Save className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{isSaving ? t('editor.saving') : t('editor.save')}</span>
          </button>

          {/* Markdown View Switcher */}
          {isMarkdown && (
            <div className="flex items-center bg-panel rounded-lg p-0.5 border border-border shrink-0">
              <button
                onClick={() => setMarkdownMode('source')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  markdownMode === 'source'
                    ? 'bg-surface text-slate-900 dark:text-zinc-100 font-semibold shadow-xs border border-border'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                }`}
                title={t('editor.viewMarkdownSource')}
              >
                <Code2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span>Source</span>
              </button>

              <button
                onClick={() => setMarkdownMode('split')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  markdownMode === 'split'
                    ? 'bg-surface text-slate-900 dark:text-zinc-100 font-semibold shadow-xs border border-border'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                }`}
                title={t('editor.splitView')}
              >
                <Columns className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                <span>Split</span>
              </button>

              <button
                onClick={() => setMarkdownMode('preview')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  markdownMode === 'preview'
                    ? 'bg-codex-accent text-white font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                }`}
                title={t('editor.previewMarkdown')}
              >
                <Eye className="w-3.5 h-3.5 shrink-0" />
                <span>Preview</span>
              </button>
            </div>
          )}

          <div className="text-[11px] font-mono font-medium text-slate-500 dark:text-zinc-400 bg-surface px-2.5 py-1 rounded-md border border-border whitespace-nowrap shrink-0">
            {languageLabel}
          </div>
        </div>
      </div>

      {/* Editor Content Area */}
      {/* Editor Content Area + Timeline Drawer */}
      <div className="flex-1 min-h-0 relative flex overflow-hidden">
        {/* Main Editor or Diff Area */}
        <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
          {selectedCommit && historicalContent !== null ? (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-background">
              {/* Diff Mode Top Bar */}
              <div className="h-10 bg-panel border-b border-border px-4 flex items-center justify-between shrink-0 text-xs select-none">
                <div className="flex items-center gap-2">
                  <GitCommit className="w-4 h-4 text-codex-accent shrink-0" />
                  <span className="font-semibold text-slate-800 dark:text-zinc-200">
                    {t('editor.comparingWithCommit', { hash: selectedCommit.shortHash })}
                  </span>
                  <span className="text-slate-400 dark:text-zinc-500 font-mono text-[11px] truncate max-w-md">
                    — {selectedCommit.message}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRestoreVersion}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-codex-accent text-white font-semibold text-[11px] shadow-xs hover:opacity-90 transition-opacity cursor-pointer"
                    title={t('editor.restoreVersion')}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{t('editor.restoreVersion')}</span>
                  </button>
                  <button
                    onClick={handleCloseDiff}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-surface transition-colors cursor-pointer"
                    title={t('editor.closeTimeline')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Diff Editor */}
              <div className="flex-1 min-h-0 relative">
                <DiffEditor
                  height="100%"
                  language={language}
                  original={historicalContent}
                  modified={editorValue}
                  theme={theme === 'dark' ? 'vs-dark' : 'vs'}
                  options={{
                    readOnly: true,
                    renderSideBySide: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: 'JetBrains Mono, SF Mono, Menlo, Monaco, monospace',
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    diffWordWrap: 'off',
                  }}
                />
              </div>
            </div>
          ) : isLoadingCommitContent ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-zinc-500 bg-background">
              <Loader2 className="w-7 h-7 animate-spin mb-3 text-codex-accent" />
              <span className="text-xs font-medium">{t('editor.loadingCommitContent')}</span>
            </div>
          ) : (
            <div className="flex-1 min-h-0 relative flex">
              {/* 1. Source Editor (Visible in 'source' or 'split' modes) */}
              {(!isMarkdown || markdownMode === 'source' || markdownMode === 'split') && (
                <div
                  className={`h-full min-h-0 relative ${
                    isMarkdown && markdownMode === 'split'
                      ? 'w-1/2 border-r border-border'
                      : 'w-full'
                  }`}
                >
                  <Editor
                    height="100%"
                    language={language}
                    value={editorValue}
                    onChange={(val) => {
                      const next = val || '';
                      setEditorValue(next);
                      setIsUserDirty(next !== savedContentRef.current);
                      onDraftChange?.(next);
                    }}
                    onMount={(editor, monaco) => {
                      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                        handleSaveRef.current();
                      });
                    }}
                    theme={theme === 'dark' ? 'vs-dark' : 'vs'}
                    options={{
                      readOnly: false,
                      minimap: { enabled: !isMarkdown || markdownMode === 'source' },
                      fontSize: 13,
                      fontFamily: 'JetBrains Mono, SF Mono, Menlo, Monaco, monospace',
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      wordWrap: isMarkdown ? 'on' : 'off',
                    }}
                  />
                </div>
              )}

              {/* 2. Markdown Preview (Visible in 'preview' or 'split' modes) */}
              {isMarkdown && (markdownMode === 'preview' || markdownMode === 'split') && (
                <div
                  className={`h-full min-h-0 overflow-y-auto bg-background ${
                    markdownMode === 'split' ? 'w-1/2' : 'w-full'
                  }`}
                >
                  <MarkdownRenderer
                    content={editorValue}
                    theme={theme}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Timeline Drawer */}
        {isTimelineOpen && (
          <FileTimelineDrawer
            file={file}
            selectedCommitHash={selectedCommit?.hash || null}
            onSelectCommit={handleSelectCommit}
            onClose={() => {
              setIsTimelineOpen(false);
              setSelectedCommit(null);
              setHistoricalContent(null);
            }}
            theme={theme}
          />
        )}
      </div>
    </div>
  );
};
