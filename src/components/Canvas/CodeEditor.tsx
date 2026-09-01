import React from 'react';
import Editor from '@monaco-editor/react';
import { FileCode } from 'lucide-react';
import { WorkspaceFile, ThemeMode } from '../../types';

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
  if (!file) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-zinc-500">
        <FileCode className="w-12 h-12 mb-3 text-slate-300 dark:text-zinc-600 stroke-[1.5]" />
        <div className="text-sm font-medium text-slate-700 dark:text-zinc-400">Chưa chọn file nào để xem</div>
        <div className="text-xs text-slate-500 dark:text-zinc-600 mt-1">Chọn một file từ cây thư mục bên trái để mở.</div>
      </div>
    );
  }

  const getLanguage = (fileName: string) => {
    if (fileName.endsWith('.ts') || fileName.endsWith('.tsx')) return 'typescript';
    if (fileName.endsWith('.js') || fileName.endsWith('.jsx')) return 'javascript';
    if (fileName.endsWith('.json')) return 'json';
    if (fileName.endsWith('.css')) return 'css';
    if (fileName.endsWith('.html')) return 'html';
    if (fileName.endsWith('.md')) return 'markdown';
    return 'plaintext';
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="h-10 bg-surface border-b border-border flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="font-mono text-xs text-slate-800 dark:text-zinc-200 font-semibold">
            {file.relativePath}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <Editor
          height="100%"
          language={getLanguage(file.name)}
          value={content}
          theme={theme === 'dark' ? 'vs-dark' : 'vs'}
          options={{
            readOnly: false,
            minimap: { enabled: true },
            fontSize: 12.5,
            fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
};
