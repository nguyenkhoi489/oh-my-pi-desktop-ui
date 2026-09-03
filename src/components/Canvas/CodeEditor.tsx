import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import {
  FileCode,
  FileText,
  Eye,
  Columns,
  Code2,
} from 'lucide-react';
import { WorkspaceFile, ThemeMode } from '../../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { getFileLanguage, getLanguageLabel, isMarkdownFile } from '../../utils/fileLanguage';
import { useI18n } from '../../i18n/I18nProvider';

interface CodeEditorProps {
  file: WorkspaceFile | null;
  content: string;
  theme?: ThemeMode;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  file,
  content,
  theme = 'light',
}) => {
  const { t } = useI18n();
  const [editorValue, setEditorValue] = useState<string>(content);
  const [markdownMode, setMarkdownMode] = useState<'source' | 'split' | 'preview'>('source');

  // Synchronize internal state when content prop changes
  useEffect(() => {
    setEditorValue(content);
  }, [content, file?.path]);

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
        <div className="flex items-center gap-2.5">
          {isMarkdown ? (
            <FileText className="w-4 h-4 text-purple-500 dark:text-purple-400" />
          ) : (
            <FileCode className="w-4 h-4 text-blue-500 dark:text-blue-400" />
          )}
          <span className="font-mono text-xs text-slate-800 dark:text-zinc-200 font-semibold">
            {file.relativePath}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Markdown View Switcher */}
          {isMarkdown && (
            <div className="flex items-center bg-panel rounded-lg p-0.5 border border-border">
              <button
                onClick={() => setMarkdownMode('source')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer ${
                  markdownMode === 'source'
                    ? 'bg-surface text-slate-900 dark:text-zinc-100 font-semibold shadow-xs border border-border'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                }`}
                title={t('editor.viewMarkdownSource')}
              >
                <Code2 className="w-3.5 h-3.5 text-blue-500" />
                <span>Source</span>
              </button>

              <button
                onClick={() => setMarkdownMode('split')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer ${
                  markdownMode === 'split'
                    ? 'bg-surface text-slate-900 dark:text-zinc-100 font-semibold shadow-xs border border-border'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                }`}
                title={t('editor.splitView')}
              >
                <Columns className="w-3.5 h-3.5 text-purple-500" />
                <span>Split</span>
              </button>

              <button
                onClick={() => setMarkdownMode('preview')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer ${
                  markdownMode === 'preview'
                    ? 'bg-codex-accent text-white font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                }`}
                title={t('editor.previewMarkdown')}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>
            </div>
          )}

          <div className="text-[11px] font-mono font-medium text-slate-500 dark:text-zinc-400 bg-surface px-2.5 py-1 rounded-md border border-border">
            {languageLabel}
          </div>
        </div>
      </div>

      {/* Editor Content Area */}
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
              onChange={(val) => setEditorValue(val || '')}
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
    </div>
  );
};
