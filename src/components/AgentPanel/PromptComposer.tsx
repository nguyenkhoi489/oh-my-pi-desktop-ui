import React, { useState, useRef, useEffect, useCallback, KeyboardEvent, ChangeEvent } from 'react';
import {
  AtSign,
  CornerDownLeft,
  X,
  FileCode,
  Search,
  UploadCloud,
  ZoomIn,
  ChevronDown,
  Radio,
  Square,
  Clock,
  Cpu,
  Brain,
  Shield,
  Database,
  Check,
} from 'lucide-react';
import {
  OmpAgentStatus,
  WorkspaceFile,
  OmpCommandInfo,
  OmpModelInfo,
  OmpThinkingLevel,
  OmpApprovalMode,
  OmpContextUsage,
} from '../../types';
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
import { useI18n } from '../../i18n/I18nProvider';

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
  // Model, Thinking Level, Approval Mode & Context
  availableModels?: OmpModelInfo[];
  selectedModel?: OmpModelInfo | string | null;
  onSelectModel?: (provider: string, modelId: string) => void;
  thinkingLevel?: OmpThinkingLevel;
  onSelectThinkingLevel?: (level: OmpThinkingLevel) => void;
  approvalMode?: OmpApprovalMode;
  onSelectApprovalMode?: (mode: OmpApprovalMode) => void;
  contextUsage?: OmpContextUsage | null;
  onOpenStatsPanel?: () => void;
}
// Limit rendered files count in picker to prevent lag (Rule 4)
const MAX_PICKER_FILES = 100;
const FALLBACK_MODELS: OmpModelInfo[] = [
  { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'anthropic', reasoning: true },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', reasoning: false },
  { id: 'pi-deepseek-r1', name: 'DeepSeek R1', provider: 'deepseek', reasoning: true },
  { id: 'qwen-2.5-coder-32b', name: 'Qwen 2.5 Coder 32B', provider: 'lmstudio', reasoning: false },
];

const THINKING_LEVELS: OmpThinkingLevel[] = ['off', 'low', 'medium', 'high'];

