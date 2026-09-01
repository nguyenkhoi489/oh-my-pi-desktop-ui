import React, { useState, useRef, useEffect, KeyboardEvent, ChangeEvent } from 'react';
import {
  AtSign,
  CornerDownLeft,
  X,
  Paperclip,
  FileCode,
  Search,
  Terminal,
} from 'lucide-react';
import { OmpAgentStatus, WorkspaceFile, OmpCommandInfo } from '../../types';
import { DEMO_WORKSPACE_FILES } from '../../mock/demoData';
import { CommandMenu } from './CommandMenu';
import { useCommandCatalog } from '../../hooks/useCommandCatalog';
import {
  buildMessageWithFileMentions,
  findRemovedInlineAttachments,
  flattenWorkspaceFiles,
} from '../../utils/fileMention';

export { buildMessageWithFileMentions, flattenWorkspaceFiles };

interface PromptComposerProps {
  onSendMessage: (prompt: string, contextFiles?: string[]) => void;
  status: OmpAgentStatus;
  workspaceFiles?: WorkspaceFile[];
  availableCommands?: OmpCommandInfo[];
  isToolApprovalPending?: boolean;
}
// Giới hạn số file hiển thị trong picker để tránh render hàng nghìn node
const MAX_PICKER_FILES = 100;

