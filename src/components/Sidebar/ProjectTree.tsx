import React, { useCallback, useEffect, useState } from 'react';
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  ChevronRight,
  ChevronDown,
  FolderGit2,
  PanelLeftClose,
  ChevronsDownUp,
  ChevronsUpDown,
  Terminal,
  Database,
  Boxes,
  Settings,
  MessageSquarePlus,
  Copy,
  FolderSymlink,
  Trash2,
} from 'lucide-react';
import { WorkspaceFile } from '../../types';
import { getFileInfo } from '../../utils/fileLanguage';

interface ProjectTreeProps {
  files: WorkspaceFile[];
  selectedFile: WorkspaceFile | null;
  onSelectFile: (file: WorkspaceFile) => void;
  onCollapseSidebar?: () => void;
  onAddToChat?: (file: WorkspaceFile) => void;
  onDeleteFile?: (file: WorkspaceFile) => void | Promise<void>;
}

const MENU_WIDTH = 210;
const MENU_MAX_HEIGHT = 230;

const ProjectTreeComponent: React.FC<ProjectTreeProps> = ({
  files,
  selectedFile,
  onSelectFile,
  onCollapseSidebar,
  onAddToChat,
  onDeleteFile,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    file: WorkspaceFile;
  } | null>(null);
  const [fileToDelete, setFileToDelete] = useState<WorkspaceFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const closeMenu = useCallback(() => setContextMenu(null), []);

  const openContextMenu = useCallback((e: React.MouseEvent, file: WorkspaceFile) => {
    e.preventDefault();
    e.stopPropagation();
    // Ghim menu trong viewport
    const x = Math.min(e.clientX, window.innerWidth - MENU_WIDTH - 8);
    const y = Math.min(e.clientY, window.innerHeight - MENU_MAX_HEIGHT - 8);
    setContextMenu({ x: Math.max(8, x), y: Math.max(8, y), file });
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', closeMenu);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', closeMenu);
    };
  }, [contextMenu, closeMenu]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  const revealInFinder = useCallback((file: WorkspaceFile) => {
    window.electronAPI?.revealInFinder?.(file.path).catch(() => {});
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!fileToDelete || !onDeleteFile) return;
    setIsDeleting(true);
    try {
      await onDeleteFile(fileToDelete);
    } finally {
      setIsDeleting(false);
      setFileToDelete(null);
    }
  }, [fileToDelete, onDeleteFile]);

  const toggleFolder = (key: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const expandAllFolders = () => {
    const next: Record<string, boolean> = {};
    const traverse = (items: WorkspaceFile[]) => {
      for (const item of items) {
        if (item.isDirectory) {
          next[item.path || item.relativePath] = true;
          if (item.children) traverse(item.children);
        }
      }
    };
    traverse(files);
    setExpandedFolders(next);
  };

  const collapseAllFolders = () => {
    setExpandedFolders({});
  };

  const getFileIcon = (file: WorkspaceFile) => {
    const key = file.path || file.relativePath;
    if (file.isDirectory) {
      return expandedFolders[key] ? (
        <FolderOpen className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
      ) : (
        <Folder className="w-4 h-4 text-amber-500/80 dark:text-amber-400/80 shrink-0" />
      );
    }

    const info = getFileInfo(file.name);

    switch (info.languageId) {
      case 'typescript':
        return <FileCode className="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0" />;
      case 'javascript':
        return <FileCode className="w-4 h-4 text-yellow-500 dark:text-yellow-400 shrink-0" />;
      case 'json':
        return <FileText className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />;
      case 'yaml':
      case 'ini':
        return <Settings className="w-4 h-4 text-orange-500 dark:text-orange-400 shrink-0" />;
      case 'markdown':
        return <FileText className="w-4 h-4 text-purple-500 dark:text-purple-400 shrink-0" />;
      case 'python':
        return <FileCode className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />;
      case 'rust':
        return <FileCode className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />;
      case 'go':
        return <FileCode className="w-4 h-4 text-cyan-500 dark:text-cyan-400 shrink-0" />;
      case 'shell':
      case 'bat':
      case 'powershell':
        return <Terminal className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />;
      case 'sql':
        return <Database className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0" />;
      case 'dockerfile':
        return <Boxes className="w-4 h-4 text-sky-500 dark:text-sky-400 shrink-0" />;
      case 'css':
      case 'scss':
      case 'less':
        return <FileCode className="w-4 h-4 text-sky-500 dark:text-sky-400 shrink-0" />;
      case 'html':
      case 'xml':
        return <FileCode className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />;
      case 'c':
      case 'cpp':
      case 'csharp':
      case 'java':
      case 'kotlin':
      case 'swift':
      case 'php':
      case 'ruby':
        return <FileCode className="w-4 h-4 text-violet-500 dark:text-violet-400 shrink-0" />;
      default:
        return <FileText className="w-4 h-4 text-slate-400 dark:text-zinc-400 shrink-0" />;
    }
  };

  const renderFileNode = (file: WorkspaceFile, depth = 0) => {
    const key = file.path || file.relativePath;
    const isExpanded = !!expandedFolders[key];
    const isSelected = selectedFile?.path === file.path;

    return (
      <div key={key}>
        <div
          onClick={() => {
            if (file.isDirectory) {
              toggleFolder(key);
            } else {
              onSelectFile(file);
            }
          }}
          onContextMenu={(e) => openContextMenu(e, file)}
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
          className={`group flex items-center gap-2 py-1.5 pr-2.5 rounded-lg cursor-pointer transition-all text-[13px] ${
            isSelected
              ? 'bg-surface-highlight text-slate-900 dark:text-zinc-100 font-semibold shadow-xs'
              : 'text-slate-700 dark:text-zinc-400 hover:bg-surface hover:text-slate-900 dark:hover:text-zinc-200 font-normal'
          }`}
        >
          {file.isDirectory ? (
            <span className="text-slate-400 dark:text-zinc-500 group-hover:text-slate-700 dark:group-hover:text-zinc-300">
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </span>
          ) : (
            <span className="w-3.5" />
          )}

          {getFileIcon(file)}

          <span className="truncate flex-1 font-mono text-[12px]">{file.name}</span>

          {file.gitStatus === 'modified' && (
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded">
              M
            </span>
          )}
          {file.gitStatus === 'added' && (
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded">
              U
            </span>
          )}
        </div>

        {file.isDirectory && isExpanded && (
          <div>
            {file.children && file.children.length > 0 ? (
              file.children.map((child) => renderFileNode(child, depth + 1))
            ) : (
              <div
                style={{ paddingLeft: `${(depth + 1) * 14 + 24}px` }}
                className="py-1 text-[11px] text-slate-400 dark:text-zinc-500 italic"
              >
                (trống)
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-2">
      {/* Explorer Top Toolbar */}
      <div className="flex items-center justify-between px-2 py-1.5 mb-1 text-[11px] font-bold text-slate-400 dark:text-zinc-500 tracking-wider uppercase">
        <div className="flex items-center gap-1.5">
          <FolderGit2 className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
          <span>Explorer</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={expandAllFolders}
            className="p-1 rounded hover:bg-surface-highlight text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            title="Mở rộng tất cả thư mục"
          >
            <ChevronsUpDown className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={collapseAllFolders}
            className="p-1 rounded hover:bg-surface-highlight text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            title="Thu gọn tất cả thư mục"
          >
            <ChevronsDownUp className="w-3.5 h-3.5" />
          </button>

          {onCollapseSidebar && (
            <button
              onClick={onCollapseSidebar}
              className="p-1 rounded hover:bg-surface-highlight text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors cursor-pointer ml-0.5"
              title="Thu gọn Sidebar (⌘B)"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-0.5">
        {files.length > 0 ? (
          files.map((f) => renderFileNode(f))
        ) : (
          <div className="p-4 text-center text-xs text-slate-400 dark:text-zinc-500">
            Chưa có file nào trong workspace
          </div>
        )}
      </div>

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeMenu} onContextMenu={(e) => e.preventDefault()} />
          <div
            role="menu"
            style={{ top: contextMenu.y, left: contextMenu.x, width: MENU_WIDTH }}
            className="fixed z-50 bg-surface dark:bg-[#181a24] border border-border rounded-xl shadow-xl p-1 flex flex-col gap-0.5 animate-fade-in"
          >
            {onAddToChat && (
              <button
                type="button"
                onClick={() => {
                  onAddToChat(contextMenu.file);
                  closeMenu();
                }}
                className="w-full text-left px-3 py-1.5 rounded-lg flex items-center gap-2.5 hover:bg-blue-500/10 text-slate-800 dark:text-zinc-200 text-[13px] transition-colors cursor-pointer"
              >
                <MessageSquarePlus className="w-4 h-4 text-blue-500 shrink-0" />
                <span>Thêm vào chat</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                copyToClipboard(contextMenu.file.path);
                closeMenu();
              }}
              className="w-full text-left px-3 py-1.5 rounded-lg flex items-center gap-2.5 hover:bg-surface-highlight text-slate-800 dark:text-zinc-200 text-[13px] transition-colors cursor-pointer"
            >
              <Copy className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Copy path</span>
            </button>

            <button
              type="button"
              onClick={() => {
                copyToClipboard(contextMenu.file.relativePath);
                closeMenu();
              }}
              className="w-full text-left px-3 py-1.5 rounded-lg flex items-center gap-2.5 hover:bg-surface-highlight text-slate-800 dark:text-zinc-200 text-[13px] transition-colors cursor-pointer"
            >
              <Copy className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Copy relative path</span>
            </button>

            <button
              type="button"
              onClick={() => {
                revealInFinder(contextMenu.file);
                closeMenu();
              }}
              className="w-full text-left px-3 py-1.5 rounded-lg flex items-center gap-2.5 hover:bg-surface-highlight text-slate-800 dark:text-zinc-200 text-[13px] transition-colors cursor-pointer"
            >
              <FolderSymlink className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Hiện trong Finder</span>
            </button>

            {onDeleteFile && !contextMenu.file.isDirectory && (
              <>
                <div className="h-px bg-border my-0.5" />
                <button
                  type="button"
                  onClick={() => {
                    setFileToDelete(contextMenu.file);
                    closeMenu();
                  }}
                  className="w-full text-left px-3 py-1.5 rounded-lg flex items-center gap-2.5 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[13px] transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span>Xóa</span>
                </button>
              </>
            )}
          </div>
        </>
      )}

      {fileToDelete && (
        <div
          className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
          onClick={() => {
            if (!isDeleting) setFileToDelete(null);
          }}
        >
          <div
            className="bg-surface dark:bg-[#181a24] border border-border rounded-2xl shadow-2xl w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-500" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Xóa file</h3>
            </div>
            <p className="text-[13px] text-slate-600 dark:text-zinc-400 mb-5">
              Xóa vĩnh viễn{' '}
              <span className="font-mono font-semibold text-slate-800 dark:text-zinc-200">
                {fileToDelete.name}
              </span>
              ? Hành động này không thể hoàn tác.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFileToDelete(null)}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-slate-600 dark:text-zinc-300 hover:bg-surface-highlight transition-colors cursor-pointer disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-rose-500 hover:bg-rose-600 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? 'Đang xóa…' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const ProjectTree = React.memo(ProjectTreeComponent);
