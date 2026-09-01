import { useState, useEffect, useCallback } from 'react';
import {
  OmpAgentStatus,
  ChatMessage,
  ThinkingBlock,
  ToolCall,
  FileDiffItem,
  PermissionRequest,
  OmpInstallStatus,
} from '../types';
import { DEMO_MESSAGES, DEMO_INITIAL_DIFF } from '../mock/demoData';

export function useOmpRpc() {
  const [status, setStatus] = useState<OmpAgentStatus>('idle');
  const [installStatus, setInstallStatus] = useState<OmpInstallStatus | null>(null);
  const [isCheckingInstall, setIsCheckingInstall] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>(DEMO_MESSAGES);
  const [currentThinking, setCurrentThinking] = useState<ThinkingBlock | null>(null);
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCall[]>([]);
  const [currentStreamText, setCurrentStreamText] = useState<string>('');
  const [activeDiff, setActiveDiff] = useState<FileDiffItem | null>(DEMO_INITIAL_DIFF);
  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('Claude 3.7 Sonnet (OMP Default)');

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

  // Check installation immediately on launch
  useEffect(() => {
    checkInstallation();
  }, [checkInstallation]);

  // Connect to Electron IPC listeners
  useEffect(() => {
    if (!window.electronAPI) {
      console.log('Running in browser preview mode (Electron API unavailable)');
      return;
    }

    const unsubStatus = window.electronAPI.onOmpStatusChange((newStatus) => {
      setStatus(newStatus);
    });

    const unsubToken = window.electronAPI.onOmpStreamToken((token) => {
      setCurrentStreamText((prev) => prev + token);
    });

    const unsubThinking = window.electronAPI.onOmpThinking((thinking) => {
      setCurrentThinking(thinking);
    });

    const unsubTool = window.electronAPI.onOmpToolCall((toolCall) => {
      setActiveToolCalls((prev) => {
        const index = prev.findIndex((t) => t.id === toolCall.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = toolCall;
          return updated;
        }
        return [...prev, toolCall];
      });
    });

    const unsubDiff = window.electronAPI.onOmpDiffGenerated((diff) => {
      setActiveDiff(diff);
    });

    const unsubPermission = window.electronAPI.onOmpPermissionRequest((req) => {
      setPendingPermission(req);
    });

    const unsubComplete = window.electronAPI.onOmpMessageComplete((msg) => {
      setMessages((prev) => [...prev, msg]);
      setCurrentStreamText('');
      setCurrentThinking(null);
      setActiveToolCalls([]);
    });

    return () => {
      unsubStatus();
      unsubToken();
      unsubThinking();
      unsubTool();
      unsubDiff();
      unsubPermission();
      unsubComplete();
    };
  }, []);

  const sendMessage = useCallback(
    async (prompt: string, contextFiles?: string[]) => {
      if (!prompt.trim()) return;

      const userMsg: ChatMessage = {
        id: 'msg-' + Date.now(),
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setCurrentStreamText('');
      setCurrentThinking(null);
      setActiveToolCalls([]);

      if (window.electronAPI) {
        await window.electronAPI.sendOmpMessage(prompt, { files: contextFiles });
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
          setActiveToolCalls([mockTool]);

          setTimeout(() => {
            mockTool.status = 'completed';
            mockTool.endTime = Date.now();
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
                  },
                ]);
                setCurrentStreamText('');
                setCurrentThinking(null);
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
      await window.electronAPI.saveFile(activeDiff.filePath, activeDiff.modifiedContent);
    }
    setActiveDiff((prev) => (prev ? { ...prev, status: 'accepted' } : null));
  }, [activeDiff]);

  const rejectDiff = useCallback(() => {
    setActiveDiff((prev) => (prev ? { ...prev, status: 'rejected' } : null));
  }, []);

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
    selectedModel,
    setSelectedModel,
    sendMessage,
    respondPermission,
    acceptDiff,
    rejectDiff,
  };
}
