import type { ChatMessage } from '../types/index.ts';

// Dinh dang thoi luong (milliseconds) thanh chuoi hien thi than thien
export function formatDuration(ms: number | undefined | null): string {
  if (ms == null || typeof ms !== 'number' || isNaN(ms) || ms < 0) {
    return '--';
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

// Cap nhat bat bien thoi luong cho tin nhan assistant cu the theo ID
export function patchAssistantTurnDuration(
  messages: ChatMessage[],
  assistantId: string | null | undefined,
  durationMs: number,
  durationKind: 'measured' | 'estimated'
): ChatMessage[] {
  if (!assistantId || !Array.isArray(messages) || messages.length === 0) {
    return messages;
  }

  const targetIndex = messages.findIndex(
    (m) => m.id === assistantId && m.role === 'assistant'
  );

  if (targetIndex < 0) {
    return messages;
  }

  const updated = [...messages];
  updated[targetIndex] = {
    ...updated[targetIndex],
    durationMs,
    durationKind,
  };
  return updated;
}
