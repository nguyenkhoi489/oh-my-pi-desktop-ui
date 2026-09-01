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
import { CommandMenu, filterAndGroupCommands, DEMO_COMMANDS } from './CommandMenu';
import {
  buildMessageWithFileMentions,
  flattenWorkspaceFiles,
} from '../../utils/fileMention';

export { buildMessageWithFileMentions, flattenWorkspaceFiles };

interface PromptComposerProps {
  onSendMessage: (prompt: string, contextFiles?: string[]) => void;
  status: OmpAgentStatus;
  workspaceFiles?: WorkspaceFile[];
  availableCommands?: OmpCommandInfo[];
}

export const PromptComposer: React.FC<PromptComposerProps> = ({
  onSendMessage,
  status,
  workspaceFiles,
  availableCommands,
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const commandMenuRef = useRef<HTMLDivElement>(null);

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

  const activeCommandsList = React.useMemo(() => {
    return availableCommands && availableCommands.length > 0
      ? availableCommands
      : DEMO_COMMANDS;
  }, [availableCommands]);

  const { items: filteredCommands } = React.useMemo(() => {
    return filterAndGroupCommands(activeCommandsList, commandQuery);
  }, [activeCommandsList, commandQuery]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredFiles]);

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
  };

  const handleSelectCommand = (insertText: string) => {
    const remainder = input.replace(/^\/[^\s]*/, '');
    const newInput = `${insertText}${remainder.trimStart()}`;
    setInput(newInput);
    setIsCommandMenuOpen(false);
    setCommandQuery('');
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const pos = insertText.length;
        textareaRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  const handleSend = () => {
    const finalMessage = buildMessageWithFileMentions(input, attachedFiles);
    if (!finalMessage.trim() || status !== 'idle') return;

    onSendMessage(finalMessage, attachedFiles);
    setInput('');
    setAttachedFiles([]);
    setIsPickerOpen(false);
    setAtCursorIndex(null);
    setIsCommandMenuOpen(false);
    setCommandQuery('');
  };

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart;
    setInput(val);

    // Slash commands menu detection: triggered when input starts with '/' and cursor is in first token
    if (val.startsWith('/')) {
      const spaceIdx = val.indexOf(' ');
      if (spaceIdx === -1 || cursorPos <= spaceIdx) {
        const query = val.slice(1, spaceIdx === -1 ? undefined : spaceIdx);
        setCommandQuery(query);
        setIsCommandMenuOpen(true);
      } else {
        setIsCommandMenuOpen(false);
      }
    } else {
      setIsCommandMenuOpen(false);
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
      if (!input.startsWith('/')) {
        const next = '/' + input;
        setInput(next);
        setCommandQuery(input);
      }
      setIsCommandMenuOpen((prev) => !prev);
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
        return;
      }
    }

    if (isPickerOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filteredFiles.length > 0 ? (prev + 1) % filteredFiles.length : 0
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filteredFiles.length > 0
            ? (prev - 1 + filteredFiles.length) % filteredFiles.length
            : 0
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (filteredFiles.length > 0 && filteredFiles[selectedIndex]) {
          e.preventDefault();
          addAttachment(filteredFiles[selectedIndex].relativePath);
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
        filteredFiles.length > 0 ? (prev + 1) % filteredFiles.length : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filteredFiles.length > 0
          ? (prev - 1 + filteredFiles.length) % filteredFiles.length
          : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredFiles.length > 0 && filteredFiles[selectedIndex]) {
        addAttachment(filteredFiles[selectedIndex].relativePath);
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
          commands={activeCommandsList}
          selectedIndex={commandSelectedIndex}
          onSelectCommand={handleSelectCommand}
          onClose={() => setIsCommandMenuOpen(false)}
          onSelectedIndexChange={setCommandSelectedIndex}
        />
      </div>

      {/* File Picker Popover */}
      {isPickerOpen && (
        <div
          ref={popoverRef}
          className="absolute bottom-full mb-2 left-3 right-3 sm:left-3 sm:right-auto sm:w-96 max-h-72 bg-surface dark:bg-[#181a24] border border-border rounded-xl shadow-xl z-50 flex flex-col overflow-hidden animate-fade-in"
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
            {filteredFiles.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                Không tìm thấy file nào phù hợp
              </div>
            ) : (
              filteredFiles.map((file, idx) => (
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
            <span>↑↓ di chuyển</span>
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
          placeholder="Yêu cầu OMP Agent xử lý code, gõ @file để đính kèm, hoặc / để mở lệnh..."
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
                if (!input.startsWith('/')) {
                  setInput('/' + input);
                  setCommandQuery(input);
                }
                setIsCommandMenuOpen(!isCommandMenuOpen);
                textareaRef.current?.focus();
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
              disabled={!input.trim() || status !== 'idle'}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                input.trim() && status === 'idle'
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
