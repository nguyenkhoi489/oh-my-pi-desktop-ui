import type {
  ChatMessage,
  ThinkingBlock,
  ToolCall,
  FileDiffItem,
  OmpAgentStatus,
  OmpEventEnvelope,
} from '../types/index.ts';

export interface RuntimeSessionData {
  runtimeId: string;
  projectId: string;
  sessionPath?: string;
  status: OmpAgentStatus;
  attention: boolean;
  messages: ChatMessage[];
  currentThinking: ThinkingBlock | null;
  activeToolCalls: ToolCall[];
  currentStreamText: string;
  activeDiff: FileDiffItem | null;
  lastActiveAt: number;
}

export interface ActiveStateSnapshot {
  messages: ChatMessage[];
  currentThinking: ThinkingBlock | null;
  activeToolCalls: ToolCall[];
  currentStreamText: string;
  activeDiff: FileDiffItem | null;
  status: OmpAgentStatus;
}

// Khoi tao session state mac dinh cho mot runtime
export function createEmptyRuntimeSession(
  runtimeId: string,
  projectId: string = 'default',
  sessionPath?: string
): RuntimeSessionData {
  return {
    runtimeId,
    projectId,
    sessionPath,
    status: 'idle',
    attention: false,
    messages: [],
    currentThinking: null,
    activeToolCalls: [],
    currentStreamText: '',
    activeDiff: null,
    lastActiveAt: Date.now(),
  };
}

// Xu ly envelope su kien tu cac runtime chay song song
export function handleRuntimeEnvelope(
  prevMap: Record<string, RuntimeSessionData>,
  envelope: OmpEventEnvelope,
  activeRuntimeId: string | null
): Record<string, RuntimeSessionData> {
  const { runtimeId, projectId, sessionPath, channel, payload } = envelope;
  // Neu chua co activeRuntimeId nao duoc chi dinh, coi runtime dau tien xuat hien la active
  const effectiveActiveId = activeRuntimeId ?? (Object.keys(prevMap).length > 0 ? Object.keys(prevMap)[0] : runtimeId);
  const isBackground = runtimeId !== effectiveActiveId;

  const current = prevMap[runtimeId] || createEmptyRuntimeSession(runtimeId, projectId, sessionPath);
  const updated: RuntimeSessionData = {
    ...current,
    messages: [...current.messages],
    activeToolCalls: [...current.activeToolCalls],
  };

  if (sessionPath && current.sessionPath !== sessionPath) {
    updated.sessionPath = sessionPath;
  }
  updated.lastActiveAt = Date.now();

  if (channel === 'omp:status-change' || channel === 'omp:status') {
    const newStatus = payload as OmpAgentStatus;
    const wasBusy = current.status === 'thinking' || current.status === 'streaming' || current.status === 'executing_tool';
    if (isBackground && wasBusy && newStatus === 'idle') {
      updated.attention = true;
    }
    updated.status = newStatus;
  }

  // Tich luy stream va tool cho cac session chay ngam ma khong nhan duplicate active event
  if (isBackground) {
    if (channel === 'omp:stream-token') {
      let token = '';
      if (typeof payload === 'string') {
        token = payload;
      } else if (payload && typeof payload === 'object' && 'token' in payload && typeof payload.token === 'string') {
        token = payload.token;
      }
      updated.currentStreamText = (updated.currentStreamText || '') + token;
    } else if (channel === 'omp:thinking') {
      updated.currentThinking = payload as ThinkingBlock;
    } else if (channel === 'omp:tool-call') {
      const toolCall = payload as ToolCall;
      const existingIdx = updated.activeToolCalls.findIndex((t) => t.id === toolCall.id);
      if (existingIdx >= 0) {
        updated.activeToolCalls[existingIdx] = toolCall;
      } else {
        updated.activeToolCalls.push(toolCall);
      }
    } else if (channel === 'omp:message-complete') {
      const msg = payload as ChatMessage;
      updated.messages.push(msg);
      updated.currentStreamText = '';
      updated.currentThinking = null;
      updated.activeToolCalls = [];
    } else if (channel === 'omp:diff-generated') {
      updated.activeDiff = payload as FileDiffItem;
    }
  }

  return {
    ...prevMap,
    [runtimeId]: updated,
  };
}

// Luu trang thai active vao session map truoc khi switch
export function saveActiveSessionToMap(
  map: Record<string, RuntimeSessionData>,
  activeRuntimeId: string | null,
  activeState: ActiveStateSnapshot
): Record<string, RuntimeSessionData> {
  if (!activeRuntimeId) return map;
  const current = map[activeRuntimeId] || createEmptyRuntimeSession(activeRuntimeId);
  return {
    ...map,
    [activeRuntimeId]: {
      ...current,
      messages: [...activeState.messages],
      currentThinking: activeState.currentThinking,
      activeToolCalls: [...activeState.activeToolCalls],
      currentStreamText: activeState.currentStreamText,
      activeDiff: activeState.activeDiff,
      status: activeState.status,
      lastActiveAt: Date.now(),
    },
  };
}

// Phuc hoi toan bo noi dung session khi nguoi dung chuyen ve runtime tuong ung
export function restoreSessionFromMap(
  map: Record<string, RuntimeSessionData>,
  targetRuntimeId: string
): ActiveStateSnapshot {
  const target = map[targetRuntimeId];
  if (!target) {
    return {
      messages: [],
      currentThinking: null,
      activeToolCalls: [],
      currentStreamText: '',
      activeDiff: null,
      status: 'idle',
    };
  }
  return {
    messages: [...target.messages],
    currentThinking: target.currentThinking,
    activeToolCalls: [...target.activeToolCalls],
    currentStreamText: target.currentStreamText,
    activeDiff: target.activeDiff,
    status: target.status,
  };
}