interface ApprovalOption {
  id: OmpApprovalMode;
  label: string;
  description: string;
}


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
  availableModels,
  selectedModel,
  onSelectModel,
  thinkingLevel,
  onSelectThinkingLevel,
  approvalMode,
  onSelectApprovalMode,
  contextUsage,
  onOpenStatsPanel,
}) => {
  const { t } = useI18n();
  const [input, setInput] = useState<string>('');
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState<boolean>(false);
  const [pickerQuery, setPickerQuery] = useState<string>('');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [atCursorIndex, setAtCursorIndex] = useState<number | null>(null);

  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState<boolean>(false);
  const [commandQuery, setCommandQuery] = useState<string>('');
  const [commandSelectedIndex, setCommandSelectedIndex] = useState<number>(0);
  // Cursor position for '/' command menu trigger
  const [slashIndex, setSlashIndex] = useState<number | null>(null);
  // Split-button menu state when agent is running
  const [isSplitMenuOpen, setIsSplitMenuOpen] = useState<boolean>(false);
  const splitMenuRef = useRef<HTMLDivElement>(null);

  const [isModelMenuOpen, setIsModelMenuOpen] = useState<boolean>(false);
  const [isApprovalMenuOpen, setIsApprovalMenuOpen] = useState<boolean>(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const approvalMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setIsModelMenuOpen(false);
      }
      if (approvalMenuRef.current && !approvalMenuRef.current.contains(e.target as Node)) {
        setIsApprovalMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const modelsToUse = availableModels && availableModels.length > 0 ? availableModels : FALLBACK_MODELS;
  const activeModelId = typeof selectedModel === 'string'
    ? selectedModel
    : (selectedModel?.id || modelsToUse[0]?.id);
  const activeModelName = typeof selectedModel === 'string'
    ? selectedModel
    : (selectedModel?.name || selectedModel?.id || modelsToUse[0]?.name || 'Select Model');
  const activeProvider = typeof selectedModel === 'object' && selectedModel
    ? selectedModel.provider
    : modelsToUse.find((m) => m.id === activeModelId)?.provider;

  const approvalOptions: ApprovalOption[] = React.useMemo(() => [
    { id: 'write', label: t('header.approval.write'), description: t('header.approval.writeDesc') },
    { id: 'always-ask', label: t('header.approval.alwaysAsk'), description: t('header.approval.alwaysAskDesc') },
    { id: 'yolo', label: t('header.approval.yolo'), description: t('header.approval.yoloDesc') },
  ], [t]);

  const formatCompactTokens = (tokens?: number | null): string => {
    if (tokens == null || isNaN(tokens)) return '';
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
    return String(tokens);
  };

  const hasContextUsage =
    contextUsage?.percent != null &&
    typeof contextUsage.percent === 'number' &&
    !isNaN(contextUsage.percent);

  const percent = hasContextUsage
    ? Math.round((contextUsage!.percent as number) * 10) / 10
    : null;

  const formattedTokens = contextUsage?.tokens != null ? formatCompactTokens(contextUsage.tokens) : null;
  const formattedWindow = contextUsage?.contextWindow != null ? formatCompactTokens(contextUsage.contextWindow) : null;

  const meterColorClass = percent != null
    ? percent >= 90
      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
      : percent >= 70
      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
    : 'bg-surface text-slate-500 dark:text-zinc-400 border-border';

  const contextTooltip = hasContextUsage
    ? contextUsage!.tokens != null && contextUsage!.contextWindow != null
      ? t('header.contextUsageDetail', { tokens: (contextUsage!.tokens as number).toLocaleString(), window: (contextUsage!.contextWindow as number).toLocaleString(), percent: percent ?? 0 })
      : t('header.contextUsageSimple', { percent: percent ?? 0 })
    : undefined;

  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});
  const [lightboxImage, setLightboxImage] = useState<{ url: string; name: string } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const commandMenuRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef<number>(0);
  const activeBlobUrlsRef = useRef<Set<string>>(new Set());
  // Attachments inserted as @token in text (distinguished from button attachments)
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

  // Revoke Object URLs on unmount to prevent memory leaks
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

  // Attach file when tree emits "Add to chat" request
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

    // Revoke blob preview URL if existing
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

    // Inline chip: remove @file token in text to keep both sides synced
    if (inlineAttachmentsRef.current.has(file)) {
      inlineAttachmentsRef.current.delete(file);
      const token = `@${file}`;
      setInput((prev) =>
        prev.includes(`${token} `) ? prev.replace(`${token} `, '') : prev.replace(token, '')
      );
    }
  };

  // Save image attachment to filesystem or create blob preview
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
            // Do not attach fake path when save fails
            console.error('Failed to save image attachment:', res?.error || 'unknown error');
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

        // Web preview fallback without Electron
        const blob = file instanceof Blob ? file : new Blob([buffer.buffer as ArrayBuffer]);
        const blobUrl = URL.createObjectURL(blob);
        activeBlobUrlsRef.current.add(blobUrl);
        const fallbackPath = `.omp/attachments/${name}`;
        setImagePreviews((prev) => ({ ...prev, [fallbackPath]: blobUrl }));
        setAttachedFiles((prev) => (prev.includes(fallbackPath) ? prev : [...prev, fallbackPath]));
      } catch (err) {
        console.error('Failed to save image attachment:', err);
      }
    },
    []
  );

  // Handle paste image from clipboard (Cmd+V / Ctrl+V)
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = e.clipboardData;
    // Call preventDefault synchronously before any await
    const hasImage =
      Array.from(clipboardData?.items || []).some((item) => item.type.startsWith('image/')) ||
      Array.from(clipboardData?.files || []).some(
        (f) => f.type.startsWith('image/') || isImageFile(f.name)
      );
    if (!hasImage) return;

    e.preventDefault();
    // Synchronous part of extraction runs immediately in event handler
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

  // Handle drag and drop files into composer
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
        // Image outside workspace: save copy to .omp/attachments
        await saveAndAttachImage(item.file, undefined, undefined, item.file.name);
      } else if (rel) {
        // File inside workspace: attach directly without copying
        attachPath(rel);
      } else if (item.file.name) {
        attachPath(item.file.name);
      }
    }
  };

  const handleSelectCommand = (insertText: string) => {
    let newCursorPos: number;
    if (slashIndex !== null) {
      // Replace '/query' token at slash index with selected command
      const before = input.slice(0, slashIndex);
      const after = input.slice(textareaRef.current?.selectionEnd ?? input.length);
      setInput(`${before}${insertText}${after}`);
      newCursorPos = before.length + insertText.length;
    } else {
      // Menu opened via button without token: insert at cursor position
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

  // Insert '/' at cursor and open command menu
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

    // Revoke blob URLs when message is sent
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

    // Removing @file token removes corresponding attachment chip
    if (inlineAttachmentsRef.current.size > 0) {
      const removed = findRemovedInlineAttachments(val, inlineAttachmentsRef.current);
      if (removed.length > 0) {
        for (const file of removed) {
          inlineAttachmentsRef.current.delete(file);
        }
        setAttachedFiles((prev) => prev.filter((f) => !removed.includes(f)));
      }
    }

    // Smart Command menu token detection (ho tro Backspace va go giua chung):
    // Tim tu truoc con tro (tu dau dong hoac sau khoang trang / xuong dong)
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastWhitespaceIdx = Math.max(
      textBeforeCursor.lastIndexOf(' '),
      textBeforeCursor.lastIndexOf('\t'),
      textBeforeCursor.lastIndexOf('\n')
    );
    const slashCandidatePos = lastWhitespaceIdx === -1 ? 0 : lastWhitespaceIdx + 1;

    if (
      cursorPos > slashCandidatePos &&
      val[slashCandidatePos] === '/'
    ) {
      const query = val.slice(slashCandidatePos + 1, cursorPos);
      setSlashIndex(slashCandidatePos);
      setCommandQuery(query);
      setIsCommandMenuOpen(true);
    } else {
      setSlashIndex(null);
      setIsCommandMenuOpen(false);
    }

    // Smart @ File mention detection
    const atCandidatePos = lastWhitespaceIdx === -1 ? 0 : lastWhitespaceIdx + 1;
    if (
      cursorPos > atCandidatePos &&
      val[atCandidatePos] === '@'
    ) {
      const query = val.slice(atCandidatePos + 1, cursorPos);
      setAtCursorIndex(atCandidatePos);
      setPickerQuery(query);
      setIsPickerOpen(true);
    } else {
      setAtCursorIndex(null);
      setIsPickerOpen(false);
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
      className="p-3.5 bg-panel border-t border-border flex flex-col gap-2.5 relative z-20"
    >
      {/* Follow-up queue above composer */}
      {followUpQueue && followUpQueue.length > 0 && (
        <div className="p-2 bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/20 rounded-xl flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {t('composer.followUpQueue', { count: followUpQueue.length })}
            </span>
            <span className="text-[10px] text-slate-400 dark:text-zinc-500">
              {t('composer.followUpQueueDesc')}
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
            {t('composer.dragDropHint')}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-zinc-400">
            {t('composer.dropzoneSupport')}
          </span>
        </div>
      )}

      {/* Lightbox Image Modal */}
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
                    title={t('composer.zoomImage')}
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

                  {/* File name & format */}
                  <div className="flex flex-col min-w-0 max-w-[130px]">
                    <span className="font-mono text-[11.5px] font-medium text-slate-800 dark:text-zinc-200 truncate" title={file}>
                      {file.split('/').pop()}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-sans uppercase">
                      {file.split('.').pop()} {t('composer.imageTag')}
                    </span>
                  </div>

                  {/* Remove attachment button */}
                  <button
                    type="button"
                    onClick={() => removeAttachment(file)}
                    className="ml-0.5 p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-surface-highlight cursor-pointer"
                    title={t('composer.removeImageAttachment')}
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
                  title={t('composer.removeAttachment')}
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
              placeholder={t('composer.searchFilePlaceholder')}
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
                {t('composer.noFilesMatch')}
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
                ? t('composer.filterMoreNotice', { max: MAX_PICKER_FILES, count: filteredFiles.length })
                : t('composer.moveNav')}
            </span>
            <span>{t('composer.selectNav')}</span>
            <span>{t('composer.closeNav')}</span>
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
              ? t('composer.waitingPermissionPlaceholder')
              : status !== 'idle'
              ? t('composer.streamingPlaceholder')
              : t('composer.idlePlaceholder')
          }
          rows={3}
          className="w-full bg-transparent text-[13.5px] text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 resize-none outline-none font-sans leading-relaxed"
        />
        {/* Toolbar Bottom */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50 mt-1 relative z-20">
          <div className="flex items-center gap-1.5 py-0.5 relative">
            {/* Model Selector Pill & Popover */}
            <div className="relative" ref={modelMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setIsModelMenuOpen((prev) => !prev);
                  setIsApprovalMenuOpen(false);
                }}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors font-medium cursor-pointer border border-border/50 shrink-0 ${
                  isModelMenuOpen
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 shadow-xs'
                    : 'bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300'
                }`}
                title={t('header.selectModelAndThinking')}
              >
                <Cpu className="w-3.5 h-3.5 text-blue-500 shrink-0 pointer-events-none" />
                <span className="font-mono text-[11.5px] max-w-[100px] sm:max-w-[140px] lg:max-w-[180px] truncate pointer-events-none">
                  {activeModelName}
                </span>
                {thinkingLevel && thinkingLevel !== 'off' && (
                  <span className="text-[9px] px-1 py-0.2 rounded bg-blue-500/15 text-blue-500 font-semibold uppercase shrink-0 pointer-events-none">
                    {thinkingLevel}
                  </span>
                )}
                <ChevronDown className="w-3 h-3 text-slate-400 dark:text-zinc-500 shrink-0 pointer-events-none" />
              </button>

              {isModelMenuOpen && (
                <div className="absolute bottom-full mb-2 left-0 w-80 max-w-[90vw] bg-surface dark:bg-[#181a24] border border-border rounded-xl shadow-2xl py-2 z-50 animate-fade-in divide-y divide-border">
                  {/* Section 1: Model Selection */}
                  <div className="pb-2">
                    <div className="flex items-center justify-between px-3 py-1 text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                      <span>Available Models</span>
                      {modelsToUse.length > 0 && (
                        <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-mono">Live</span>
                      )}
                    </div>
                    <div className="max-h-52 overflow-y-auto mt-1 space-y-0.5 px-1">
                      {modelsToUse.map((m) => {
                        const isSelected = m.id === activeModelId && (!activeProvider || m.provider === activeProvider);
                        return (
                          <button
                            key={`${m.provider}/${m.id}`}
                            type="button"
                            onClick={() => {
                              onSelectModel?.(m.provider, m.id);
                              setIsModelMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold'
                                : 'text-slate-700 dark:text-zinc-300 hover:bg-surface-highlight'
                            }`}
                          >
                            <div className="flex flex-col min-w-0 pr-2">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[11px] truncate">{m.name || m.id}</span>
                                {m.reasoning && (
                                  <span title={t('header.reasoningModel')}>
                                    <Brain className="w-3 h-3 text-amber-500 shrink-0" />
                                  </span>
                                )}
                              </div>
                              <span className="text-[9.5px] text-slate-400 dark:text-zinc-500 truncate">{m.provider}</span>
                            </div>
                            {isSelected && <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Section 2: Thinking Level */}
                  <div className="pt-2 px-3">
                    <div className="flex items-center justify-between py-1 text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <Brain className="w-3 h-3 text-blue-500" />
                        Thinking Level
                      </span>
                      <span className="text-[9.5px] text-blue-500 font-mono capitalize">
                        {thinkingLevel || 'off'}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 mt-1.5">
                      {THINKING_LEVELS.map((lvl) => {
                        const isSelected = (thinkingLevel || 'off') === lvl;
                        return (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => {
                              onSelectThinkingLevel?.(lvl);
                            }}
                            className={`px-2 py-1 rounded-md text-[10.5px] font-mono text-center transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-blue-600 text-white font-semibold shadow-xs'
                                : 'bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border/50'
                            }`}
                          >
                            {lvl}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Approval Mode Pill & Popover */}
            <div className="relative" ref={approvalMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setIsApprovalMenuOpen((prev) => !prev);
                  setIsModelMenuOpen(false);
                }}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors font-medium cursor-pointer border border-border/50 shrink-0 ${
                  isApprovalMenuOpen
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 shadow-xs'
                    : 'bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300'
                }`}
                title={t('header.approvalModeTooltip')}
              >
                <Shield className="w-3.5 h-3.5 text-emerald-500 shrink-0 pointer-events-none" />
                <span className="text-[11.5px] truncate max-w-[80px] sm:max-w-[120px] pointer-events-none">
                  {approvalMode === 'always-ask'
                    ? t('header.approval.alwaysAsk')
                    : approvalMode === 'yolo'
                    ? t('header.approval.yolo')
                    : t('header.approval.write')}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400 dark:text-zinc-500 shrink-0 pointer-events-none" />
              </button>

              {isApprovalMenuOpen && (
                <div className="absolute bottom-full mb-2 left-0 w-64 max-w-[90vw] bg-surface dark:bg-[#181a24] border border-border rounded-xl shadow-2xl py-2 z-50 animate-fade-in">
                  <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                    Approval Mode
                  </div>
                  <div className="pt-1 space-y-0.5 px-1">
                    {approvalOptions.map((opt) => {
                      const isSelected = approvalMode === opt.id || (!approvalMode && opt.id === 'write');
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            onSelectApprovalMode?.(opt.id);
                            setIsApprovalMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold'
                              : 'text-slate-700 dark:text-zinc-300 hover:bg-surface-highlight'
                          }`}
                        >
                          <div className="flex flex-col min-w-0 pr-2">
                            <span className="text-[11px] font-medium">{opt.label}</span>
                            <span className="text-[9.5px] text-slate-400 dark:text-zinc-500 leading-tight mt-0.5">
                              {opt.description}
                            </span>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Context Usage Meter Pill */}
            {hasContextUsage && percent != null && (
              <button
                type="button"
                onClick={onOpenStatsPanel}
                className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors font-mono cursor-pointer border shrink-0 ${meterColorClass}`}
                title={contextTooltip}
              >
                <Database className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                <span className="text-[11px] hidden sm:inline">
                  {formattedTokens && formattedWindow ? `${formattedTokens}/${formattedWindow} (${percent}%)` : `${percent}%`}
                </span>
                <span className="text-[11px] sm:hidden">
                  {percent}%
                </span>
              </button>
            )}
          </div>

          {status === 'idle' ? (
            <div className="flex items-center gap-2">
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
                  title={t('composer.steerNowTooltip')}
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
                  title={t('composer.runningSendOptionsTooltip')}
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
                        <span className="text-[11px] text-slate-500 dark:text-zinc-400">{t('composer.steerOptionDesc')}</span>
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
                        <span className="text-[11px] text-slate-500 dark:text-zinc-400">{t('composer.abortOptionDesc')}</span>
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
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{t('composer.queueFollowUp')}</span>
                        <span className="text-[11px] text-slate-500 dark:text-zinc-400">{t('composer.followUpOptionDesc')}</span>
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
