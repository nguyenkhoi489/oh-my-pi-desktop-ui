import { useState, useEffect, useCallback, useRef } from 'react';
import {
  OmpAgentStatus,
  ChatMessage,
  ThinkingBlock,
  ToolCall,
  FileDiffItem,
  PermissionRequest,
  OmpInstallStatus,
  OmpModelInfo,
  OmpThinkingLevel,
  OmpEngineState,
} from '../types';
import { DEMO_MESSAGES, DEMO_INITIAL_DIFF } from '../mock/demoData';

export function useOmpRpc() {
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI);
  const [status, setStatus] = useState<OmpAgentStatus>('idle');
  const [installStatus, setInstallStatus] = useState<OmpInstallStatus | null>(null);
  const [isCheckingInstall, setIsCheckingInstall] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => (isElectron ? [] : DEMO_MESSAGES));
  const [currentThinking, setCurrentThinking] = useState<ThinkingBlock | null>(null);
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCall[]>([]);
  const [currentStreamText, setCurrentStreamText] = useState<string>('');
  const [activeDiff, setActiveDiff] = useState<FileDiffItem | null>(() => (isElectron ? null : DEMO_INITIAL_DIFF));
  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null);
  
  // Model catalog & engine state
  const [availableModels, setAvailableModels] = useState<OmpModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<OmpModelInfo | null>(null);
  const [thinkingLevel, setThinkingLevel] = useState<OmpThinkingLevel>('off');
  const [engineState, setEngineState] = useState<OmpEngineState | null>(null);

  // rAF token batching refs
  const tokenBufferRef = useRef<string>('');
  const rafIdRef = useRef<number | null>(null);
  const activeToolCallsRef = useRef<ToolCall[]>([]);

  const flushTokens = useCallback(() => {
    if (tokenBufferRef.current) {
      const chunk = tokenBufferRef.current;
      tokenBufferRef.current = '';
      setCurrentStreamText((prev) => prev + chunk);
    }
    rafIdRef.current = null;
  }, []);

  const checkInstallation = useCallback(async () => {
    setIsCheckingInstall(true);
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.checkOmpInstallation();
        setInstallStatus(result);
        return result;
      } else {
        // In browser mock environment
        const mockResult: OmpInstallStatus = { installed: false, error: 'Browser preview' };
        setInstallStatus(mockResult);
        return mockResult;
      }
    } finally {
      setIsCheckingInstall(false);
    }
  }, []);

  const setCustomPath = useCallback(async (customPath: string) => {
    setIsCheckingInstall(true);
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.setCustomBinaryPath(customPath);
        setInstallStatus(result);
        return result;
      }
    } finally {
      setIsCheckingInstall(false);
    }
  }, []);

  const browseBinaryFile = useCallback(async () => {
    if (window.electronAPI) {
      const selected = await window.electronAPI.selectBinaryFile();
      if (selected) {
        return await setCustomPath(selected);
      }
    }
  }, [setCustomPath]);

  // Model & State IPC Actions
  const refreshModels = useCallback(async (): Promise<OmpModelInfo[]> => {
    if (!window.electronAPI) return [];
    try {
      const res = await window.electronAPI.getAvailableModels();
      if (res.success && Array.isArray(res.models)) {
        setAvailableModels(res.models);
        return res.models;
      }
    } catch (err) {
      console.warn('[useOmpRpc] Failed to fetch available models:', err);
    }
    return [];
  }, []);

  const refreshEngineState = useCallback(async (): Promise<OmpEngineState | null> => {
    if (!window.electronAPI) return null;
    try {
      const res = await window.electronAPI.getState();
      if (res.success && res.state) {
        setEngineState(res.state);
        if (res.state.model) {
          setSelectedModel(res.state.model);
        }
        return res.state;
      }
    } catch (err) {
      console.warn('[useOmpRpc] Failed to fetch engine state:', err);
    }
    return null;
  }, []);

  const changeModel = useCallback(
    async (provider: string, modelId: string): Promise<boolean> => {
      if (window.electronAPI) {
        try {
          const res = await window.electronAPI.setModel(provider, modelId);
          if (res.success) {
            if (res.model) {
              setSelectedModel(res.model);
            } else {
              const match = availableModels.find((m) => m.id === modelId && m.provider === provider);
              if (match) setSelectedModel(match);
            }
            await refreshEngineState();
            return true;
          }
        } catch (err) {
          console.error('[useOmpRpc] Failed to change model:', err);
        }
        return false;
      } else {
        const match = availableModels.find((m) => m.id === modelId && m.provider === provider) || {
          id: modelId,
          name: modelId,
          provider,
        };
        setSelectedModel(match);
        return true;
      }
    },
    [availableModels, refreshEngineState]
  );

  const changeThinkingLevel = useCallback(
    async (level: OmpThinkingLevel): Promise<boolean> => {
      if (window.electronAPI) {
        try {
          const res = await window.electronAPI.setThinkingLevel(level);
          if (res.success) {
            setThinkingLevel(level);
            return true;
          }
        } catch (err) {
          console.error('[useOmpRpc] Failed to set thinking level:', err);
        }
        return false;
      } else {
        setThinkingLevel(level);
        return true;
      }
    },
    []
  );

  // Check installation immediately on launch
  useEffect(() => {
    checkInstallation();
  }, [checkInstallation]);

  // Load models and engine state when installed
  useEffect(() => {
    if (installStatus?.installed && window.electronAPI) {
      refreshModels();
      refreshEngineState();
    }
  }, [installStatus?.installed, refreshModels, refreshEngineState]);

  // Connect to Electron IPC listeners
  useEffect(() => {
    if (!window.electronAPI) {
      console.log('Running in browser preview mode (Electron API unavailable)');
      return;
    }

    const unsubStatus = window.electronAPI.onOmpStatusChange((newStatus) => {
      setStatus(newStatus);
      if (newStatus === 'idle') {
        refreshEngineState();
      }
    });

    const unsubToken = window.electronAPI.onOmpStreamToken((token) => {
      tokenBufferRef.current += token;
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(flushTokens);
      }
    });

    const unsubThinking = window.electronAPI.onOmpThinking((thinking) => {
      setCurrentThinking(thinking);
    });

    const unsubTool = window.electronAPI.onOmpToolCall((toolCall) => {
      setActiveToolCalls((prev) => {
        const index = prev.findIndex((t) => t.id === toolCall.id);
        let updated: ToolCall[];
        if (index >= 0) {
          updated = [...prev];
          updated[index] = toolCall;
        } else {
          updated = [...prev, toolCall];
        }
        activeToolCallsRef.current = updated;
        return updated;
      });
    });

    const unsubDiff = window.electronAPI.onOmpDiffGenerated((diff) => {
      setActiveDiff(diff);
    });

    const unsubPermission = window.electronAPI.onOmpPermissionRequest((req) => {
      setPendingPermission(req);
    });

    const unsubComplete = window.electronAPI.onOmpMessageComplete((msg) => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      tokenBufferRef.current = '';
      const currentTools = activeToolCallsRef.current;
      const finalMsg: ChatMessage = {
        ...msg,
        toolCalls:
          msg.toolCalls && msg.toolCalls.length > 0
            ? msg.toolCalls
            : currentTools.length > 0
              ? [...currentTools]
              : undefined,
      };
      setMessages((prev) => [...prev, finalMsg]);
      setCurrentStreamText('');
      setCurrentThinking(null);
      activeToolCallsRef.current = [];
      setActiveToolCalls([]);
    });

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      tokenBufferRef.current = '';
      unsubStatus();
      unsubToken();
      unsubThinking();
      unsubTool();
      unsubDiff();
      unsubPermission();
      unsubComplete();
    };
  }, [flushTokens, refreshEngineState]);

  const sendMessage = useCallback(
    async (prompt: string, contextFiles?: string[]) => {
      if (!prompt.trim()) return;

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      tokenBufferRef.current = '';

      const userMsg: ChatMessage = {
        id: 'msg-' + Date.now(),
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setCurrentStreamText('');
      setCurrentThinking(null);
      activeToolCallsRef.current = [];
      setActiveToolCalls([]);

      if (window.electronAPI) {
        try {
          await window.electronAPI.sendOmpMessage(prompt, { files: contextFiles });
        } catch (err) {
          console.error('[useOmpRpc] Failed to send message via Electron IPC:', err);
          setStatus('idle');
        }
      } else {
        // Fallback simulation in browser
        setStatus('thinking');
        setTimeout(() => {
          setCurrentThinking({
            id: 'think-' + Date.now(),
            thought: `Đang phân tích: "${prompt}"\nĐọc cây cú pháp AST và tạo bản patch tối ưu...`,
            timestamp: Date.now(),
            completed: true,
          });
          setStatus('executing_tool');
          const mockTool: ToolCall = {
            id: 't-' + Date.now(),
            name: 'tree_sitter_ast_patch',
            params: { target: 'src/auth/service.ts' },
            status: 'running',
            startTime: Date.now(),
          };
          activeToolCallsRef.current = [mockTool];
          setActiveToolCalls([mockTool]);

          setTimeout(() => {
            mockTool.status = 'completed';
            mockTool.endTime = Date.now();
            activeToolCallsRef.current = [mockTool];
            setActiveToolCalls([mockTool]);
            setStatus('streaming');

            const reply = `Tôi đã hoàn thành xử lý cho yêu cầu: "${prompt}". Đã cập nhật file với các kiểm tra hợp lệ.`;
            let idx = 0;
            const timer = setInterval(() => {
              if (idx < reply.length) {
                setCurrentStreamText(reply.slice(0, idx + 4));
                idx += 4;
              } else {
                clearInterval(timer);
                setStatus('idle');
                setMessages((prev) => [
                  ...prev,
                  {
                    id: 'msg-' + Date.now(),
                    role: 'assistant',
                    content: reply,
                    timestamp: Date.now(),
                    toolCalls: [mockTool],
                  },
                ]);
                setCurrentStreamText('');
                setCurrentThinking(null);
                activeToolCallsRef.current = [];
                setActiveToolCalls([]);
              }
            }, 30);
          }, 1000);
        }, 800);
      }
    },
    []
  );

  const respondPermission = useCallback(
    async (approved: boolean) => {
      if (!pendingPermission) return;
      if (window.electronAPI) {
        await window.electronAPI.respondToPermission(pendingPermission.id, approved);
      }
      setPendingPermission(null);
      setStatus('idle');
    },
    [pendingPermission]
  );

  const acceptDiff = useCallback(async () => {
    if (!activeDiff) return;
    if (window.electronAPI) {
      if (activeDiff.op !== 'delete') {
        await window.electronAPI.saveFile(activeDiff.filePath, activeDiff.modifiedContent);
      }
    }
    setActiveDiff((prev) => (prev ? { ...prev, status: 'accepted' } : null));
  }, [activeDiff]);

  const rejectDiff = useCallback(async () => {
    if (!activeDiff) return;
    if (window.electronAPI) {
      if (activeDiff.op === 'create') {
        await window.electronAPI.deleteFile(activeDiff.filePath);
      } else if (activeDiff.op === 'delete' || activeDiff.op === 'update' || !activeDiff.op) {
        await window.electronAPI.saveFile(activeDiff.filePath, activeDiff.originalContent);
      }
    }
    setActiveDiff((prev) => (prev ? { ...prev, status: 'rejected' } : null));
  }, [activeDiff]);

  return {
    status,
    installStatus,
    isCheckingInstall,
    checkInstallation,
    setCustomPath,
    browseBinaryFile,
    messages,
    currentThinking,
    activeToolCalls,
    currentStreamText,
    activeDiff,
    pendingPermission,
    availableModels,
    selectedModel,
    setSelectedModel,
    thinkingLevel,
    setThinkingLevel,
    engineState,
    changeModel,
    changeThinkingLevel,
    refreshModels,
    refreshEngineState,
    sendMessage,
    respondPermission,
    acceptDiff,
    rejectDiff,
  };
}
