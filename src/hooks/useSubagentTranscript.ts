import { useState, useEffect, useRef, useCallback } from 'react';
import { ChatMessage, OmpSubagentInfo } from '../types';

export interface UseSubagentTranscriptOptions {
  subagent: OmpSubagentInfo | null;
  isOpen: boolean;
  pollIntervalMs?: number;
}

export interface UseSubagentTranscriptReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  isTailing: boolean;
  error: string | null;
  sessionFile: string | null;
  fromByte: number;
  refresh: () => Promise<void>;
  clear: () => void;
}

export function useSubagentTranscript({
  subagent,
  isOpen,
  pollIntervalMs = 1500,
}: UseSubagentTranscriptOptions): UseSubagentTranscriptReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionFile, setSessionFile] = useState<string | null>(null);
  const [fromByte, setFromByte] = useState<number>(0);

  const subagentId = subagent?.id;
  const subagentStatus = subagent?.status;
  const initialSessionFile = subagent?.sessionFile;
  const isRunning = subagentStatus === 'running' || subagentStatus === 'started';

  const fromByteRef = useRef<number>(0);
  const isFetchingRef = useRef<boolean>(false);
  const activeSubagentIdRef = useRef<string | undefined>(subagentId);

  fromByteRef.current = fromByte;
  activeSubagentIdRef.current = subagentId;

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
    setSessionFile(null);
    setFromByte(0);
    fromByteRef.current = 0;
  }, []);

  const fetchTranscript = useCallback(
    async (isInitial = false) => {
      if (!isOpen || !subagentId) return;
      if (isFetchingRef.current) return;

      isFetchingRef.current = true;
      if (isInitial) {
        setIsLoading(true);
      }

      try {
        const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
        if (!electronAPI?.getSubagentMessages) {
          // Trình duyệt không có Electron API
          if (isInitial) {
            setMessages([]);
            setError(null);
          }
          return;
        }

        const currentByte = fromByteRef.current;
        const res = await electronAPI.getSubagentMessages({
          subagentId,
          sessionFile: sessionFile || initialSessionFile,
          fromByte: currentByte,
        });

        // Bỏ qua kết quả nếu subagent đã thay đổi trong lúc fetch
        if (activeSubagentIdRef.current !== subagentId) {
          return;
        }

        if (res.success && res.data) {
          const incomingMessages = res.data.messages || [];
          const nextByte = typeof res.data.nextByte === 'number' ? res.data.nextByte : currentByte;
          const wasReset = Boolean(res.data.reset);

          if (res.data.sessionFile) {
            setSessionFile(res.data.sessionFile);
          }

          if (wasReset) {
            setMessages(incomingMessages);
          } else if (incomingMessages.length > 0) {
            setMessages((prev) => {
              if (currentByte === 0) {
                return incomingMessages;
              }
              const existingIds = new Set(prev.map((m) => m.id));
              const fresh = incomingMessages.filter((m) => !existingIds.has(m.id));
              return fresh.length > 0 ? [...prev, ...fresh] : prev;
            });
          }

          setFromByte(nextByte);
          fromByteRef.current = nextByte;
          setError(null);
        } else if (!res.success) {
          // Lưu error nếu chưa có message nào
          if (fromByteRef.current === 0) {
            setError(res.error || 'Không thể tải transcript của subagent');
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (fromByteRef.current === 0) {
          setError(msg);
        }
      } finally {
        isFetchingRef.current = false;
        if (isInitial) {
          setIsLoading(false);
        }
      }
    },
    [isOpen, subagentId, sessionFile, initialSessionFile]
  );

  // Khi mở drawer hoặc đổi subagent -> reset và fetch trang đầu
  useEffect(() => {
    if (isOpen && subagentId) {
      setMessages([]);
      setError(null);
      setSessionFile(initialSessionFile || null);
      setFromByte(0);
      fromByteRef.current = 0;
      fetchTranscript(true);
    } else if (!isOpen) {
      clear();
    }
  }, [isOpen, subagentId, initialSessionFile, fetchTranscript, clear]);

  // Polling tail khi subagent đang chạy và drawer đang mở
  useEffect(() => {
    if (!isOpen || !subagentId || !isRunning) {
      return;
    }

    const interval = setInterval(() => {
      fetchTranscript(false);
    }, pollIntervalMs);

    return () => {
      clearInterval(interval);
    };
  }, [isOpen, subagentId, isRunning, pollIntervalMs, fetchTranscript]);

  const refresh = useCallback(async () => {
    await fetchTranscript(messages.length === 0);
  }, [fetchTranscript, messages.length]);

  return {
    messages,
    isLoading,
    isTailing: isOpen && isRunning,
    error,
    sessionFile,
    fromByte,
    refresh,
    clear,
  };
}
