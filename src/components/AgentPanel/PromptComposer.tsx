import React, { useState, useRef, useEffect, useCallback, KeyboardEvent, ChangeEvent } from 'react';
import {
  AtSign,
  CornerDownLeft,
  X,
  Paperclip,
  FileCode,
  Search,
  Terminal,
  UploadCloud,
  ZoomIn,
  ChevronDown,
  Radio,
  Square,
  Clock,
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
import {
  isImageFile,
  getImageExtension,
  extractImageFromClipboard,
  extractFilesFromDrop,
  computeRelativePath,
} from '../../utils/imageAttachment';
import { ImageLightboxModal } from './ImageLightboxModal';
import { AttachmentImage } from '../Common/AttachmentImage';

export { buildMessageWithFileMentions, flattenWorkspaceFiles };

interface PromptComposerProps {
  onSendMessage: (prompt: string, contextFiles?: string[]) => void;
  onSteerMessage?: (prompt: string, contextFiles?: string[]) => void;
  onAbortAndPrompt?: (prompt: string, contextFiles?: string[]) => void;
  onFollowUpMessage?: (prompt: string, contextFiles?: string[]) => void;
  followUpQueue?: Array<{ id: string; content: string; files?: string[]; timestamp: number }>;
  status: OmpAgentStatus;
  workspaceFiles?: WorkspaceFile[];
  workspacePath?: string;
  availableCommands?: OmpCommandInfo[];
  isToolApprovalPending?: boolean;
  externalAttachment?: { path: string; nonce: number } | null;
}
// Giới hạn số file hiển thị trong picker để tránh render hàng nghìn node
const MAX_PICKER_FILES = 100;

const PromptComposerComponent: React.FC<PromptComposerProps> = ({
  onSendMessage,
  onSteerMessage,
  onAbortAndPrompt,
  onFollowUpMessage,
  followUpQueue,
  status,
  workspaceFiles,
  workspacePath,
  availableCommands,
  isToolApprovalPending = false,
  externalAttachment,
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
  // State menu split-button khi agent đang chạy
  const [isSplitMenuOpen, setIsSplitMenuOpen] = useState<boolean>(false);
  const splitMenuRef = useRef<HTMLDivElement>(null);

  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});
  const [lightboxImage, setLightboxImage] = useState<{ url: string; name: string } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const commandMenuRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef<number>(0);
  const activeBlobUrlsRef = useRef<Set<string>>(new Set());
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
      if (
        splitMenuRef.current &&
        !splitMenuRef.current.contains(target)
      ) {
        setIsSplitMenuOpen(false);
      }
    };
    if (isPickerOpen || isCommandMenuOpen || isSplitMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPickerOpen, isCommandMenuOpen, isSplitMenuOpen]);

  // Dọn dẹp các Object URL khi unmount để chống rò rỉ bộ nhớ
  useEffect(() => {
    const blobUrls = activeBlobUrlsRef.current;
    return () => {
      blobUrls.forEach((url) => URL.revokeObjectURL(url));
      blobUrls.clear();
    };
  }, []);

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

  // Đính kèm file khi cây thư mục gửi yêu cầu "Thêm vào chat"
  const lastAttachNonceRef = useRef<number>(0);
  useEffect(() => {
    if (!externalAttachment) return;
    if (externalAttachment.nonce === lastAttachNonceRef.current) return;
    lastAttachNonceRef.current = externalAttachment.nonce;
    const p = externalAttachment.path.trim();
    if (!p) return;
    setAttachedFiles((prev) => (prev.includes(p) ? prev : [...prev, p]));
  }, [externalAttachment]);

  const removeAttachment = (file: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f !== file));

    // Giải phóng blob URL preview nếu có
    const previewUrl = imagePreviews[file];
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
      activeBlobUrlsRef.current.delete(previewUrl);
    }
    setImagePreviews((prev) => {
      const next = { ...prev };
      delete next[file];
      return next;
    });

    // Chip chèn inline: gỡ luôn token @file trong text để hai phía đồng bộ
    if (inlineAttachmentsRef.current.has(file)) {
      inlineAttachmentsRef.current.delete(file);
      const token = `@${file}`;
      setInput((prev) =>
        prev.includes(`${token} `) ? prev.replace(`${token} `, '') : prev.replace(token, '')
      );
    }
  };

  // Lưu file ảnh đính kèm vào hệ thống tập tin hoặc tạo blob preview
  const saveAndAttachImage = useCallback(
    async (file: File | Blob, rawBuffer?: Uint8Array, extension?: string, originalName?: string) => {
      try {
        let buffer = rawBuffer;
        if (!buffer) {
          const arrayBuffer = await file.arrayBuffer();
          buffer = new Uint8Array(arrayBuffer);
        }
        const ext = extension || getImageExtension(file.type, (file as File).name);
        const name = originalName || (file as File).name || `img_${Date.now()}.${ext}`;

        if (window.electronAPI?.saveImageAttachment) {
          const res = await window.electronAPI.saveImageAttachment(buffer, ext, name);
          if (!res || !res.success) {
            // Không attach đường dẫn giả khi lưu thất bại — engine sẽ trỏ file không tồn tại
            console.error('Lưu attachment ảnh thất bại:', res?.error || 'unknown error');
            return;
          }
          const savedPath = res.relativePath || res.filePath;
          const blob = file instanceof Blob ? file : new Blob([buffer.buffer as ArrayBuffer]);
          const blobUrl = URL.createObjectURL(blob);
          activeBlobUrlsRef.current.add(blobUrl);
          setImagePreviews((prev) => ({ ...prev, [savedPath]: blobUrl }));
          setAttachedFiles((prev) => (prev.includes(savedPath) ? prev : [...prev, savedPath]));
          return;
        }

        // Fallback môi trường web preview (không có Electron)
        const blob = file instanceof Blob ? file : new Blob([buffer.buffer as ArrayBuffer]);
        const blobUrl = URL.createObjectURL(blob);
        activeBlobUrlsRef.current.add(blobUrl);
        const fallbackPath = `.omp/attachments/${name}`;
        setImagePreviews((prev) => ({ ...prev, [fallbackPath]: blobUrl }));
        setAttachedFiles((prev) => (prev.includes(fallbackPath) ? prev : [...prev, fallbackPath]));
      } catch (err) {
        console.error('Lỗi khi lưu attachment ảnh:', err);
      }
    },
    []
  );

  // Xử lý dán hình ảnh từ clipboard (Cmd+V / Ctrl+V)
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = e.clipboardData;
    // preventDefault phải gọi đồng bộ trước mọi await, nếu không default paste vẫn chạy
    const hasImage =
      Array.from(clipboardData?.items || []).some((item) => item.type.startsWith('image/')) ||
      Array.from(clipboardData?.files || []).some(
        (f) => f.type.startsWith('image/') || isImageFile(f.name)
      );
    if (!hasImage) return;

    e.preventDefault();
    // Phần đồng bộ của extract (getAsFile) chạy ngay trong event handler
    void extractImageFromClipboard(clipboardData).then((extracted) => {
      if (extracted) {
        return saveAndAttachImage(
          extracted.blob,
          extracted.buffer,
          extracted.extension,
          extracted.name
        );
      }
    });
  };

  // Xử lý sự kiện kéo thả file vào ô composer
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    setIsDraggingOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);

    const droppedFiles = extractFilesFromDrop(e.dataTransfer, (file) =>
      window.electronAPI?.getPathForFile?.(file)
    );
    if (droppedFiles.length === 0) return;

    const attachPath = (p: string) =>
      setAttachedFiles((prev) => (prev.includes(p) ? prev : [...prev, p]));

    for (const item of droppedFiles) {
      const rel = item.path ? computeRelativePath(item.path, workspacePath) : undefined;
      const isInWorkspace = !!item.path && !!rel && rel !== item.path;

      if (item.isImage && !isInWorkspace) {
        // Ảnh ngoài workspace hoặc kéo từ ứng dụng khác: lưu bản sao vào .omp/attachments
        await saveAndAttachImage(item.file, undefined, undefined, item.file.name);
      } else if (rel) {
        // File trong workspace (kể cả ảnh) attach trực tiếp, không copy trùng
        attachPath(rel);
      } else if (item.file.name) {
        attachPath(item.file.name);
      }
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

  const isSendDisabled =
    (!input.trim() && attachedFiles.length === 0) || isToolApprovalPending;

  const resetComposer = () => {
    setInput('');
    setAttachedFiles([]);
    inlineAttachmentsRef.current.clear();
    setIsPickerOpen(false);
    setAtCursorIndex(null);
    setIsCommandMenuOpen(false);
    setCommandQuery('');
    setSlashIndex(null);
    setIsSplitMenuOpen(false);

    // Giải phóng các blob URL khi gửi tin nhắn
    activeBlobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    activeBlobUrlsRef.current.clear();
    setImagePreviews({});
  };

  const handleSend = () => {
    const finalMessage = buildMessageWithFileMentions(input, attachedFiles);
    if (!finalMessage.trim() || isSendDisabled) return;
    if (status === 'idle') {
      onSendMessage(finalMessage, attachedFiles.length > 0 ? attachedFiles : undefined);
    } else if (onSteerMessage) {
      onSteerMessage(finalMessage, attachedFiles.length > 0 ? attachedFiles : undefined);
    } else {
      onSendMessage(finalMessage, attachedFiles.length > 0 ? attachedFiles : undefined);
    }
    resetComposer();
  };

  const handleSteer = () => {
    const finalMessage = buildMessageWithFileMentions(input, attachedFiles);
    if (!finalMessage.trim() || isSendDisabled) return;
    if (onSteerMessage) {
      onSteerMessage(finalMessage, attachedFiles.length > 0 ? attachedFiles : undefined);
    } else {
      onSendMessage(finalMessage, attachedFiles.length > 0 ? attachedFiles : undefined);
    }
    resetComposer();
  };

  const handleAbortAndPrompt = () => {
    const finalMessage = buildMessageWithFileMentions(input, attachedFiles);
    if (!finalMessage.trim() || isSendDisabled) return;
    if (onAbortAndPrompt) {
      onAbortAndPrompt(finalMessage, attachedFiles.length > 0 ? attachedFiles : undefined);
    } else {
      onSendMessage(finalMessage, attachedFiles.length > 0 ? attachedFiles : undefined);
    }
    resetComposer();
  };

  const handleFollowUp = () => {
    const finalMessage = buildMessageWithFileMentions(input, attachedFiles);
    if (!finalMessage.trim() || isSendDisabled) return;
    if (onFollowUpMessage) {
      onFollowUpMessage(finalMessage, attachedFiles.length > 0 ? attachedFiles : undefined);
    } else if (onSteerMessage) {
      onSteerMessage(finalMessage, attachedFiles.length > 0 ? attachedFiles : undefined);
    } else {
      onSendMessage(finalMessage, attachedFiles.length > 0 ? attachedFiles : undefined);
    }
    resetComposer();
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

    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      if (!isSendDisabled) {
        handleAbortAndPrompt();
      }
      return;
    }

    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      if (!isSendDisabled) {
        if (status === 'idle') {
          handleSend();
        } else {
          handleFollowUp();
        }
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (!isSendDisabled) {
        if (status === 'idle') {
          handleSend();
        } else {
          handleSteer();
        }
      }
      return;
    }

    if (e.key === 'Escape') {
      if (isSplitMenuOpen) {
        e.preventDefault();
        setIsSplitMenuOpen(false);
        return;
      }
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
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="p-3.5 bg-panel border-t border-border flex flex-col gap-2.5 relative"
    >
      {/* Hàng đợi follow-up phía trên composer */}
      {followUpQueue && followUpQueue.length > 0 && (
        <div className="p-2 bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/20 rounded-xl flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Hàng đợi follow-up ({followUpQueue.length})
            </span>
            <span className="text-[10px] text-slate-400 dark:text-zinc-500">
              Tự động chạy sau turn hiện tại
            </span>
          </div>
          <div className="flex flex-col gap-1 max-h-24 overflow-y-auto">
            {followUpQueue.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-xs text-slate-800 dark:text-zinc-200"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500 shrink-0">
                    #{idx + 1}
                  </span>
                  <span className="truncate text-xs font-medium">
                    {item.content}
                  </span>
                  {item.files && item.files.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface-highlight text-slate-500 dark:text-zinc-400 shrink-0">
                      +{item.files.length} file
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-2 z-40 rounded-2xl border-2 border-dashed border-blue-500 bg-blue-500/10 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 p-6 pointer-events-none animate-fade-in">
          <div className="w-11 h-11 rounded-2xl bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
            <UploadCloud className="w-6 h-6 animate-bounce" />
          </div>
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
            Thả hình ảnh hoặc file vào đây để đính kèm
          </span>
          <span className="text-[11px] text-slate-500 dark:text-zinc-400">
            Hỗ trợ PNG, JPG, WebP, GIF, SVG hoặc file mã nguồn
          </span>
        </div>
      )}

      {/* Lightbox Xem Ảnh Phóng To */}
      <ImageLightboxModal
        isOpen={!!lightboxImage}
        imageUrl={lightboxImage?.url || ''}
        imageName={lightboxImage?.name}
        onClose={() => setLightboxImage(null)}
      />

      {/* Attached Context Pills */}
      {attachedFiles.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {attachedFiles.map((file) => {
            const isImg = isImageFile(file);
            const previewUrl = imagePreviews[file] || file;

            if (isImg) {
              return (
                <div
                  key={file}
                  className="flex items-center gap-2 p-1.5 pr-2 rounded-xl bg-surface border border-border text-xs shadow-xs hover:border-blue-500/40 transition-colors group"
                >
                  {/* Thumbnail 36x36px */}
                  <button
                    type="button"
                    onClick={() => setLightboxImage({ url: previewUrl, name: file })}
                    className="w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-surface-highlight border border-border/60 flex items-center justify-center relative cursor-pointer group-hover:scale-105 transition-transform"
                    title="Xem ảnh phóng to"
                  >
                    <AttachmentImage
                      src={previewUrl}
                      alt={file}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <ZoomIn className="w-3.5 h-3.5 text-white drop-shadow" />
                    </div>
                  </button>

                  {/* Tên file & định dạng */}
                  <div className="flex flex-col min-w-0 max-w-[130px]">
                    <span className="font-mono text-[11.5px] font-medium text-slate-800 dark:text-zinc-200 truncate" title={file}>
                      {file.split('/').pop()}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-sans uppercase">
                      {file.split('.').pop()} ảnh
                    </span>
                  </div>

                  {/* Nút xóa attachment */}
                  <button
                    type="button"
                    onClick={() => removeAttachment(file)}
                    className="ml-0.5 p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-surface-highlight cursor-pointer"
                    title="Bỏ đính kèm ảnh"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            }

            return (
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
            );
          })}
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
          onPaste={handlePaste}
          placeholder={
            isToolApprovalPending
              ? 'Vui lòng duyệt hoặc từ chối quyền thực thi công cụ trước...'
              : status !== 'idle'
              ? 'Gõ chỉ đạo tức thời (Enter: Steer, ⌘⇧Enter: Dừng & gửi mới, @file để đính kèm)...'
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

          {status === 'idle' ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 dark:text-zinc-500 hidden sm:inline">
                ↵ send
              </span>
              <button
                type="button"
                onClick={handleSend}
                disabled={isSendDisabled}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  !isSendDisabled
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                    : 'bg-surface-highlight text-slate-400 dark:text-zinc-500 cursor-not-allowed'
                }`}
              >
                <span>Send</span>
                <CornerDownLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="relative flex items-center gap-2" ref={splitMenuRef}>
              {/* Split Button Group */}
              <div className="flex items-center rounded-xl overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={handleSteer}
                  disabled={isSendDisabled}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                    !isSendDisabled
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-surface-highlight text-slate-400 dark:text-zinc-500 cursor-not-allowed'
                  }`}
                  title="Lái hướng agent ngay lập tức (Enter)"
                >
                  <Radio className="w-3.5 h-3.5 animate-pulse" />
                  <span>Steer</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsSplitMenuOpen((prev) => !prev)}
                  disabled={isSendDisabled}
                  className={`px-1.5 py-1.5 border-l text-xs transition-all cursor-pointer ${
                    !isSendDisabled
                      ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-700/50'
                      : 'bg-surface-highlight text-slate-400 dark:text-zinc-500 border-border/60 cursor-not-allowed'
                  }`}
                  title="Tùy chọn gửi khi đang chạy"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isSplitMenuOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Split Menu Dropdown */}
              {isSplitMenuOpen && (
                <div className="absolute bottom-full right-0 mb-2 w-72 bg-surface dark:bg-[#181a24] border border-border rounded-xl shadow-xl z-50 p-1 flex flex-col gap-0.5 animate-fade-in">
                  {/* 1. Steer Action */}
                  <button
                    type="button"
                    onClick={handleSteer}
                    className="w-full text-left px-3 py-2 rounded-lg flex items-center justify-between hover:bg-amber-500/10 text-slate-800 dark:text-zinc-200 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5">
                      <Radio className="w-4 h-4 text-amber-500 shrink-0" />
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Steer</span>
                        <span className="text-[11px] text-slate-500 dark:text-zinc-400">Lái hướng lượt đang stream</span>
                      </div>
                    </div>
                    <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-highlight border border-border text-slate-400">↵</kbd>
                  </button>

                  {/* 2. Stop & Send Action */}
                  <button
                    type="button"
                    onClick={handleAbortAndPrompt}
                    className="w-full text-left px-3 py-2 rounded-lg flex items-center justify-between hover:bg-rose-500/10 text-slate-800 dark:text-zinc-200 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5">
                      <Square className="w-4 h-4 text-rose-500 shrink-0" />
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">Stop & send</span>
                        <span className="text-[11px] text-slate-500 dark:text-zinc-400">Dừng turn và gửi prompt mới</span>
                      </div>
                    </div>
                    <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-highlight border border-border text-slate-400">⌘⇧↵</kbd>
                  </button>

                  {/* 3. Queue Follow-up Action */}
                  <button
                    type="button"
                    onClick={handleFollowUp}
                    className="w-full text-left px-3 py-2 rounded-lg flex items-center justify-between hover:bg-blue-500/10 text-slate-800 dark:text-zinc-200 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5">
                      <Clock className="w-4 h-4 text-blue-500 shrink-0" />
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Queue follow-up</span>
                        <span className="text-[11px] text-slate-500 dark:text-zinc-400">Chờ turn xong rồi tự gửi</span>
                      </div>
                    </div>
                    <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-highlight border border-border text-slate-400">⌘↵</kbd>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const PromptComposer = React.memo(PromptComposerComponent);
