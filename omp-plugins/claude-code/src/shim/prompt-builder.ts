// Chuyen doi danh sach messages cua OpenAI thanh prompt cho Claude Code
export interface OpenAiContentPart {
  type: string;
  text?: string;
}

export interface OpenAiMessage {
  role: string;
  content?: string | OpenAiContentPart[] | null;
  tool_call_id?: string;
}

export interface BuiltPrompt {
  systemPrompt: string;
  prompt: string;
  isToolResultOnly: boolean;
}

const MAX_PROMPT_CHARS = 200000;

function extractTextContent(content: string | OpenAiContentPart[] | null | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part): part is OpenAiContentPart => Boolean(part && typeof part.text === "string"))
      .map(part => part.text)
      .join("\n");
  }
  return "";
}

// Xay dung system prompt va body prompt tu danh sach hoi thoai
export function buildPrompt(messages: OpenAiMessage[]): BuiltPrompt {
  if (!messages || messages.length === 0) {
    return { systemPrompt: "", prompt: "", isToolResultOnly: false };
  }

  const lastMsg = messages[messages.length - 1];
  const isToolResultOnly = lastMsg.role === "tool";

  const systemParts: string[] = [];
  const conversationParts: string[] = [];

  for (const msg of messages) {
    const text = extractTextContent(msg.content).trim();
    if (!text && msg.role !== "tool") continue;

    if (msg.role === "system" || msg.role === "developer") {
      systemParts.push(text);
    } else {
      const roleTag = msg.role.toUpperCase();
      conversationParts.push(`[${roleTag}]:\n${text}`);
    }
  }

  let prompt = conversationParts.join("\n\n");
  if (prompt.length > MAX_PROMPT_CHARS) {
    prompt = "[...truncated earlier context...]\n" + prompt.slice(-MAX_PROMPT_CHARS);
  }

  return {
    systemPrompt: systemParts.join("\n\n"),
    prompt,
    isToolResultOnly
  };
}
