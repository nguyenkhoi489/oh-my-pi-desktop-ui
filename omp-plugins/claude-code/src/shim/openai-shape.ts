// Dinh dang du lieu theo chuan OpenAI Chat Completion va SSE
import type { RunnerUsage } from "./claude-runner.ts";

export interface OpenAiToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionChoice {
  index: number;
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: OpenAiToolCall[];
  };
  finish_reason: "stop" | "tool_calls";
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface SseChunkChoice {
  index: number;
  delta: {
    role?: "assistant";
    content?: string;
    tool_calls?: Array<{
      index: number;
      id?: string;
      type?: "function";
      function?: {
        name?: string;
        arguments?: string;
      };
    }>;
  };
  finish_reason: "stop" | "tool_calls" | null;
}

export interface SseChunkResponse {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: SseChunkChoice[];
}

// Xay dung response JSON cho non-streaming chat completion
export function buildChatCompletion(options: {
  id: string;
  model: string;
  toolCall?: OpenAiToolCall;
  text?: string;
  usage?: RunnerUsage;
}): ChatCompletionResponse {
  const isTool = Boolean(options.toolCall);
  return {
    id: options.id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: options.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: isTool ? null : (options.text ?? ""),
          ...(options.toolCall ? { tool_calls: [options.toolCall] } : {})
        },
        finish_reason: isTool ? "tool_calls" : "stop"
      }
    ],
    usage: {
      prompt_tokens: options.usage?.input_tokens ?? 0,
      completion_tokens: options.usage?.output_tokens ?? 0,
      total_tokens:
        options.usage?.total_tokens ??
        (options.usage?.input_tokens ?? 0) + (options.usage?.output_tokens ?? 0)
    }
  };
}

// Tao chuoi cac SSE chunk cho streaming
export function buildSseChunks(options: {
  id: string;
  model: string;
  toolCall?: OpenAiToolCall;
  text?: string;
}): string[] {
  const created = Math.floor(Date.now() / 1000);
  const chunks: string[] = [];

  if (options.toolCall) {
    const chunk1: SseChunkResponse = {
      id: options.id,
      object: "chat.completion.chunk",
      created,
      model: options.model,
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: options.toolCall.id,
                type: "function",
                function: {
                  name: options.toolCall.function.name,
                  arguments: options.toolCall.function.arguments
                }
              }
            ]
          },
          finish_reason: null
        }
      ]
    };
    const chunk2: SseChunkResponse = {
      id: options.id,
      object: "chat.completion.chunk",
      created,
      model: options.model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: "tool_calls"
        }
      ]
    };
    chunks.push(`data: ${JSON.stringify(chunk1)}\n\n`);
    chunks.push(`data: ${JSON.stringify(chunk2)}\n\n`);
  } else {
    const chunk1: SseChunkResponse = {
      id: options.id,
      object: "chat.completion.chunk",
      created,
      model: options.model,
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant",
            content: options.text ?? ""
          },
          finish_reason: null
        }
      ]
    };
    const chunk2: SseChunkResponse = {
      id: options.id,
      object: "chat.completion.chunk",
      created,
      model: options.model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: "stop"
        }
      ]
    };
    chunks.push(`data: ${JSON.stringify(chunk1)}\n\n`);
    chunks.push(`data: ${JSON.stringify(chunk2)}\n\n`);
  }

  chunks.push("data: [DONE]\n\n");
  return chunks;
}

// Xay dung response error format OpenAI
export function buildErrorResponse(
  status: number,
  message: string,
  type = "invalid_request_error"
): Response {
  return new Response(
    JSON.stringify({
      error: {
        message,
        type,
        code: status
      }
    }),
    {
      status,
      headers: { "Content-Type": "application/json" }
    }
  );
}
