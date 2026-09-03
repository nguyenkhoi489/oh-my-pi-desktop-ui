import { useState, useEffect, useCallback, useRef } from 'react';
import { tm } from '../../shared/i18n';
import {
  OmpAgentStatus,
  ChatMessage,
  ThinkingBlock,
  ToolCall,
  FileDiffItem,
  PermissionRequest,
  OmpUiRequest,
  OmpNotification,
  OmpEngineStatusEntry,
  OmpWidgetEntry,
  OmpInstallStatus,
  OmpModelInfo,
  OmpThinkingLevel,
  OmpEngineState,
  OmpSessionInfo,
  OmpBranchEntry,
  OmpSubagentInfo,
  OmpContextUsage,
  OmpSessionStats,
  OmpApprovalMode,
  OmpCommandInfo,
  OmpTodoPhase,
  OmpTodoItem,
  OmpRetryState,
  GlobalUsageResult,
  GlobalStatsResult,
  FetchGlobalUsageOptions,
  FetchUsageHistoryOptions,
  UsageHistoryResult,
  FetchUsageClientsOptions,
  UsageClientsResult,
  InvalidateUsageOptions,
  UsageInvalidateResult,
  StartStatsDashboardOptions,
  StatsDashboardResult,
  StatsDashboardStatus,
  FetchEngineConfigOptions,
  SetEngineConfigOptions,
  ResetEngineConfigOptions,
  EngineConfigPathOptions,
  EngineConfigListResult,
  EngineConfigMutationResult,
  EngineConfigPathResult,
  StorageGcOptions,
  StorageGcResponse,
  ImageBackendsAction,
  ImageBackendsOptions,
  ImageBackendsResponse,
  SshHostAddInput,
  SshHostsListResponse,
  SshHostMutationResponse,
  GrievancesListOptions,
  GrievancesListResponse,
  GrievancesCleanOptions,
  GrievancesCleanResponse,
  GrievancesPushResponse,
  CommitRunOptions,
  CleanseRunOptions,
  GitStatusResult,
  BrowserRelayInstallOptions,
  BrowserRelayStartOptions,
  BrowserRelayStatus,
  BrowserRelayInstallResult,
  SayOptions,
  SayStatusEvent,
} from '../types';
import { reconcileFollowUpQueue, type FollowUpQueueItem } from '../utils/followUpQueue';
import { DEMO_MESSAGES, DEMO_INITIAL_DIFF } from '../mock/demoData';
import { stripAnsi } from '../../shared/text/strip-ansi';
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

  // Text-to-Speech State (Phase 17)
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  // Notifications & Status Surfacing (Phase 1)
  const [notifications, setNotifications] = useState<OmpNotification[]>([]);
  const [engineStatuses, setEngineStatuses] = useState<OmpEngineStatusEntry[]>([]);
  const [engineWidgets, setEngineWidgets] = useState<OmpWidgetEntry[]>([]);
  // Usage & Context Observability (Phase 2)
  const [contextUsage, setContextUsage] = useState<OmpContextUsage | null>(null);
  const [tokensPerSecond, setTokensPerSecond] = useState<number | null>(null);

  // Extension UI Request queue (FIFO)
  const [uiRequestQueue, setUiRequestQueue] = useState<OmpUiRequest[]>([]);
  const uiRequestQueueRef = useRef<OmpUiRequest[]>([]);
  const activeUiRequest = uiRequestQueue.length > 0 ? uiRequestQueue[0] : null;
  
  // Follow-up Queue State (Phase 3)
  const [followUpQueue, setFollowUpQueue] = useState<FollowUpQueueItem[]>([]);
  const followUpQueueRef = useRef<FollowUpQueueItem[]>([]);
  const lastStatusRef = useRef<OmpAgentStatus>('idle');
  const pendingFollowUpsRef = useRef(0);
  const [availableModels, setAvailableModels] = useState<OmpModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<OmpModelInfo | null>(null);
  const [thinkingLevel, setThinkingLevel] = useState<OmpThinkingLevel>('off');
  const [engineState, setEngineState] = useState<OmpEngineState | null>(null);
  const [approvalMode, setApprovalMode] = useState<OmpApprovalMode | undefined>(undefined);
  const [isCompacting, setIsCompacting] = useState<boolean>(false);
  // Sessions state (Phase 2)
  const [sessions, setSessions] = useState<OmpSessionInfo[]>([]);
  const [activeSessionPath, setActiveSessionPath] = useState<string | null>(null);
  const [availableCommands, setAvailableCommands] = useState<OmpCommandInfo[]>([]);
  // Todos & Plan Progress (Phase 4)
  const [todoPhases, setTodoPhases] = useState<OmpTodoPhase[]>([]);
  const [todos, setTodos] = useState<OmpTodoItem[]>([]);
  const [retryState, setRetryState] = useState<OmpRetryState>({ isRetrying: false });
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
      } else {
        try {
          const raw = localStorage.getItem('omp_settings');
          const obj = raw ? JSON.parse(raw) : {};
          localStorage.setItem('omp_settings', JSON.stringify({ ...obj, customBinaryPath: customPath }));
        } catch {}
        const mockStatus = { installed: true, binaryPath: customPath, version: 'v0.1.0-mock' };
        setInstallStatus(mockStatus);
        return mockStatus;
      }
    } finally {
      setIsCheckingInstall(false);
    }
  }, []);

  const browseBinaryFile = useCallback(async (): Promise<string | null> => {
    if (window.electronAPI) {
      const selected = await window.electronAPI.selectBinaryFile();
      if (selected) {
        await setCustomPath(selected);
        return selected;
      }
    }
    return null;
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
  const refreshCommands = useCallback(async (): Promise<OmpCommandInfo[]> => {
    if (!window.electronAPI || !window.electronAPI.getAvailableCommands) return [];
    try {
      const res = await window.electronAPI.getAvailableCommands();
      if (res.success && Array.isArray(res.commands)) {
        setAvailableCommands(res.commands);
        return res.commands;
      }
    } catch (err) {
      console.warn('[useOmpRpc] Failed to refresh commands:', err);
    }
    return [];
  }, []);

  const refreshTodos = useCallback(async () => {
    if (window.electronAPI?.getTodos) {
      try {
        const res = await window.electronAPI.getTodos();
        if (res?.success) {
          setTodoPhases(res.phases || []);
          setTodos(res.todos || []);
        }
      } catch (err) {
        console.warn('[useOmpRpc] Failed to get todos:', err);
      }
    }
  }, []);

  const updateTodos = useCallback(async (phases: OmpTodoPhase[]) => {
    if (window.electronAPI?.setTodos) {
      try {
        const res = await window.electronAPI.setTodos(phases);
        if (res?.success) {
          setTodoPhases(res.phases || phases);
        }
        return res;
      } catch (err) {
        console.error('[useOmpRpc] Failed to set todos:', err);
        return { success: false, error: String(err) };
      }
    }
    return { success: false, error: 'electronAPI.setTodos not available' };
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
        if (res.state.thinkingLevel !== undefined && res.state.thinkingLevel !== null) {
          setThinkingLevel(res.state.thinkingLevel as OmpThinkingLevel);
        }
        if (res.state.approvalMode !== undefined) {
          setApprovalMode(res.state.approvalMode);
        }
        // Ignore when follow_up is still sending so stale get_state does not consume queued item
        if (res.state.queuedMessageCount !== undefined && pendingFollowUpsRef.current === 0) {
          const { queue, consumedIds } = reconcileFollowUpQueue(
            followUpQueueRef.current,
            res.state.queuedMessageCount
          );
          if (consumedIds.length > 0) {
            followUpQueueRef.current = queue;
            setFollowUpQueue(queue);
            setMessages((prev) =>
              prev.map((m) => (consumedIds.includes(m.id) ? { ...m, queued: false } : m))
            );
          }
        }
        if (res.state.todoPhases || res.state.todos) {
          if (res.state.todoPhases) setTodoPhases(res.state.todoPhases);
          if (res.state.todos) setTodos(res.state.todos);
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
      setThinkingLevel(level);
      if (window.electronAPI) {
        try {
          if (window.electronAPI.setSettings) {
            window.electronAPI.setSettings({ defaultThinkingLevel: level }).catch(() => {});
          }
          const res = await window.electronAPI.setThinkingLevel(level);
          if (res.success) {
            await refreshEngineState();
            return true;
          }
        } catch (err) {
          console.error('[useOmpRpc] Failed to set thinking level:', err);
        }
        return false;
      } else {
        return true;
      }
    },
    [refreshEngineState]
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
          const textToEntries = new Map<string, OmpBranchEntry[]>();
          for (const entry of branchRes.entries) {
            const rawText = entry.text ?? (entry as any).content;
            if (typeof rawText === 'string') {
              const list = textToEntries.get(rawText) || [];
              list.push(entry);
              textToEntries.set(rawText, list);
            }
          }

          const userTextCounts = new Map<string, number>();
          for (const m of currentMsgs) {
            if (m.role === 'user' && typeof m.content === 'string') {
              userTextCounts.set(m.content, (userTextCounts.get(m.content) || 0) + 1);
            }
          }

          return currentMsgs.map((m) => {
            if (m.role === 'user' && typeof m.content === 'string') {
              const matches = textToEntries.get(m.content);
              const userCount = userTextCounts.get(m.content) || 0;
              if (matches && matches.length === 1 && userCount === 1) {
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
              setNotifications([]);
              setEngineStatuses([]);
              setEngineWidgets([]);

              setTodoPhases([]);
              setTodos([]);
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
            setFollowUpQueue([]);
            uiRequestQueueRef.current = [];
            setNotifications([]);
            setEngineStatuses([]);
            setEngineWidgets([]);
            setActiveSessionPath(null);
            setTodoPhases([]);
            setTodos([]);
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
        setFollowUpQueue([]);
        return true;
      }
    },
    [status, refreshSessions, refreshEngineState]
  );
  const renameSession = useCallback(
    async (name: string): Promise<boolean> => {
      if (status !== 'idle') {
        console.warn('[useOmpRpc] Cannot rename session while agent is busy (status:', status, ')');
        return false;
      }
      const trimmed = (name || '').trim();
      if (!trimmed) return false;
      if (window.electronAPI) {
        try {
          const res = await window.electronAPI.renameSession(trimmed);
          if (res.success) {
            await refreshEngineState();
            await refreshSessions();
            return true;
          }
        } catch (err) {
          console.error('[useOmpRpc] Failed to rename session:', err);
        }
        return false;
      }
      return false;
    },
    [status, refreshEngineState, refreshSessions]
  );

  const deleteSession = useCallback(
    async (sessionPath: string): Promise<boolean> => {
      if (status !== 'idle') {
        console.warn('[useOmpRpc] Cannot delete session while agent is busy (status:', status, ')');
        return false;
      }
      if (window.electronAPI) {
        try {
          const res = await window.electronAPI.deleteSession(sessionPath);
          if (res.success) {
            await refreshSessions();
            return true;
          }
        } catch (err) {
          console.error('[useOmpRpc] Failed to delete session:', err);
        }
        return false;
      }
      return false;
    },
    [status, refreshSessions]
  );

  const exportSession = useCallback(
    async (): Promise<{ success: boolean; path?: string; cancelled?: boolean; error?: string }> => {
      if (status !== 'idle') {
        console.warn('[useOmpRpc] Cannot export session while agent is busy (status:', status, ')');
        return { success: false, error: 'session_busy' };
      }
      if (window.electronAPI) {
        try {
          return await window.electronAPI.exportSession();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return { success: false, error: msg };
        }
      }
      return { success: false, error: 'Electron API unavailable' };
    },
    [status]
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
              setFollowUpQueue([]);
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
  // Load initial thinking level from persisted settings
  useEffect(() => {
    if (window.electronAPI?.getSettings) {
      window.electronAPI.getSettings().then((s) => {
        if (s?.defaultThinkingLevel) {
          setThinkingLevel(s.defaultThinkingLevel);
        }
      }).catch(() => {});
    }
  }, []);

  // Load models, engine state, sessions, and todos when installed
  useEffect(() => {
    if (installStatus?.installed && window.electronAPI) {
      refreshModels();
      refreshEngineState();
      refreshSessions();
      refreshTodos();
    }
  }, [installStatus?.installed, refreshModels, refreshEngineState, refreshSessions, refreshTodos]);

  // Connect to Electron IPC listeners
  useEffect(() => {
    if (!window.electronAPI) {
      console.log('Running in browser preview mode (Electron API unavailable)');
      return;
    }

    const unsubStatus = window.electronAPI.onOmpStatusChange((newStatus) => {
      const leftIdle = lastStatusRef.current === 'idle' && newStatus !== 'idle';
      lastStatusRef.current = newStatus;
      setStatus(newStatus);
      if (newStatus === 'idle') {
        refreshEngineState();
        refreshSessions();
        refreshCommands();
      } else if (leftIdle && followUpQueueRef.current.length > 0) {
        // Engine automatically ran follow-up message from queue, resync queuedMessageCount
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
        // Guard against duplicate fileMention if same files already exist
        if (finalMsg.role === 'fileMention') {
          const incomingPaths = (finalMsg.files || []).map((f) => f.path).sort().join('|');
          const isDuplicate = prev.some((m) => {
            if (m.role !== 'fileMention') return false;
            const existingPaths = (m.files || []).map((f) => f.path).sort().join('|');
            return existingPaths === incomingPaths && Math.abs((m.timestamp || 0) - (finalMsg.timestamp || 0)) < 60000;
          });
          if (isDuplicate) {
            return prev;
          }
        }
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

    const unsubNotification = window.electronAPI.onOmpNotification
      ? window.electronAPI.onOmpNotification((notif) => {
          setNotifications((prev) => {
            const next = [...prev, notif];
            return next.length > 5 ? next.slice(next.length - 5) : next;
          });
          if (notif.notifyType !== 'error') {
            setTimeout(() => {
              setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
            }, 6000);
          }
        })
      : () => {};

    const unsubEngineStatus = window.electronAPI.onOmpEngineStatus
      ? window.electronAPI.onOmpEngineStatus((statuses) => {
          setEngineStatuses(statuses || []);
        })
      : () => {};

    const unsubWidgetUpdate = window.electronAPI.onOmpWidgetUpdate
      ? window.electronAPI.onOmpWidgetUpdate((widgets) => {
          setEngineWidgets(widgets || []);
        })
      : () => {};
    const unsubContextUsage = window.electronAPI.onOmpContextUsage
      ? window.electronAPI.onOmpContextUsage((data) => {
          setContextUsage(data.contextUsage ?? null);
          setTokensPerSecond(data.tokensPerSecond ?? null);
        })
      : () => {};

    const unsubCommands = window.electronAPI.onOmpCommandsUpdate
      ? window.electronAPI.onOmpCommandsUpdate((cmds) => {
          setAvailableCommands(cmds || []);
        })
      : () => {};

    const unsubCommandOutput = window.electronAPI.onOmpCommandOutput
      ? window.electronAPI.onOmpCommandOutput((data) => {
          const rawText = typeof data === 'string' ? data : (data?.text || '');
          if (!rawText) return;
          const cmdId =
            typeof data === 'object' && data !== null && 'id' in data && typeof (data as any).id === 'string'
              ? (data as any).id
              : undefined;

          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (cmdId && last && last.role === 'system' && (last as any).cmdId === cmdId) {
              const updatedRaw = (((last as any).rawContent as string) || last.content) + rawText;
              const clean = stripAnsi(updatedRaw);
              if (!clean.trim()) return prev;
              const next = [...prev];
              next[next.length - 1] = {
                ...last,
                content: clean,
                cmdId,
                rawContent: updatedRaw,
              } as any;
              return next;
            }

            const clean = stripAnsi(rawText);
            if (!clean.trim()) return prev;

            const sysMsg: ChatMessage = {
              id: `msg-cmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              role: 'system',
              content: clean,
              timestamp: Date.now(),
              ...(cmdId ? { cmdId, rawContent: rawText } : {}),
            } as any;
            return [...prev, sysMsg];
          });
        })
      : () => {};


    const unsubTodos = window.electronAPI.onOmpTodosUpdate
      ? window.electronAPI.onOmpTodosUpdate((data) => {
          setTodoPhases(data?.phases || []);
          setTodos(data?.todos || []);
        })
      : () => {};
    const unsubRetry = window.electronAPI.onOmpRetryState
      ? window.electronAPI.onOmpRetryState((state) => {
          setRetryState(state || { isRetrying: false });
        })
      : () => {};
    const unsubSay = window.electronAPI.onSayStatus
      ? window.electronAPI.onSayStatus((sayStatus: SayStatusEvent) => {
          setIsSpeaking(Boolean(sayStatus?.speaking));
        })
      : () => {};
    refreshCommands();
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
      unsubNotification();
      unsubEngineStatus();
      unsubWidgetUpdate();
      unsubContextUsage();
      unsubCommands();
      unsubCommandOutput();
      unsubTodos();
      unsubRetry();
      unsubSay();
    };
  }, [flushTokens, refreshEngineState, refreshCommands]);

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

      // Simulate attached context card in browser preview when engine is absent
      const newMessages: ChatMessage[] = [];
      if (!window.electronAPI && contextFiles && contextFiles.length > 0) {
        newMessages.push({
          id: 'files-' + Date.now(),
          role: 'fileMention',
          content: '',
          timestamp: Date.now(),
          files: contextFiles.map((p) => ({
            path: p,
            name: p.split('/').pop() || p,
          })),
        });
      }
      newMessages.push(userMsg);

      setMessages((prev) => [...prev, ...newMessages]);
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
            thought: tm('mock.thought', { prompt }),
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

            const reply = tm('mock.reply', { prompt });
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

  const steer = useCallback(
    async (message: string, contextFiles?: string[]) => {
      if (!message.trim()) return;

      const userMsg: ChatMessage = {
        id: 'msg-steer-' + Date.now(),
        role: 'user',
        content: message,
        timestamp: Date.now(),
        steering: true,
      };

      // Simulate attached context card in browser preview when engine is absent
      const newMessages: ChatMessage[] = [];
      if (!window.electronAPI && contextFiles && contextFiles.length > 0) {
        newMessages.push({
          id: 'files-' + Date.now(),
          role: 'fileMention',
          content: '',
          timestamp: Date.now(),
          files: contextFiles.map((p) => ({
            path: p,
            name: p.split('/').pop() || p,
          })),
        });
      }
      newMessages.push(userMsg);

      setMessages((prev) => [...prev, ...newMessages]);

      if (window.electronAPI) {
        try {
          await window.electronAPI.steerOmp(message, { files: contextFiles });
        } catch (err) {
          console.error('[useOmpRpc] Failed to send steer command via Electron IPC:', err);
        }
      }
    },
    []
  );

  const abortAndPrompt = useCallback(
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

      // Simulate attached context card in browser preview when engine is absent
      const newMessages: ChatMessage[] = [];
      if (!window.electronAPI && contextFiles && contextFiles.length > 0) {
        newMessages.push({
          id: 'files-' + Date.now(),
          role: 'fileMention',
          content: '',
          timestamp: Date.now(),
          files: contextFiles.map((p) => ({
            path: p,
            name: p.split('/').pop() || p,
          })),
        });
      }
      newMessages.push(userMsg);

      setMessages((prev) => [...prev, ...newMessages]);
      setCurrentStreamText('');
      setCurrentThinking(null);
      activeToolCallsRef.current = [];
      setActiveToolCalls([]);
      setStatus('thinking');

      if (window.electronAPI) {
        try {
          await window.electronAPI.abortAndPromptOmp(prompt, { files: contextFiles });
        } catch (err) {
          console.error('[useOmpRpc] Failed to send abortAndPrompt command via Electron IPC:', err);
          setStatus('idle');
        }
      }
    },
    []
  );
  const followUp = useCallback(
    async (message: string, contextFiles?: string[]) => {
      if (!message.trim()) return;

      const itemId = 'msg-queued-' + Date.now();
      const queuedItem: FollowUpQueueItem = {
        id: itemId,
        content: message,
        files: contextFiles,
        timestamp: Date.now(),
      };

      const updatedQueue = [...followUpQueueRef.current, queuedItem];
      followUpQueueRef.current = updatedQueue;
      setFollowUpQueue(updatedQueue);

      const userMsg: ChatMessage = {
        id: itemId,
        role: 'user',
        content: message,
        timestamp: Date.now(),
        queued: true,
      };

      // Simulate attached context card in browser preview when engine is absent
      const newMessages: ChatMessage[] = [];
      if (!window.electronAPI && contextFiles && contextFiles.length > 0) {
        newMessages.push({
          id: 'files-' + Date.now(),
          role: 'fileMention',
          content: '',
          timestamp: Date.now(),
          files: contextFiles.map((p) => ({
            path: p,
            name: p.split('/').pop() || p,
          })),
        });
      }
      newMessages.push(userMsg);

      setMessages((prev) => [...prev, ...newMessages]);

      if (!window.electronAPI) return;
      pendingFollowUpsRef.current += 1;
      try {
        const res = await window.electronAPI.followUpOmp(message, { files: contextFiles });
        if (!res.success) throw new Error(res.error || tm('rpc.followUpRejected'));
      } catch (err) {
        console.error('[useOmpRpc] Failed to queue follow-up via Electron IPC:', err);
        const remaining = followUpQueueRef.current.filter((item) => item.id !== itemId);
        followUpQueueRef.current = remaining;
        setFollowUpQueue(remaining);
        setMessages((prev) => prev.filter((m) => m.id !== itemId));
      } finally {
        pendingFollowUpsRef.current -= 1;
      }
    },
    []
  );

  const abort = useCallback(async () => {
    if (window.electronAPI) {
      try {
        await window.electronAPI.abortOmp();
      } catch (err) {
        console.error('[useOmpRpc] Failed to abort via Electron IPC:', err);
      }
    }
    setStatus('idle');
  }, []);

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
  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Push local toast from renderer (not from engine)
  const pushNotification = useCallback(
    (
      message: string,
      notifyType: OmpNotification['notifyType'] = 'info',
      action?: OmpNotification['action']
    ) => {
      const notif: OmpNotification = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        message,
        notifyType,
        timestamp: Date.now(),
        action,
      };
      setNotifications((prev) => {
        const next = [...prev, notif];
        return next.length > 5 ? next.slice(next.length - 5) : next;
      });
      if (notifyType !== 'error') {
        setTimeout(() => {
          setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
        }, 8000);
      }
    },
    []
  );

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);
  const getSessionStats = useCallback(async (): Promise<{ success: boolean; stats?: OmpSessionStats; error?: string }> => {
    if (!window.electronAPI?.getSessionStats) {
      return { success: false, error: 'electronAPI.getSessionStats is unavailable' };
    }
    try {
      return await window.electronAPI.getSessionStats();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Failed to fetch session stats' };
    }
  }, []);

  const getGlobalUsage = useCallback(
    async (options?: boolean | FetchGlobalUsageOptions): Promise<GlobalUsageResult> => {
      if (!window.electronAPI?.getGlobalUsage) {
        return { success: false, error: 'electronAPI.getGlobalUsage is unavailable' };
      }
      try {
        return await window.electronAPI.getGlobalUsage(options);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg || 'Failed to fetch global usage' };
      }
    },
    []
  );

  const getGlobalStats = useCallback(async (forceRefresh?: boolean): Promise<GlobalStatsResult> => {
    if (!window.electronAPI?.getGlobalStats) {
      return { success: false, error: 'electronAPI.getGlobalStats is unavailable' };
    }
    try {
      return await window.electronAPI.getGlobalStats(forceRefresh);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Failed to fetch global stats' };
    }
  }, []);

  const getUsageHistory = useCallback(
    async (options?: FetchUsageHistoryOptions): Promise<UsageHistoryResult> => {
      if (!window.electronAPI?.getUsageHistory) {
        return { success: false, error: 'electronAPI.getUsageHistory is unavailable' };
      }
      try {
        return await window.electronAPI.getUsageHistory(options);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg || 'Failed to fetch usage history' };
      }
    },
    []
  );

  const getUsageClients = useCallback(
    async (options?: FetchUsageClientsOptions): Promise<UsageClientsResult> => {
      if (!window.electronAPI?.getUsageClients) {
        return { success: false, error: 'electronAPI.getUsageClients is unavailable' };
      }
      try {
        return await window.electronAPI.getUsageClients(options);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg || 'Failed to fetch usage clients' };
      }
    },
    []
  );

  const invalidateUsage = useCallback(
    async (options?: InvalidateUsageOptions): Promise<UsageInvalidateResult> => {
      if (!window.electronAPI?.invalidateUsage) {
        return { success: false, error: 'electronAPI.invalidateUsage is unavailable' };
      }
      try {
        return await window.electronAPI.invalidateUsage(options);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg || 'Failed to invalidate usage cache' };
      }
    },
    []
  );

  const startStatsDashboard = useCallback(
    async (options?: StartStatsDashboardOptions): Promise<StatsDashboardResult> => {
      if (!window.electronAPI?.startStatsDashboard) {
        return {
          success: false,
          status: { running: false, status: 'error' },
          error: 'electronAPI.startStatsDashboard is unavailable',
        };
      }
      try {
        return await window.electronAPI.startStatsDashboard(options);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          status: { running: false, status: 'error' },
          error: msg || 'Failed to start stats dashboard',
        };
      }
    },
    []
  );

  const stopStatsDashboard = useCallback(async (): Promise<StatsDashboardResult> => {
    if (!window.electronAPI?.stopStatsDashboard) {
      return {
        success: false,
        status: { running: false, status: 'error' },
        error: 'electronAPI.stopStatsDashboard is unavailable',
      };
    }
    try {
      return await window.electronAPI.stopStatsDashboard();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        status: { running: false, status: 'error' },
        error: msg || 'Failed to stop stats dashboard',
      };
    }
  }, []);

  const getStatsDashboardStatus = useCallback(async (): Promise<StatsDashboardStatus> => {
    if (!window.electronAPI?.getStatsDashboardStatus) {
      return { running: false, status: 'stopped' };
    }
    try {
      return await window.electronAPI.getStatsDashboardStatus();
    } catch {
      return { running: false, status: 'stopped' };
    }
  }, []);

  const openExternal = useCallback(async (url: string): Promise<{ success: boolean; error?: string }> => {
    if (!window.electronAPI?.openExternal) {
      if (typeof window !== 'undefined') {
        window.open(url, '_blank');
        return { success: true };
      }
      return { success: false, error: 'electronAPI.openExternal is unavailable' };
    }
    try {
      return await window.electronAPI.openExternal(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Failed to open external url' };
    }
  }, []);

  const getEngineConfig = useCallback(
    async (options?: FetchEngineConfigOptions): Promise<EngineConfigListResult> => {
      if (!window.electronAPI?.getEngineConfig) {
        return { success: false, error: 'electronAPI.getEngineConfig is unavailable' };
      }
      try {
        return await window.electronAPI.getEngineConfig(options);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg || 'Failed to fetch engine config' };
      }
    },
    []
  );

  const setEngineConfigValue = useCallback(
    async (key: string, value: string, options?: SetEngineConfigOptions): Promise<EngineConfigMutationResult> => {
      if (!window.electronAPI?.setEngineConfigValue) {
        return { success: false, error: 'electronAPI.setEngineConfigValue is unavailable' };
      }
      try {
        return await window.electronAPI.setEngineConfigValue(key, value, options);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg || 'Failed to set engine config' };
      }
    },
    []
  );

  const resetEngineConfigValue = useCallback(
    async (key: string, options?: ResetEngineConfigOptions): Promise<EngineConfigMutationResult> => {
      if (!window.electronAPI?.resetEngineConfigValue) {
        return { success: false, error: 'electronAPI.resetEngineConfigValue is unavailable' };
      }
      try {
        return await window.electronAPI.resetEngineConfigValue(key, options);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg || 'Failed to reset engine config' };
      }
    },
    []
  );

  const getEngineConfigPath = useCallback(
    async (options?: EngineConfigPathOptions): Promise<EngineConfigPathResult> => {
      if (!window.electronAPI?.getEngineConfigPath) {
        return { success: false, error: 'electronAPI.getEngineConfigPath is unavailable' };
      }
      try {
        return await window.electronAPI.getEngineConfigPath(options);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg || 'Failed to get engine config path' };
      }
    },
    []
  );
  const runGc = useCallback(
    async (options?: StorageGcOptions): Promise<StorageGcResponse> => {
      if (!window.electronAPI?.runGc) {
        return { success: false, error: 'electronAPI.runGc is unavailable' };
      }
      try {
        return await window.electronAPI.runGc(options);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg || 'Failed to run storage GC' };
      }
    },
    []
  );
  const runImages = useCallback(
    async (
      action: ImageBackendsAction = 'status',
      options?: ImageBackendsOptions
    ): Promise<ImageBackendsResponse> => {
      if (!window.electronAPI?.runImages) {
        return {
          success: false,
          action,
          error: 'electronAPI.runImages is unavailable',
        };
      }
      try {
        return await window.electronAPI.runImages(action, options);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          action,
          error: msg || 'Failed to run image backends action',
        };
      }
    },
    []
  );
  const listSshHosts = useCallback(async (): Promise<SshHostsListResponse> => {
    if (!window.electronAPI?.listSshHosts) {
      return {
        success: false,
        error: 'electronAPI.listSshHosts is unavailable',
      };
    }
    try {
      return await window.electronAPI.listSshHosts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: msg || tm('ops.ssh.listFailed'),
      };
    }
  }, []);
  const addSshHost = useCallback(
    async (input: SshHostAddInput): Promise<SshHostMutationResponse> => {
      if (!window.electronAPI?.addSshHost) {
        return {
          success: false,
          error: 'electronAPI.addSshHost is unavailable',
        };
      }
      try {
        return await window.electronAPI.addSshHost(input);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: msg || tm('ops.ssh.addFailed'),
        };
      }
    },
    []
  );
  const removeSshHost = useCallback(
    async (name: string, scope: 'project' | 'user'): Promise<SshHostMutationResponse> => {
      if (!window.electronAPI?.removeSshHost) {
        return {
          success: false,
          error: 'electronAPI.removeSshHost is unavailable',
        };
      }
      try {
        return await window.electronAPI.removeSshHost(name, scope);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: msg || tm('ops.ssh.removeFailed'),
        };
      }
    },
    []
  );
  const listGrievances = useCallback(
    async (options?: GrievancesListOptions): Promise<GrievancesListResponse> => {
      if (!window.electronAPI?.listGrievances) {
        return {
          success: false,
          error: 'electronAPI.listGrievances is unavailable',
        };
      }
      try {
        return await window.electronAPI.listGrievances(options);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: msg || 'Failed to list grievances',
        };
      }
    },
    []
  );
  const cleanGrievances = useCallback(
    async (options: GrievancesCleanOptions): Promise<GrievancesCleanResponse> => {
      if (!window.electronAPI?.cleanGrievances) {
        return {
          success: false,
          error: 'electronAPI.cleanGrievances is unavailable',
        };
      }
      try {
        return await window.electronAPI.cleanGrievances(options);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: msg || 'Failed to clean grievances',
        };
      }
    },
    []
  );
  const pushGrievances = useCallback(
    async (options?: { profile?: string | null }): Promise<GrievancesPushResponse> => {
      if (!window.electronAPI?.pushGrievances) {
        return {
          success: false,
          error: 'electronAPI.pushGrievances is unavailable',
        };
      }
      try {
        return await window.electronAPI.pushGrievances(options);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: msg || 'Failed to push grievances',
        };
      }
    },
    []
  );
  const changeApprovalMode = useCallback(
    async (mode: OmpApprovalMode): Promise<{ success: boolean; mode?: OmpApprovalMode; error?: string }> => {
      if (status !== 'idle') {
        const confirmed = window.confirm(tm('rpc.confirmChangeApprovalMode'));
        if (!confirmed) {
          return { success: false, error: 'User cancelled approval mode change' };
        }
      }

      if (window.electronAPI) {
        try {
          const res = await window.electronAPI.setApprovalMode(mode);
          if (res.success) {
            setApprovalMode(res.mode);
            await refreshEngineState();
            await refreshSessions();
            return res;
          }
          return res;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('[useOmpRpc] Failed to set approval mode:', err);
          return { success: false, error: msg };
        }
      } else {
        setApprovalMode(mode);
        return { success: true, mode };
      }
    },
    [status, refreshEngineState, refreshSessions]
  );

  const compact = useCallback(
    async (customInstructions?: string): Promise<{ success: boolean; error?: string }> => {
      if (status !== 'idle') {
        return { success: false, error: tm('rpc.compactBusyError') };
      }
      setIsCompacting(true);
      if (window.electronAPI) {
        try {
          const res = await window.electronAPI.compact(customInstructions);
          if (res.success) {
            await refreshEngineState();
          }
          return res;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return { success: false, error: msg };
        } finally {
          setIsCompacting(false);
        }
      } else {
        setIsCompacting(false);
        return { success: true };
      }
    },
    [status, refreshEngineState]
  );

  const setAutoCompaction = useCallback(
    async (enabled: boolean): Promise<{ success: boolean; error?: string }> => {
      if (window.electronAPI) {
        try {
          const res = await window.electronAPI.setAutoCompaction(enabled);
          if (res.success) {
            await refreshEngineState();
          }
          return res;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return { success: false, error: msg };
        }
      } else {
        setEngineState((prev) => (prev ? { ...prev, autoCompactionEnabled: enabled } : null));
        return { success: true };
      }
    },
    [refreshEngineState]
  );



  const abortRetry = useCallback(async (): Promise<boolean> => {
    setRetryState({ isRetrying: false });
    if (window.electronAPI?.abortRetry) {
      try {
        const res = await window.electronAPI.abortRetry();
        return res.success;
      } catch (err) {
        console.error('[useOmpRpc] Failed to abort retry:', err);
      }
    }
    return true;
  }, []);

  const setAutoRetry = useCallback(async (enabled: boolean): Promise<boolean> => {
    if (window.electronAPI?.setAutoRetry) {
      try {
        const res = await window.electronAPI.setAutoRetry(enabled);
        return res.success;
      } catch (err) {
        console.error('[useOmpRpc] Failed to set auto-retry:', err);
      }
    }
    return false;
  }, []);

  const setFastMode = useCallback(async (enabled: boolean): Promise<boolean> => {
    if (window.electronAPI?.setFastMode) {
      try {
        const res = await window.electronAPI.setFastMode(enabled);
        return res.success;
      } catch (err) {
        console.error('[useOmpRpc] Failed to set fast mode:', err);
      }
    }
    return false;
  }, []);

  const getLastAssistantText = useCallback(async (): Promise<string | null> => {
    if (window.electronAPI?.getLastAssistantText) {
      try {
        const res = await window.electronAPI.getLastAssistantText();
        if (res.success && typeof res.text === 'string' && res.text.trim()) {
          return res.text;
        }
      } catch (err) {
        console.warn('[useOmpRpc] getLastAssistantText failed, fallback to local message:', err);
      }
    }
    if (currentStreamText.trim()) {
      return currentStreamText;
    }
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && typeof messages[i].content === 'string' && messages[i].content.trim()) {
        return messages[i].content;
      }
    }
    return null;
  }, [currentStreamText, messages]);

  const handoff = useCallback(async (): Promise<{ success: boolean; data?: unknown; error?: string }> => {
    if (window.electronAPI?.handoff) {
      try {
        return await window.electronAPI.handoff();
      } catch (err: any) {
        return { success: false, error: err?.message || tm('rpc.handoffError') };
      }
    }
    return { success: false, error: tm('rpc.handoffEngineOnly') };
  }, []);

  const runCommitAssistant = useCallback(
    async (options: CommitRunOptions): Promise<{ success: boolean; error?: string }> => {
      if (window.electronAPI?.runCommit) {
        try {
          return await window.electronAPI.runCommit(options);
        } catch (err: any) {
          return { success: false, error: err?.message || tm('rpc.commitAssistantError') };
        }
      }
      return { success: false, error: tm('rpc.commitElectronOnly') };
    },
    []
  );

  const cancelCommitAssistant = useCallback(async (): Promise<{ success: boolean }> => {
    if (window.electronAPI?.cancelCommit) {
      try {
        return await window.electronAPI.cancelCommit();
      } catch {
        return { success: false };
      }
    }
    return { success: false };
  }, []);

  const runCleanse = useCallback(
    async (options: CleanseRunOptions): Promise<{ success: boolean; error?: string }> => {
      if (window.electronAPI?.runCleanse) {
        try {
          return await window.electronAPI.runCleanse(options);
        } catch (err: any) {
          return { success: false, error: err?.message || tm('rpc.cleanseRunnerError') };
        }
      }
      return { success: false, error: tm('rpc.cleanseRunnerElectronOnly') };
    },
    []
  );

  const cancelCleanse = useCallback(async (): Promise<{ success: boolean }> => {
    if (window.electronAPI?.cancelCleanse) {
      try {
        return await window.electronAPI.cancelCleanse();
      } catch {
        return { success: false };
      }
    }
    return { success: false };
  }, []);

  const checkCommitStatus = useCallback(
    async (cwd?: string): Promise<GitStatusResult> => {
      if (window.electronAPI?.getCommitStatus) {
        try {
          return await window.electronAPI.getCommitStatus(cwd);
        } catch (err: any) {
          return { isGit: false, isDirty: false, error: err?.message || tm('rpc.gitStatusError') };
        }
      }
      return { isGit: false, isDirty: false, error: tm('rpc.gitStatusElectronOnly') };
    },
    []
  );
  const installBrowserRelay = useCallback(
    async (options?: BrowserRelayInstallOptions): Promise<BrowserRelayInstallResult> => {
      if (window.electronAPI?.installBrowserRelay) {
        try {
          return await window.electronAPI.installBrowserRelay(options);
        } catch (err: any) {
          return { success: false, error: err?.message || tm('rpc.relayExtensionInstallError') };
        }
      }
      return { success: false, error: tm('rpc.electronOnly') };
    },
    []
  );

  const startBrowserRelay = useCallback(
    async (options?: BrowserRelayStartOptions): Promise<{ success: boolean; port?: number; url?: string; error?: string }> => {

      if (window.electronAPI?.startBrowserRelay) {
        try {
          return await window.electronAPI.startBrowserRelay(options);
        } catch (err: any) {
          return { success: false, error: err?.message || tm('rpc.relayStartError') };
        }
      }
      return { success: false, error: tm('rpc.electronOnly') };
    },
    []
  );

  const stopBrowserRelay = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (window.electronAPI?.stopBrowserRelay) {
      try {
        return await window.electronAPI.stopBrowserRelay();
      } catch (err: any) {
        return { success: false, error: err?.message || tm('rpc.relayStopError') };
      }
    }
    return { success: false, error: tm('rpc.electronOnly') };
  }, []);

  const getBrowserRelayStatus = useCallback(async (): Promise<BrowserRelayStatus> => {
    if (window.electronAPI?.getBrowserRelayStatus) {
      try {
        return await window.electronAPI.getBrowserRelayStatus();
      } catch (err: any) {
        return { running: false, source: 'none', detail: err?.message || tm('rpc.relayStatusError') };
      }
    }
    return { running: false, source: 'none', detail: tm('rpc.electronOnly') };
  }, []);
  const startSay = useCallback(
    async (text: string, options?: SayOptions): Promise<{ success: boolean; error?: string; missingModel?: boolean }> => {
      if (window.electronAPI?.startSay) {
        try {
          return await window.electronAPI.startSay(text, options);
        } catch (err: any) {
          return { success: false, error: err?.message || tm('rpc.startSayError') };
        }
      }
      return { success: false, error: tm('rpc.startSayUnavailable') };
    },
    []
  );

  const stopSay = useCallback(
    async (): Promise<{ success: boolean; error?: string }> => {
      if (window.electronAPI?.stopSay) {
        try {
          return await window.electronAPI.stopSay();
        } catch (err: any) {
          return { success: false, error: err?.message || tm('rpc.stopSayError') };
        }
      }
      return { success: false, error: tm('rpc.stopSayUnavailable') };
    },
    []
  );


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
    renameSession,
    deleteSession,
    exportSession,
    subagents,
    sendMessage,
    steer,
    abortAndPrompt,
    followUpQueue,
    followUp,
    abort,
    respondPermission,
    acceptDiff,
    rejectDiff,
    notifications,
    dismissNotification,
    pushNotification,
    clearNotifications,
    engineStatuses,
    engineWidgets,
    contextUsage,
    tokensPerSecond,
    getSessionStats,
    getGlobalUsage,
    getGlobalStats,
    getUsageHistory,
    getUsageClients,
    invalidateUsage,
    startStatsDashboard,
    stopStatsDashboard,
    getStatsDashboardStatus,
    openExternal,
    getEngineConfig,
    setEngineConfigValue,
    resetEngineConfigValue,
    getEngineConfigPath,
    runGc,
    runImages,
    listSshHosts,
    addSshHost,
    removeSshHost,
    listGrievances,
    cleanGrievances,
    pushGrievances,
    approvalMode,
    setApprovalMode: changeApprovalMode,
    changeApprovalMode,
    compact,
    isCompacting: isCompacting || Boolean(engineState?.isCompacting),
    autoCompactionEnabled: engineState?.autoCompactionEnabled ?? false,
    setAutoCompaction,
    availableCommands,
    refreshCommands,
    todoPhases,
    todos,
    setTodos: updateTodos,
    refreshTodos,
    retryState,
    abortRetry,
    setAutoRetry,
    setFastMode,
    getLastAssistantText,
    handoff,
    runCommitAssistant,
    cancelCommitAssistant,
    checkCommitStatus,
    runCleanse,
    cancelCleanse,
    installBrowserRelay,
    startBrowserRelay,
    stopBrowserRelay,
    getBrowserRelayStatus,
    isSpeaking,
    startSay,
    stopSay,
  };
}
