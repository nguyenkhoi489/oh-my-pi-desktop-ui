// Dieu phoi request tu OMP vao Claude Code shim voi real-time streaming va error handling
import crypto from "node:crypto";
import { CLAUDE_CODE_MODELS, resolveEffort } from "./models.ts";
import { buildPrompt, type OpenAiMessage } from "./prompt-builder.ts";
import { SessionMap } from "./session-map.ts";
import {
  runClaudeProcess,
  runClaudeStreamProcess,
  AuthError,
  QuotaError,
  TimeoutError,
  RunnerError,
  SessionNotFoundError,
  type RunnerOptions,
  type RunnerStreamOptions,
  type RunnerResult
} from "./claude-runner.ts";
import {
  buildChatCompletion,
  buildSseChunks,
  buildErrorResponse,
  type OpenAiToolCall,
  type SseChunkResponse
} from "./openai-shape.ts";

export interface ShimSettings {
  cwd: string;
  token: string;
  defaultEffort?: string;
  timeoutMs?: number;
  runner?: (options: RunnerOptions) => Promise<RunnerResult>;
  streamRunner?: (options: RunnerStreamOptions) => Promise<RunnerResult>;
}

export interface ShimStats {
  spawnCount: number;
  timeouts: number;
  lastSpawnAt?: string;
  lastError?: string;
}

export interface RequestHandlerContext {
  handle: (req: Request) => Promise<Response>;
  stats: ShimStats;
  sessionMap: SessionMap;
}

// Chuan hoa ten model bo prefix provider neu co
function normalizeModelId(rawModel: unknown): string {
  if (typeof rawModel !== "string") return "fable";
  const parts = rawModel.split("/");
  const base = parts[parts.length - 1];
  return base || "fable";
}

