import { useState, useEffect, useCallback, useRef } from 'react';
import {
  OmpAgentStatus,
  ChatMessage,
  ThinkingBlock,
  ToolCall,
  FileDiffItem,
  PermissionRequest,
  OmpUiRequest,
  OmpInstallStatus,
  OmpModelInfo,
  OmpThinkingLevel,
  OmpEngineState,
  OmpSessionInfo,
  OmpBranchEntry,
  OmpSubagentInfo,
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

  // Subagents Hub state (Phase 3)
  const [subagents, setSubagents] = useState<OmpSubagentInfo[]>([]);

  // Extension UI Request queue (FIFO)
  const [uiRequestQueue, setUiRequestQueue] = useState<OmpUiRequest[]>([]);
  const uiRequestQueueRef = useRef<OmpUiRequest[]>([]);
  const activeUiRequest = uiRequestQueue.length > 0 ? uiRequestQueue[0] : null;
  
  // Model catalog & engine state
  const [availableModels, setAvailableModels] = useState<OmpModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<OmpModelInfo | null>(null);
  const [thinkingLevel, setThinkingLevel] = useState<OmpThinkingLevel>('off');
  const [engineState, setEngineState] = useState<OmpEngineState | null>(null);

  // Sessions state (Phase 2)
  const [sessions, setSessions] = useState<OmpSessionInfo[]>([]);
  const [activeSessionPath, setActiveSessionPath] = useState<string | null>(null);

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

  const refreshSessions = useCallback(async (): Promise<OmpSessionInfo[]> => {
    if (!window.electronAPI) return [];
    try {
      const res = await window.electronAPI.listSessions();
      if (res.success && Array.isArray(res.sessions)) {
        setSessions(res.sessions);
        const active = res.sessions.find((s) => s.active);
        if (active) {
          setActiveSessionPath(active.path);
        } else if (engineState?.sessionFile) {
          setActiveSessionPath(engineState.sessionFile);
        }
        return res.sessions;
      }
    } catch (err) {
      console.warn('[useOmpRpc] Failed to fetch sessions:', err);
    }
    return [];
  }, [engineState?.sessionFile]);

  const correlateBranchEntries = useCallback(
    async (currentMsgs: ChatMessage[]): Promise<ChatMessage[]> => {
      if (!window.electronAPI) return currentMsgs;
      try {
        const branchRes = await window.electronAPI.getBranchEntries();
        if (branchRes.success && Array.isArray(branchRes.entries)) {
          const timestampCounts = new Map<number, OmpBranchEntry[]>();
          for (const entry of branchRes.entries) {
            if (entry.role === 'user' && typeof entry.timestamp === 'number') {
              const list = timestampCounts.get(entry.timestamp) || [];
              list.push(entry);
              timestampCounts.set(entry.timestamp, list);
            }
          }
          return currentMsgs.map((m) => {
            if (m.role === 'user') {
              const matches = timestampCounts.get(m.timestamp);
              if (matches && matches.length === 1) {
                return { ...m, entryId: matches[0].entryId };
              }
              return { ...m, entryId: undefined };
            }
            return m;
          });
        }
      } catch (err) {
        console.warn('[useOmpRpc] Failed to correlate branch entries:', err);
      }
      return currentMsgs;
    },
    []
  );

  const switchSession = useCallback(
    async (sessionPath: string): Promise<boolean> => {
      if (status !== 'idle') {
        console.warn('[useOmpRpc] Cannot switch session while agent is busy (status:', status, ')');
        return false;
      }

      if (window.electronAPI) {
        try {
          const res = await window.electronAPI.switchSession(sessionPath);
          if (res.success) {
            const histRes = await window.electronAPI.loadHistory();
            if (histRes.success && Array.isArray(histRes.messages)) {
              if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
              }
              tokenBufferRef.current = '';
              setCurrentStreamText('');
              setCurrentThinking(null);
              activeToolCallsRef.current = [];
              setActiveToolCalls([]);
              setActiveDiff(null);
              setUiRequestQueue([]);
              uiRequestQueueRef.current = [];

              const correlated = await correlateBranchEntries(histRes.messages);
              setMessages(correlated);
              setActiveSessionPath(sessionPath);
              await refreshSessions();
              await refreshEngineState();
              return true;
            }
          } else if (res.error === 'session_busy') {
            console.warn('[useOmpRpc] Session switch rejected: engine is busy');
          }
        } catch (err) {
          console.error('[useOmpRpc] Failed to switch session:', err);
        }
        return false;
      } else {
        setActiveSessionPath(sessionPath);
        return true;
      }
    },
    [status, correlateBranchEntries, refreshSessions, refreshEngineState]
  );

  const newSession = useCallback(
    async (parentSession?: string): Promise<boolean> => {
      if (status !== 'idle') {
        console.warn('[useOmpRpc] Cannot create new session while agent is busy (status:', status, ')');
        return false;
      }

      if (window.electronAPI) {
        try {
          const res = await window.electronAPI.newSession(parentSession);
          if (res.success) {
            if (rafIdRef.current !== null) {
              cancelAnimationFrame(rafIdRef.current);
              rafIdRef.current = null;
            }
            tokenBufferRef.current = '';
            setMessages([]);
            setCurrentStreamText('');
            setCurrentThinking(null);
            activeToolCallsRef.current = [];
            setActiveToolCalls([]);
            setActiveDiff(null);
            setUiRequestQueue([]);
            uiRequestQueueRef.current = [];
            setActiveSessionPath(null);
            await refreshSessions();
            await refreshEngineState();
            return true;
          }
        } catch (err) {
          console.error('[useOmpRpc] Failed to create new session:', err);
        }
        return false;
      } else {
        setMessages([]);
        setActiveDiff(null);
        return true;
      }
    },
    [status, refreshSessions, refreshEngineState]
  );

  const branchFromMessage = useCallback(
    async (entryId: string): Promise<boolean> => {
      if (status !== 'idle') {
        console.warn('[useOmpRpc] Cannot branch session while agent is busy (status:', status, ')');
        return false;
      }

      if (window.electronAPI) {
        try {
          const res = await window.electronAPI.branchSession(entryId);
          if (res.success) {
            const histRes = await window.electronAPI.loadHistory();
            if (histRes.success && Array.isArray(histRes.messages)) {
              if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
              }
              tokenBufferRef.current = '';
              setCurrentStreamText('');
              setCurrentThinking(null);
              activeToolCallsRef.current = [];
              setActiveToolCalls([]);
              setActiveDiff(null);
              setUiRequestQueue([]);
              uiRequestQueueRef.current = [];

              const correlated = await correlateBranchEntries(histRes.messages);
              setMessages(correlated);
              await refreshSessions();
              await refreshEngineState();
              return true;
            }
          }
        } catch (err) {
          console.error('[useOmpRpc] Failed to branch session:', err);
        }
        return false;
      }
      return true;
    },
    [status, correlateBranchEntries, refreshSessions, refreshEngineState]
  );

  // Check installation immediately on launch
  useEffect(() => {
    checkInstallation();
  }, [checkInstallation]);

  // Load models, engine state, and sessions when installed
  useEffect(() => {
    if (installStatus?.installed && window.electronAPI) {
      refreshModels();
      refreshEngineState();
      refreshSessions();
    }
  }, [installStatus?.installed, refreshModels, refreshEngineState, refreshSessions]);

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
        refreshSessions();
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

    const unsubUiRequest = window.electronAPI.onOmpUiRequest((req) => {
      setUiRequestQueue((prev) => {
        if (prev.some((item) => item.id === req.id)) {
          return prev;
        }
        const updated = [...prev, req];
        uiRequestQueueRef.current = updated;
        return updated;
      });
    });

    const unsubUiCancel = window.electronAPI.onOmpUiRequestCancel((targetId) => {
      setUiRequestQueue((prev) => {
        const updated = prev.filter((item) => item.id !== targetId);
        uiRequestQueueRef.current = updated;
        return updated;
      });
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
      setMessages((prev) => {
        const next = [...prev, finalMsg];
        correlateBranchEntries(next)
          .then((annotated) => {
            setMessages(annotated);
          })
          .catch(() => {});
        return next;
      });
      setCurrentStreamText('');
      setCurrentThinking(null);
      activeToolCallsRef.current = [];
      setActiveToolCalls([]);
      refreshSessions();
    });

    const unsubSubagents = window.electronAPI.onOmpSubagentUpdate
      ? window.electronAPI.onOmpSubagentUpdate((updated) => {
          setSubagents(updated || []);
        })
      : () => {};

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
      unsubUiRequest();
      unsubUiCancel();
      unsubComplete();
      unsubSubagents();
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

  const respondUiRequest = useCallback(
    async (id: string, payload: { value?: unknown; confirmed?: boolean; cancelled?: boolean }) => {
      // Check if request is currently in queue (prevent double reply)
      const exists = uiRequestQueueRef.current.some((r) => r.id === id);
      if (!exists) return;

      // Immediately remove from queue (FIFO shift/filter)
      setUiRequestQueue((prev) => {
        const updated = prev.filter((r) => r.id !== id);
        uiRequestQueueRef.current = updated;
        return updated;
      });

      if (window.electronAPI) {
        try {
          await window.electronAPI.respondUiRequest(id, payload);
        } catch (err) {
          console.error('[useOmpRpc] Failed to respond to UI request:', err);
        }
      }
    },
    []
  );

  const respondUiSelect = useCallback(
    (id: string, value: string) => {
      return respondUiRequest(id, { value });
    },
    [respondUiRequest]
  );

  const respondUiConfirm = useCallback(
    (id: string, confirmed: boolean) => {
      return respondUiRequest(id, { confirmed });
    },
    [respondUiRequest]
  );

  const respondUiInput = useCallback(
    (id: string, value: string) => {
      return respondUiRequest(id, { value });
    },
    [respondUiRequest]
  );

  const dismissUiRequest = useCallback(
    (id: string) => {
      return respondUiRequest(id, { cancelled: true });
    },
    [respondUiRequest]
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
    uiRequestQueue,
    activeUiRequest,
    respondUiSelect,
    respondUiConfirm,
    respondUiInput,
    dismissUiRequest,
    respondUiRequest,
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
    sessions,
    activeSessionPath,
    refreshSessions,
    switchSession,
    newSession,
    branchFromMessage,
    subagents,
    sendMessage,
    respondPermission,
    acceptDiff,
    rejectDiff,
  };
}
