// Quan ly mapping va luu giu session continuity cho Claude Code advisor
import crypto from "node:crypto";
import type { OpenAiMessage } from "./prompt-builder.ts";

export interface SessionEntry {
  sessionId: string;
  seenMessages: number;
  prefixHash: string;
  lastUsedAt: number;
}

export interface PickSessionResult {
  mode: "new" | "resume";
  sessionId: string;
  deltaMessages: OpenAiMessage[];
  key: string;
}

const MAX_SESSIONS = 32;

function computeHash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function serializeMessage(msg: OpenAiMessage): string {
  const contentStr = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
  return `${msg.role}:${contentStr}:${msg.tool_call_id || ""}`;
}

function computeMessagesHash(messages: OpenAiMessage[]): string {
  return computeHash(messages.map(serializeMessage).join("\n"));
}

export class SessionMap {
  private sessions = new Map<string, SessionEntry>();
  private inFlightMap = new Map<string, Promise<unknown>>();

  // Tao key dinh danh cuoc hoi thoai tu system prompt va message user dau tien
  computeKey(systemPrompt: string, messages: OpenAiMessage[]): string {
    const firstUser = messages.find(m => m.role === "user");
    const firstUserText = firstUser ? serializeMessage(firstUser) : "";
    return computeHash(`${systemPrompt}\n---\n${firstUserText}`);
  }

  // Cho request truoc do cung key hoan tat de tranh spawn song song
  async acquireLock(key: string): Promise<() => void> {
    while (this.inFlightMap.has(key)) {
      const pending = this.inFlightMap.get(key);
      if (pending) {
        try {
          await pending;
        } catch {
          // Bo qua loi tu request truoc
        }
      }
    }

    const { promise, resolve } = Promise.withResolvers<void>();
    this.inFlightMap.set(key, promise);

    return () => {
      this.inFlightMap.delete(key);
      resolve();
    };
  }
  // Chon mode new hoac resume dua tren lich su messages
  pick(keyOrSystem: string, messages: OpenAiMessage[]): PickSessionResult {
    const key = /^[0-9a-f]{64}$/i.test(keyOrSystem)
      ? keyOrSystem
      : this.computeKey(keyOrSystem, messages);

    const existing = this.sessions.get(key);

    if (existing && messages.length > existing.seenMessages) {
      const currentPrefixHash = computeMessagesHash(messages.slice(0, existing.seenMessages));
      if (currentPrefixHash === existing.prefixHash) {
        return {
          mode: "resume",
          sessionId: existing.sessionId,
          deltaMessages: messages.slice(existing.seenMessages),
          key
        };
      }
    }

    const newSessionId = crypto.randomUUID();
    return {
      mode: "new",
      sessionId: newSessionId,
      deltaMessages: messages,
      key
    };
  }

  // Cap nhat so luong messages da ghi nhan ngay ca khi chi nhan tool result (khong spawn runner)
  markSeen(key: string, allMessages: OpenAiMessage[]): void {
    const existing = this.sessions.get(key);
    if (existing) {
      existing.seenMessages = allMessages.length;
      existing.prefixHash = computeMessagesHash(allMessages);
      existing.lastUsedAt = Date.now();
    }
  }

  // Cap nhat so luong messages da ghi nhan sau khi goi claude thanh cong
  commit(key: string, sessionId: string, allMessages: OpenAiMessage[]): void {
    const prefixHash = computeMessagesHash(allMessages);
    this.sessions.set(key, {
      sessionId,
      seenMessages: allMessages.length,
      prefixHash,
      lastUsedAt: Date.now()
    });

    // Thu don LRU neu vuot qua gioi han 32 session
    if (this.sessions.size > MAX_SESSIONS) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [k, v] of this.sessions.entries()) {
        if (v.lastUsedAt < oldestTime) {
          oldestTime = v.lastUsedAt;
          oldestKey = k;
        }
      }

      if (oldestKey) {
        this.sessions.delete(oldestKey);
      }
    }
  }

  // Xoa mot session khi claude bao session khong ton tai
  invalidate(key: string): void {
    this.sessions.delete(key);
  }

  // Xoa toan bo session (khi OMP reset advisor)
  reset(): void {
    this.sessions.clear();
  }

  // So luong session hien tai dang luu
  size(): number {
    return this.sessions.size;
  }
}