// Khoi tao bo xu ly request chat completion
export function createRequestHandler(settings: ShimSettings): RequestHandlerContext {
  const stats: ShimStats = {
    spawnCount: 0,
    timeouts: 0
  };

  const sessionMap = new SessionMap();
  const runnerFn = settings.runner || runClaudeProcess;
  const streamRunnerFn =
    settings.streamRunner ||
    (settings.runner
      ? async (opts: RunnerStreamOptions) => settings.runner!(opts)
      : runClaudeStreamProcess);

  async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type"
        }
      });
    }

    const authHeader = req.headers.get("Authorization");
    const validTokens = new Set([settings.token, "claude-code"]);
    const tokenMatch = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!tokenMatch || !validTokens.has(tokenMatch)) {
      return buildErrorResponse(401, "Unauthorized: invalid bearer token", "authentication_error");
    }

    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/v1/models") {
      return new Response(
        JSON.stringify({
          object: "list",
          data: CLAUDE_CODE_MODELS
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
      let body: Record<string, unknown> = {};
      try {
        body = (await req.json()) as Record<string, unknown>;
      } catch {
        return buildErrorResponse(400, "Invalid JSON body", "invalid_request_error");
      }

      const messages = (Array.isArray(body.messages) ? body.messages : []) as OpenAiMessage[];
      const rawModel = body.model;
      const model = normalizeModelId(rawModel);
      const isStream = body.stream === true;
      const effort = resolveEffort(body.reasoning_effort, settings.defaultEffort);
      const rawTools = Array.isArray(body.tools)
        ? (body.tools as Array<{ type?: string; function?: { name?: string } }>)
        : [];
      const hasAdviseTool = rawTools.some(t => t.function?.name === "advise");
      const hasOtherTools = rawTools.some(t => t.function?.name && t.function.name !== "advise");
      const hasAdviseInMessages = messages.some(m => {
        const rec = m as Record<string, unknown>;
        if (!Array.isArray(rec.tool_calls)) return false;
        return rec.tool_calls.some(tc => {
          const callObj = tc as Record<string, unknown>;
          const fnObj = callObj.function as Record<string, unknown> | undefined;
          return fnObj?.name === "advise";
        });
      });
      const isExplicitGeneral = body.mode === "general" || (hasOtherTools && !hasAdviseTool);
      const isAdvisorMode = !isExplicitGeneral && (hasAdviseTool || hasAdviseInMessages || rawTools.length === 0);
      const runnerMode: "advisor" | "general" = isAdvisorMode ? "advisor" : "general";
      const fullPromptInfo = buildPrompt(messages);
      const completionId = `chatcmpl-${crypto.randomUUID()}`;

      // Chi early stop o advisor mode khi message cuoi la ket qua tool
      if (isAdvisorMode && fullPromptInfo.isToolResultOnly) {
        const convKey = sessionMap.computeKey(fullPromptInfo.systemPrompt, messages);
        sessionMap.markSeen(convKey, messages);

        if (isStream) {
          const chunks = buildSseChunks({ id: completionId, model, text: "" });
          return new Response(chunks.join(""), {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive"
            }
          });
        }
        return new Response(
          JSON.stringify(buildChatCompletion({ id: completionId, model, text: "" })),
          {
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Cho request truoc do hoan tat roi moi chon mode new hoac resume tu SessionMap
      const convKey = sessionMap.computeKey(fullPromptInfo.systemPrompt, messages);
      const releaseLock = await sessionMap.acquireLock(convKey);
      const sessionPick = sessionMap.pick(convKey, messages);

      stats.spawnCount++;
      stats.lastSpawnAt = new Date().toISOString();

      const runPromptInfo =
        sessionPick.mode === "resume"
          ? buildPrompt(sessionPick.deltaMessages)
          : fullPromptInfo;

      const runnerOptions: RunnerStreamOptions = {
        cwd: settings.cwd,
        model,
        prompt: runPromptInfo.prompt,
        systemPrompt: runPromptInfo.systemPrompt,
        effort,
        timeoutMs: settings.timeoutMs,
        sessionId: sessionPick.mode === "new" ? sessionPick.sessionId : undefined,
        resumeId: sessionPick.mode === "resume" ? sessionPick.sessionId : undefined,
        mode: runnerMode
      };

      if (isStream) {
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();
        const responseGate = Promise.withResolvers<Response>();
        let headersSent = false;

        const openStreamWithChunk = (chunkStr: string) => {
          if (!headersSent) {
            headersSent = true;
            responseGate.resolve(
              new Response(readable, {
                status: 200,
                headers: {
                  "Content-Type": "text/event-stream",
                  "Cache-Control": "no-cache",
                  Connection: "keep-alive"
                }
              })
            );
          }
          void writer.write(encoder.encode(chunkStr));
        };

        runnerOptions.onTextDelta = (deltaText: string) => {
          const chunk: SseChunkResponse = {
            id: completionId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                index: 0,
                delta: { role: "assistant", content: deltaText },
                finish_reason: null
              }
            ]
          };
          openStreamWithChunk(`data: ${JSON.stringify(chunk)}\n\n`);
        };

        // Chay runner ngam va stream du lieu
        (async () => {
          try {
            let streamResult: RunnerResult;
            try {
              streamResult = await streamRunnerFn(runnerOptions);
            } catch (firstErr: unknown) {
              if (firstErr instanceof SessionNotFoundError && sessionPick.mode === "resume") {
                sessionMap.invalidate(sessionPick.key);
                runnerOptions.resumeId = undefined;
                runnerOptions.sessionId = sessionPick.sessionId;
                runnerOptions.prompt = fullPromptInfo.prompt;
                runnerOptions.systemPrompt = fullPromptInfo.systemPrompt;
                streamResult = await streamRunnerFn(runnerOptions);
              } else {
                throw firstErr;
              }
            }

            let toolCall: OpenAiToolCall | undefined;
            if (isAdvisorMode) {
              const severity = streamResult.structuredOutput.severity;
              if (severity !== "none") {
                toolCall = {
                  id: `call_${crypto.randomUUID().replace(/-/g, "")}`,
                  type: "function",
                  function: {
                    name: "advise",
                    arguments: JSON.stringify({
                      severity,
                      note: streamResult.structuredOutput.note
                    })
                  }
                };
              }
            }
            if (headersSent) {
              // Header da gui: phat them tool_call (neu co), chunk cuoi va DONE
              if (toolCall) {
                const toolChunk: SseChunkResponse = {
                  id: completionId,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: {
                        role: "assistant",
                        tool_calls: [
                          {
                            index: 0,
                            id: toolCall.id,
                            type: "function",
                            function: toolCall.function
                          }
                        ]
                      },
                      finish_reason: null
                    }
                  ]
                };
                await writer.write(encoder.encode(`data: ${JSON.stringify(toolChunk)}\n\n`));
              }

              const finalChunk: SseChunkResponse = {
                id: completionId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [
                  {
                    index: 0,
                    delta: {},
                    finish_reason: toolCall ? "tool_calls" : "stop"
                  }
                ]
              };
              await writer.write(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
              await writer.write(encoder.encode("data: [DONE]\n\n"));
            } else {
              // Khong co delta nao duoc phat: tao toan bo chunk va mo response
              const textOutput = isAdvisorMode
                ? (toolCall ? undefined : "")
                : (streamResult.textResponse ?? "");
              const chunks = buildSseChunks({
                id: completionId,
                model,
                toolCall,
                text: textOutput
              });
              headersSent = true;
              responseGate.resolve(
                new Response(chunks.join(""), {
                  status: 200,
                  headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive"
                  }
                })
              );
            }

            sessionMap.commit(
              sessionPick.key,
              streamResult.sessionId || sessionPick.sessionId,
              messages
            );
          } catch (err: unknown) {
            if (!headersSent) {
              // Chua gui header: tra ma loi HTTP that de OMP nhan dien (401/429/502)
              if (err instanceof TimeoutError) {
                stats.timeouts++;
                stats.lastError = err.message;
                const chunks = buildSseChunks({ id: completionId, model, text: "" });
                responseGate.resolve(
                  new Response(chunks.join(""), {
                    status: 200,
                    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
                  })
                );
              } else if (err instanceof AuthError) {
                stats.lastError = err.message;
                responseGate.resolve(buildErrorResponse(401, err.message, "authentication_error"));
              } else if (err instanceof QuotaError) {
                stats.lastError = err.message;
                responseGate.resolve(buildErrorResponse(429, err.message, "rate_limit_error"));
              } else {
                const msg = err instanceof Error ? err.message : String(err);
                stats.lastError = msg;
                responseGate.resolve(buildErrorResponse(502, `Claude runner error: ${msg}`, "api_error"));
              }
            } else {
              // Header da gui
              if (err instanceof TimeoutError) {
                stats.timeouts++;
                stats.lastError = err.message;
                const finishChunk: SseChunkResponse = {
                  id: completionId,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: {},
                      finish_reason: "stop"
                    }
                  ]
                };
                await writer.write(encoder.encode(`data: ${JSON.stringify(finishChunk)}\n\n`));
                await writer.write(encoder.encode("data: [DONE]\n\n"));
              } else {
                const msg = err instanceof Error ? err.message : String(err);
                stats.lastError = msg;
                const errChunk = `data: {"error":{"message":${JSON.stringify(msg)},"type":"api_error"}}\n\n`;
                await writer.write(encoder.encode(errChunk));
                await writer.write(encoder.encode("data: [DONE]\n\n"));
              }
            }
          } finally {
            try {
              await writer.close();
            } catch {
              // Bo qua neu da dong
            }
            releaseLock();
          }
        })();

        return responseGate.promise;
      }

      // Non-streaming flow
      try {
        let runnerResult: RunnerResult;
        try {
          try {
            runnerResult = await runnerFn(runnerOptions);
          } catch (firstErr: unknown) {
            if (firstErr instanceof SessionNotFoundError && sessionPick.mode === "resume") {
              sessionMap.invalidate(sessionPick.key);
              runnerOptions.resumeId = undefined;
              runnerOptions.sessionId = sessionPick.sessionId;
              runnerOptions.prompt = fullPromptInfo.prompt;
              runnerOptions.systemPrompt = fullPromptInfo.systemPrompt;
              runnerResult = await runnerFn(runnerOptions);
            } else {
              throw firstErr;
            }
          }
        } catch (err: unknown) {
          if (err instanceof TimeoutError) {
            stats.timeouts++;
            stats.lastError = err.message;
            return new Response(
              JSON.stringify(buildChatCompletion({ id: completionId, model, text: "" })),
              {
                headers: { "Content-Type": "application/json" }
              }
            );
          }

          if (err instanceof AuthError) {
            stats.lastError = err.message;
            return buildErrorResponse(401, err.message, "authentication_error");
          }

          if (err instanceof QuotaError) {
            stats.lastError = err.message;
            return buildErrorResponse(429, err.message, "rate_limit_error");
          }

          const msg = err instanceof Error ? err.message : String(err);
          stats.lastError = msg;
          return buildErrorResponse(502, `Claude runner error: ${msg}`, "api_error");
        }

        sessionMap.commit(
          sessionPick.key,
          runnerResult.sessionId || sessionPick.sessionId,
          messages
        );

        let toolCall: OpenAiToolCall | undefined;
        if (isAdvisorMode) {
          const severity = runnerResult.structuredOutput.severity;
          if (severity !== "none") {
            toolCall = {
              id: `call_${crypto.randomUUID().replace(/-/g, "")}`,
              type: "function",
              function: {
                name: "advise",
                arguments: JSON.stringify({
                  severity,
                  note: runnerResult.structuredOutput.note
                })
              }
            };
          }
        }

        const textOutput = isAdvisorMode
          ? (toolCall ? undefined : "")
          : (runnerResult.textResponse ?? "");

        return new Response(
          JSON.stringify(
            buildChatCompletion({
              id: completionId,
              model,
              toolCall,
              text: textOutput,
              usage: runnerResult.usage
            })
          ),
          {
            headers: { "Content-Type": "application/json" }
          }
        );
      } finally {
        releaseLock();
      }
    }

    return buildErrorResponse(404, "Endpoint not found", "invalid_request_error");
  }

  return { handle, stats, sessionMap };
}
