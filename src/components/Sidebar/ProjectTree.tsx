import React, { useState } from 'react';
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  ChevronRight,
  ChevronDown,
  GitBranch,
} from 'lucide-react';
import { WorkspaceFile } from '../../types';

interface ProjectTreeProps {
  files: WorkspaceFile[];
  selectedFile: WorkspaceFile | null;
  onSelectFile: (file: WorkspaceFile) => void;
}

export const ProjectTree: React.FC<ProjectTreeProps> = ({
  files,
  selectedFile,
  onSelectFile,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    src: true,
    'src/auth': true,
  });

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  const getFileIcon = (file: WorkspaceFile) => {
    if (file.isDirectory) {
      return expandedFolders[file.relativePath] ? (
        <FolderOpen className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
      ) : (
        <Folder className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400 shrink-0" />
      );
    }
    if (file.name.endsWith('.ts') || file.name.endsWith('.tsx') || file.name.endsWith('.js')) {
      return <FileCode className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />;
    }
    return <FileText className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400 shrink-0" />;
  };

  const renderFileNode = (file: WorkspaceFile, depth = 0) => {
    const isExpanded = !!expandedFolders[file.relativePath];
    const isSelected = selectedFile?.path === file.path;

    return (
      <div key={file.path || file.relativePath}>
        <div
          onClick={() => {
            if (file.isDirectory) {
              toggleFolder(file.relativePath);
            } else {
              onSelectFile(file);
            }
          }}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          className={`flex items-center gap-1.5 py-1 pr-2 text-xs rounded cursor-pointer transition-colors ${
            isSelected
              ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200 font-medium border-l-2 border-purple-600 dark:border-purple-500'
              : 'text-slate-600 dark:text-zinc-400 hover:bg-surface-highlight hover:text-slate-900 dark:hover:text-zinc-200'
          }`}
        >
          {file.isDirectory && (
            <span className="text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300">
              {isExpanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </span>
          )}
          {!file.isDirectory && <span className="w-3" />}

          {getFileIcon(file)}

          <span className="truncate flex-1 font-mono text-[11px]">{file.name}</span>

          {file.gitStatus === 'modified' && (
            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-400/10 px-1 rounded border border-amber-300 dark:border-transparent">
              M
            </span>
          )}
        </div>

        {file.isDirectory && isExpanded && file.children && (
          <div>
            {file.children.map((child) => renderFileNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-1.5">
      <div className="flex items-center justify-between px-2 py-1 mb-1 text-[11px] font-semibold text-slate-400 dark:text-zinc-500 tracking-wider uppercase">
        <span>Files</span>
        <GitBranch className="w-3 h-3 text-slate-400 dark:text-zinc-500" />
      </div>

      <div className="space-y-0.5">
        {files.map((f) => renderFileNode(f))}
      </div>
    </div>
  );
};