const PromptComposerComponent: React.FC<PromptComposerProps> = ({
  onSendMessage,
  status,
  workspaceFiles,
  availableCommands,
  isToolApprovalPending = false,
}) => {
  const [input, setInput] = useState<string>('');
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState<boolean>(false);
  const [pickerQuery, setPickerQuery] = useState<string>('');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [atCursorIndex, setAtCursorIndex] = useState<number | null>(null);

  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState<boolean>(false);
  const [commandQuery, setCommandQuery] = useState<string>('');
  const [commandSelectedIndex, setCommandSelectedIndex] = useState<number>(0);
  // Vị trí ký tự '/' đang mở command menu (hỗ trợ command giữa message)
  const [slashIndex, setSlashIndex] = useState<number | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const commandMenuRef = useRef<HTMLDivElement>(null);
  // Các attachment được chèn dạng @token trong text (phân biệt với attach qua nút)
  const inlineAttachmentsRef = useRef<Set<string>>(new Set());

  const allFiles = React.useMemo(() => {
    const sourceTree =
      workspaceFiles && workspaceFiles.length > 0
        ? workspaceFiles
        : DEMO_WORKSPACE_FILES;
    return flattenWorkspaceFiles(sourceTree);
  }, [workspaceFiles]);

  const filteredFiles = React.useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return allFiles;
    return allFiles.filter(
      (f) =>
        f.relativePath.toLowerCase().includes(q) ||
        f.name.toLowerCase().includes(q)
    );
  }, [allFiles, pickerQuery]);

  const visibleFiles = React.useMemo(
    () => filteredFiles.slice(0, MAX_PICKER_FILES),
    [filteredFiles]
  );

  const { items: filteredCommands, groups: filteredCommandGroups } = useCommandCatalog({
    availableCommands,
    query: commandQuery,
  });
  useEffect(() => {
    setSelectedIndex(0);
  }, [visibleFiles]);

  useEffect(() => {
    setCommandSelectedIndex(0);
  }, [filteredCommands]);

  useEffect(() => {
    if (isPickerOpen && searchInputRef.current && atCursorIndex === null) {
      searchInputRef.current.focus();
    }
  }, [isPickerOpen, atCursorIndex]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        textareaRef.current &&
        !textareaRef.current.contains(target)
      ) {
        setIsPickerOpen(false);
        setAtCursorIndex(null);
      }
      if (
        commandMenuRef.current &&
        !commandMenuRef.current.contains(target) &&
        textareaRef.current &&
        !textareaRef.current.contains(target)
      ) {
        setIsCommandMenuOpen(false);
        setSlashIndex(null);
      }
    };
    if (isPickerOpen || isCommandMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPickerOpen, isCommandMenuOpen]);

  const addAttachment = (filePath: string) => {
    const trimmedPath = filePath.trim();
    if (!trimmedPath) return;

    if (atCursorIndex !== null && textareaRef.current) {
      const beforeAt = input.slice(0, atCursorIndex);
      const afterCursor = input.slice(textareaRef.current.selectionEnd || input.length);
      const newInput = `${beforeAt}@${trimmedPath} ${afterCursor}`;
      inlineAttachmentsRef.current.add(trimmedPath);
      setInput(newInput);
      setTimeout(() => {
        if (textareaRef.current) {
          const newCursorPos = beforeAt.length + trimmedPath.length + 2;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    }

    if (!attachedFiles.includes(trimmedPath)) {
      setAttachedFiles((prev) => [...prev, trimmedPath]);
    }

    setIsPickerOpen(false);
    setPickerQuery('');
    setAtCursorIndex(null);
  };

  const removeAttachment = (file: string) => {
    setAttachedFiles(attachedFiles.filter((f) => f !== file));
    // Chip chèn inline: gỡ luôn token @file trong text để hai phía đồng bộ
    if (inlineAttachmentsRef.current.has(file)) {
      inlineAttachmentsRef.current.delete(file);
      const token = `@${file}`;
      setInput((prev) =>
        prev.includes(`${token} `) ? prev.replace(`${token} `, '') : prev.replace(token, '')
      );
    }
  };

  const handleSelectCommand = (insertText: string) => {
    let newCursorPos: number;
    if (slashIndex !== null) {
      // Thay token '/query' tại vị trí slash bằng lệnh được chọn
      const before = input.slice(0, slashIndex);
      const after = input.slice(textareaRef.current?.selectionEnd ?? input.length);
      setInput(`${before}${insertText}${after}`);
      newCursorPos = before.length + insertText.length;
    } else {
      // Menu mở qua nút khi chưa có token: chèn tại vị trí con trỏ
      const pos = textareaRef.current?.selectionEnd ?? input.length;
      setInput(`${input.slice(0, pos)}${insertText}${input.slice(pos)}`);
      newCursorPos = pos + insertText.length;
    }
    setIsCommandMenuOpen(false);
    setCommandQuery('');
    setSlashIndex(null);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  // Chèn '/' tại con trỏ và mở command menu (dùng cho nút Commands và ⌘+/)
  const openCommandMenuAtCursor = () => {
    const pos = textareaRef.current?.selectionEnd ?? input.length;
    const needsSpace = pos > 0 && !/\s/.test(input[pos - 1]);
    const slashPos = pos + (needsSpace ? 1 : 0);
    setInput(`${input.slice(0, pos)}${needsSpace ? ' /' : '/'}${input.slice(pos)}`);
    setSlashIndex(slashPos);
    setCommandQuery('');
    setIsCommandMenuOpen(true);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(slashPos + 1, slashPos + 1);
      }
    }, 0);
  };

  const handleSend = () => {
    const finalMessage = buildMessageWithFileMentions(input, attachedFiles);
    if (!finalMessage.trim() || status !== 'idle' || isToolApprovalPending) return;
    onSendMessage(finalMessage, attachedFiles);
    setInput('');
    setAttachedFiles([]);
    inlineAttachmentsRef.current.clear();
    setIsPickerOpen(false);
    setAtCursorIndex(null);
    setIsCommandMenuOpen(false);
    setCommandQuery('');
    setSlashIndex(null);
  };

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart;
    setInput(val);

    // Xoá token @file khỏi text thì gỡ luôn chip attachment tương ứng
    if (inlineAttachmentsRef.current.size > 0) {
      const removed = findRemovedInlineAttachments(val, inlineAttachmentsRef.current);
      if (removed.length > 0) {
        for (const file of removed) {
          inlineAttachmentsRef.current.delete(file);
        }
        setAttachedFiles((prev) => prev.filter((f) => !removed.includes(f)));
      }
    }

    // Command menu: '/' ở đầu chuỗi hoặc sau whitespace (hỗ trợ command giữa message)
    if (
      cursorPos > 0 &&
      val[cursorPos - 1] === '/' &&
      (cursorPos === 1 || /\s/.test(val[cursorPos - 2]))
    ) {
      setSlashIndex(cursorPos - 1);
      setCommandQuery('');
      setIsCommandMenuOpen(true);
    } else if (slashIndex !== null) {
      if (cursorPos <= slashIndex || val[slashIndex] !== '/') {
        setSlashIndex(null);
        setIsCommandMenuOpen(false);
      } else {
        const query = val.slice(slashIndex + 1, cursorPos);
        if (query.includes(' ') || query.includes('\n')) {
          setSlashIndex(null);
          setIsCommandMenuOpen(false);
        } else {
          setCommandQuery(query);
          setIsCommandMenuOpen(true);
        }
      }
    }

    if (cursorPos > 0 && val[cursorPos - 1] === '@') {
      setAtCursorIndex(cursorPos - 1);
      setPickerQuery('');
      setIsPickerOpen(true);
    } else if (atCursorIndex !== null) {
      if (cursorPos <= atCursorIndex) {
        setAtCursorIndex(null);
        setIsPickerOpen(false);
      } else {
        const query = val.slice(atCursorIndex + 1, cursorPos);
        if (query.includes(' ') || query.includes('\n')) {
          setAtCursorIndex(null);
          setIsPickerOpen(false);
        } else {
          setPickerQuery(query);
          setIsPickerOpen(true);
        }
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Shortcut Cmd+/ or Ctrl+/ to toggle Slash Command Menu
    if ((e.metaKey || e.ctrlKey) && e.key === '/') {
      e.preventDefault();
      if (isCommandMenuOpen) {
        setIsCommandMenuOpen(false);
        setSlashIndex(null);
      } else {
        openCommandMenuAtCursor();
      }
      return;
    }

    if (isCommandMenuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCommandSelectedIndex((prev) =>
          filteredCommands.length > 0 ? (prev + 1) % filteredCommands.length : 0
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCommandSelectedIndex((prev) =>
          filteredCommands.length > 0
            ? (prev - 1 + filteredCommands.length) % filteredCommands.length
            : 0
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (filteredCommands.length > 0 && filteredCommands[commandSelectedIndex]) {
          e.preventDefault();
          handleSelectCommand(filteredCommands[commandSelectedIndex].insertText);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsCommandMenuOpen(false);
        setSlashIndex(null);
        return;
      }
    }

    if (isPickerOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          visibleFiles.length > 0 ? (prev + 1) % visibleFiles.length : 0
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          visibleFiles.length > 0
            ? (prev - 1 + visibleFiles.length) % visibleFiles.length
            : 0
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (visibleFiles.length > 0 && visibleFiles[selectedIndex]) {
          e.preventDefault();
          addAttachment(visibleFiles[selectedIndex].relativePath);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsPickerOpen(false);
        setAtCursorIndex(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePickerSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        visibleFiles.length > 0 ? (prev + 1) % visibleFiles.length : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        visibleFiles.length > 0
          ? (prev - 1 + visibleFiles.length) % visibleFiles.length
          : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (visibleFiles.length > 0 && visibleFiles[selectedIndex]) {
        addAttachment(visibleFiles[selectedIndex].relativePath);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsPickerOpen(false);
      setAtCursorIndex(null);
      textareaRef.current?.focus();
    }
  };

  return (
    <div className="p-3.5 bg-panel border-t border-border flex flex-col gap-2.5 relative">
      {/* Attached Context Pills */}
      {attachedFiles.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {attachedFiles.map((file) => (
            <span
              key={file}
              className="flex items-center gap-1.5 text-[11.5px] font-mono px-2.5 py-1 rounded-lg bg-surface border border-border text-slate-800 dark:text-zinc-200 font-medium"
            >
              <AtSign className="w-3.5 h-3.5 text-blue-500" />
              <span>{file}</span>
              <button
                onClick={() => removeAttachment(file)}
                className="ml-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 cursor-pointer"
                title="Bỏ đính kèm"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Slash Commands & Skills Popover Menu */}
      <div ref={commandMenuRef}>
        <CommandMenu
          isOpen={isCommandMenuOpen}
          query={commandQuery}
          items={filteredCommands}
          groups={filteredCommandGroups}
          selectedIndex={commandSelectedIndex}
          onSelectCommand={handleSelectCommand}
          onClose={() => setIsCommandMenuOpen(false)}
        />
      </div>

      {/* File Picker Popover */}
      {isPickerOpen && (
        <div
          ref={popoverRef}
          className="absolute bottom-full mb-2 left-3 right-3 sm:left-3 sm:right-auto sm:w-96 sm:max-w-[calc(100%-24px)] max-h-72 bg-surface dark:bg-[#181a24] border border-border rounded-xl shadow-xl z-50 flex flex-col overflow-hidden animate-fade-in"
        >
          <div className="p-2.5 border-b border-border/60 bg-surface-highlight/30 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              onKeyDown={handlePickerSearchKeyDown}
              placeholder="Tìm file trong workspace..."
              className="w-full bg-transparent text-xs text-slate-800 dark:text-zinc-200 placeholder-slate-400 outline-none"
            />
            <button
              onClick={() => {
                setIsPickerOpen(false);
                setAtCursorIndex(null);
                textareaRef.current?.focus();
              }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 p-1 max-h-52">
            {visibleFiles.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                Không tìm thấy file nào phù hợp
              </div>
            ) : (
              visibleFiles.map((file, idx) => (
                <button
                  key={file.path || file.relativePath}
                  onClick={() => addAttachment(file.relativePath)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 text-xs transition-colors cursor-pointer ${
                    idx === selectedIndex
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium'
                      : 'text-slate-700 dark:text-zinc-300 hover:bg-surface-highlight'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5 shrink-0 opacity-70" />
                  <div className="flex-1 truncate">
                    <span className="font-mono">{file.relativePath}</span>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="px-2.5 py-1.5 border-t border-border/40 bg-surface-highlight/20 text-[10.5px] text-slate-400 flex items-center justify-between">
            <span>
              {filteredFiles.length > MAX_PICKER_FILES
                ? `${MAX_PICKER_FILES}/${filteredFiles.length} — gõ để lọc thêm`
                : '↑↓ di chuyển'}
            </span>
            <span>↵ chọn</span>
            <span>esc đóng</span>
          </div>
        </div>
      )}

      {/* Input Box */}
      <div className="relative rounded-2xl border border-border focus-within:border-blue-500/60 bg-surface/50 dark:bg-[#14161f] focus-within:bg-surface dark:focus-within:bg-[#181a24] transition-all shadow-xs p-3">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={
            isToolApprovalPending
              ? 'Vui lòng duyệt hoặc từ chối quyền thực thi công cụ trước...'
              : 'Yêu cầu OMP Agent xử lý code, gõ @file để đính kèm, hoặc / để mở lệnh...'
          }
          rows={3}
          className="w-full bg-transparent text-[13.5px] text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 resize-none outline-none font-sans leading-relaxed"
        />
        {/* Toolbar Bottom */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50 mt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setAtCursorIndex(null);
                setPickerQuery('');
                setIsPickerOpen(!isPickerOpen);
              }}
              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors font-medium cursor-pointer ${
                isPickerOpen
                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-surface-highlight'
              }`}
              title="Đính kèm file từ workspace (@file)"
            >
              <Paperclip className="w-3.5 h-3.5" />
              <span>Attach</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (isCommandMenuOpen) {
                  setIsCommandMenuOpen(false);
                  setSlashIndex(null);
                } else {
                  openCommandMenuAtCursor();
                }
              }}
              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors font-medium cursor-pointer ${
                isCommandMenuOpen
                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-surface-highlight'
              }`}
              title="Danh sách lệnh Slash & Skills (/)"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Commands</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 dark:text-zinc-500 hidden sm:inline">
              ↵ send
            </span>
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || status !== 'idle' || isToolApprovalPending}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                input.trim() && status === 'idle' && !isToolApprovalPending
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                  : 'bg-surface-highlight text-slate-400 dark:text-zinc-500 cursor-not-allowed'
              }`}
            >
              <span>Send</span>
              <CornerDownLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const PromptComposer = React.memo(PromptComposerComponent);
