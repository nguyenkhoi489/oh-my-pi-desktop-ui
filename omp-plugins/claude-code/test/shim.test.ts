// Test suite kiem tra shim core va cac module thanh phan
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CLAUDE_CODE_MODELS, resolveEffort } from "../src/shim/models.ts";
import { buildPrompt, type OpenAiMessage } from "../src/shim/prompt-builder.ts";
import {
  AuthError,
  QuotaError,
  TimeoutError,
  RunnerError,
  SessionNotFoundError,
  type RunnerOptions,
  type RunnerResult
} from "../src/shim/claude-runner.ts";
import { buildChatCompletion, buildSseChunks, buildErrorResponse } from "../src/shim/openai-shape.ts";
import { createRequestHandler } from "../src/shim/handle-request.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("models.ts: catalog va resolveEffort", () => {
  assert.equal(CLAUDE_CODE_MODELS.length, 4);
  const ids = CLAUDE_CODE_MODELS.map(m => m.id);
  assert.deepEqual(ids, ["fable", "opus", "sonnet", "haiku"]);

  // Thu tu uu tien: request > settings > undefined
  assert.equal(resolveEffort("high", "low"), "high");
  assert.equal(resolveEffort(undefined, "medium"), "medium");
  assert.equal(resolveEffort("invalid", "max"), "max");
  assert.equal(resolveEffort("invalid", "invalid"), undefined);
  assert.equal(resolveEffort(undefined, undefined), undefined);
});

test("prompt-builder.ts: tach system, format hoi thoai va phat hien tool result", () => {
  const messages: OpenAiMessage[] = [
    { role: "system", content: "You are a reviewer." },
    { role: "user", content: "Check this code." },
    { role: "assistant", content: "Code looks good." }
  ];

  const result = buildPrompt(messages);
  assert.equal(result.systemPrompt, "You are a reviewer.");
  assert.match(result.prompt, /\[USER\]:\s*Check this code\./);
  assert.match(result.prompt, /\[ASSISTANT\]:\s*Code looks good\./);
  assert.equal(result.isToolResultOnly, false);

  // Truong hop content la array cac parts
  const arrayMsg: OpenAiMessage[] = [
    {
      role: "user",
      content: [
        { type: "text", text: "First part." },
        { type: "text", text: "Second part." }
      ]
    }
  ];
  const arrayResult = buildPrompt(arrayMsg);
  assert.match(arrayResult.prompt, /First part\.\nSecond part\./);

  // Truong hop message cuoi la tool result
  const toolMsg: OpenAiMessage[] = [
    ...messages,
    { role: "tool", content: "OK", tool_call_id: "call_123" }
  ];
  const toolResult = buildPrompt(toolMsg);
  assert.equal(toolResult.isToolResultOnly, true);
});

test("openai-shape.ts: tao chat completion va SSE chunk", () => {
  // Non-streaming voi tool_calls
  const completionWithTool = buildChatCompletion({
    id: "test-1",
    model: "opus",
    toolCall: {
      id: "call_abc",
      type: "function",
      function: { name: "advise", arguments: '{"severity":"concern"}' }
    }
  });
  assert.equal(completionWithTool.choices[0].finish_reason, "tool_calls");
  assert.equal(completionWithTool.choices[0].message.content, null);
  assert.equal(completionWithTool.choices[0].message.tool_calls?.[0].function.name, "advise");

  // Non-streaming voi stop (text rong)
  const completionStop = buildChatCompletion({
    id: "test-2",
    model: "opus",
    text: ""
  });
  assert.equal(completionStop.choices[0].finish_reason, "stop");
  assert.equal(completionStop.choices[0].message.content, "");

  // SSE chunks
  const chunks = buildSseChunks({
    id: "test-3",
    model: "opus",
    toolCall: {
      id: "call_sse",
      type: "function",
      function: { name: "advise", arguments: "{}" }
    }
  });
  assert.ok(chunks.length >= 3);
  assert.equal(chunks[chunks.length - 1], "data: [DONE]\n\n");
  assert.match(chunks[0], /"tool_calls"/);
});

test("handle-request.ts: xac thuc token va routing", async () => {
  const token = "secret-token-123";
  const { handle } = createRequestHandler({
    cwd: process.cwd(),
    token
  });

  // Khong co token -> 401
  const resNoAuth = await handle(new Request("http://127.0.0.1/v1/models"));
  assert.equal(resNoAuth.status, 401);

  // Sai token -> 401
  const resBadAuth = await handle(
    new Request("http://127.0.0.1/v1/models", {
      headers: { Authorization: "Bearer wrong-token" }
    })
  );
  assert.equal(resBadAuth.status, 401);

  // Dung token -> 200 GET /v1/models
  const resModels = await handle(
    new Request("http://127.0.0.1/v1/models", {
      headers: { Authorization: `Bearer ${token}` }
    })
  );
  assert.equal(resModels.status, 200);
  const modelsData = (await resModels.json()) as { data: Array<{ id: string }> };
  assert.equal(modelsData.data.length, 4);
});

test("handle-request.ts: xu ly chat completion voi runner gia lap", async () => {
  const token = "test-token";
  let capturedOptions: RunnerOptions | undefined;

  const mockRunner = async (opts: RunnerOptions): Promise<RunnerResult> => {
    capturedOptions = opts;
    return {
      structuredOutput: {
        severity: "concern",
        note: "Potential issue detected in code"
      },
      sessionId: "session-abc-123",
      usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 }
    };
  };

  const { handle, stats } = createRequestHandler({
    cwd: "/fake/cwd",
    token,
    defaultEffort: "medium",
    runner: mockRunner
  });

  // Request voi tool call (concern)
  const req1 = new Request("http://127.0.0.1/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-code/opus",
      messages: [{ role: "user", content: "Check this logic" }],
      reasoning_effort: "high"
    })
  });

  const res1 = await handle(req1);
  assert.equal(res1.status, 200);
  assert.equal(stats.spawnCount, 1);
  assert.equal(capturedOptions?.model, "opus");
  assert.equal(capturedOptions?.effort, "high");

  const body1 = (await res1.json()) as {
    choices: Array<{
      finish_reason: string;
      message: {
        tool_calls?: Array<{ function: { name: string; arguments: string } }>;
      };
    }>;
  };
  assert.equal(body1.choices[0].finish_reason, "tool_calls");
  assert.equal(body1.choices[0].message.tool_calls?.[0].function.name, "advise");
  const adviseArgs = JSON.parse(body1.choices[0].message.tool_calls?.[0].function.arguments || "{}") as {
    severity: string;
    note: string;
  };
  assert.equal(adviseArgs.severity, "concern");
  assert.equal(adviseArgs.note, "Potential issue detected in code");

  // Request khi last message la tool result -> khong goi runner
  let runnerCalled = false;
  const { handle: handleToolResult } = createRequestHandler({
    cwd: "/fake/cwd",
    token,
    runner: async () => {
      runnerCalled = true;
      throw new Error("Should not be called");
    }
  });

  const reqTool = new Request("http://127.0.0.1/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "opus",
      messages: [
        { role: "user", content: "Review" },
        { role: "assistant", content: null },
        { role: "tool", content: "ok", tool_call_id: "call_123" }
      ]
    })
  });

  const resTool = await handleToolResult(reqTool);
  assert.equal(resTool.status, 200);
  assert.equal(runnerCalled, false);
});

test("handle-request.ts: severity none tra finish_reason stop khong co tool_calls", async () => {
  const token = "test-token";
  const { handle } = createRequestHandler({
    cwd: "/fake/cwd",
    token,
    runner: async () => ({
      structuredOutput: {
        severity: "none",
        note: "All good"
      }
    })
  });

  const req = new Request("http://127.0.0.1/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "opus",
      messages: [{ role: "user", content: "Check" }]
    })
  });

  const res = await handle(req);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    choices: Array<{ finish_reason: string; message: { content: string; tool_calls?: unknown } }>;
  };
  assert.equal(body.choices[0].finish_reason, "stop");
  assert.equal(body.choices[0].message.content, "");
  assert.equal(body.choices[0].message.tool_calls, undefined);
});

test("handle-request.ts: xu ly TimeoutError, AuthError, QuotaError, RunnerError", async () => {
  const token = "test-token";

  // Timeout: tra 200 severity none va tang timeouts counter
  const { handle: handleTimeout, stats: timeoutStats } = createRequestHandler({
    cwd: "/fake/cwd",
    token,
    runner: async () => {
      throw new TimeoutError("Timed out");
    }
  });
  const resTimeout = await handleTimeout(
    new Request("http://127.0.0.1/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] })
    })
  );
  assert.equal(resTimeout.status, 200);
  assert.equal(timeoutStats.timeouts, 1);
  const timeoutBody = (await resTimeout.json()) as { choices: Array<{ finish_reason: string }> };
  assert.equal(timeoutBody.choices[0].finish_reason, "stop");

  // AuthError: tra 401
  const { handle: handleAuth } = createRequestHandler({
    cwd: "/fake/cwd",
    token,
    runner: async () => {
      throw new AuthError("Not logged in");
    }
  });
  const resAuth = await handleAuth(
    new Request("http://127.0.0.1/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] })
    })
  );
  assert.equal(resAuth.status, 401);

  // QuotaError: tra 429
  const { handle: handleQuota } = createRequestHandler({
    cwd: "/fake/cwd",
    token,
    runner: async () => {
      throw new QuotaError("Rate limit exceeded");
    }
  });
  const resQuota = await handleQuota(
    new Request("http://127.0.0.1/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] })
    })
  );
  assert.equal(resQuota.status, 429);

  // RunnerError: tra 502
  const { handle: handleCrash } = createRequestHandler({
    cwd: "/fake/cwd",
    token,
    runner: async () => {
      throw new RunnerError("Crash exit code 1");
    }
  });
  const resCrash = await handleCrash(
    new Request("http://127.0.0.1/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] })
    })
  );
  assert.equal(resCrash.status, 502);
});

test("handle-request.ts: xu ly loi AuthError, QuotaError, RunnerError, TimeoutError khi stream: true", async () => {
  const token = "stream-err-token";

  // QuotaError voi stream: true -> tra status 429 (OMP nhan duoc de pause advisor)
  const { handle: handleQuotaStream } = createRequestHandler({
    cwd: "/fake/cwd",
    token,
    runner: async () => {
      throw new QuotaError("Rate limit in stream");
    }
  });
  const resQuotaStream = await handleQuotaStream(
    new Request("http://127.0.0.1/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "opus", stream: true, messages: [{ role: "user", content: "hi" }] })
    })
  );
  assert.equal(resQuotaStream.status, 429);

  // AuthError voi stream: true -> tra status 401
  const { handle: handleAuthStream } = createRequestHandler({
    cwd: "/fake/cwd",
    token,
    runner: async () => {
      throw new AuthError("Auth failed in stream");
    }
  });
  const resAuthStream = await handleAuthStream(
    new Request("http://127.0.0.1/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "opus", stream: true, messages: [{ role: "user", content: "hi" }] })
    })
  );
  assert.equal(resAuthStream.status, 401);

  // RunnerError voi stream: true -> tra status 502
  const { handle: handleRunnerStream } = createRequestHandler({
    cwd: "/fake/cwd",
    token,
    runner: async () => {
      throw new RunnerError("Crash in stream");
    }
  });
  const resRunnerStream = await handleRunnerStream(
    new Request("http://127.0.0.1/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "opus", stream: true, messages: [{ role: "user", content: "hi" }] })
    })
  );
  assert.equal(resRunnerStream.status, 502);

  // TimeoutError voi stream: true -> tra status 200 voi finish_reason: stop
  const { handle: handleTimeoutStream } = createRequestHandler({
    cwd: "/fake/cwd",
    token,
    runner: async () => {
      throw new TimeoutError("Timed out in stream");
    }
  });
  const resTimeoutStream = await handleTimeoutStream(
    new Request("http://127.0.0.1/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "opus", stream: true, messages: [{ role: "user", content: "hi" }] })
    })
  );
  assert.equal(resTimeoutStream.status, 200);
  const timeoutStreamText = await resTimeoutStream.text();
  assert.ok(timeoutStreamText.includes('"finish_reason":"stop"'));
  assert.ok(timeoutStreamText.includes("data: [DONE]"));
});

test("handle-request.ts: xu ly dung fixture that tu Phase 1", async () => {
  const token = "fixture-token";
  const fixturePath = path.join(__dirname, "fixtures/request-initial.json");
  assert.ok(fs.existsSync(fixturePath), "Fixture request-initial.json must exist");

  const fixtureContent = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
    body: Record<string, unknown>;
  };

  const { handle } = createRequestHandler({
    cwd: process.cwd(),
    token,
    runner: async opts => {
      assert.ok(opts.prompt.length > 0);
      assert.ok(opts.systemPrompt?.includes("RFC 2119"));
      return {
        structuredOutput: {
          severity: "none",
          note: "Fixture review clean"
        }
      };
    }
  });

  const req = new Request("http://127.0.0.1/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(fixtureContent.body)
  });

  const res = await handle(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "text/event-stream");
  const sseText = await res.text();
  assert.ok(sseText.includes("data: [DONE]"));
  assert.ok(sseText.includes('"finish_reason":"stop"'));
});

test("handle-request.ts: session continuity dung resumeId o luot thu 2", async () => {
  const token = "continuity-token";
  const recordedOpts: RunnerOptions[] = [];

  const { handle } = createRequestHandler({
    cwd: "/fake/cwd",
    token,
    runner: async opts => {
      recordedOpts.push(opts);
      return {
        structuredOutput: { severity: "none", note: "ok" },
        sessionId: "session-persisted-456"
      };
    }
  });

  // Luot 1
  const req1 = new Request("http://127.0.0.1/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "opus",
      messages: [{ role: "user", content: "Initial code check" }]
    })
  });
  const res1 = await handle(req1);
  assert.equal(res1.status, 200);
  assert.equal(recordedOpts.length, 1);
  assert.equal(recordedOpts[0].resumeId, undefined);
  assert.ok(recordedOpts[0].sessionId);

  // Luot 2
  const req2 = new Request("http://127.0.0.1/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "opus",
      messages: [
        { role: "user", content: "Initial code check" },
        { role: "assistant", content: "Looks fine" },
        { role: "user", content: "Now check this second change" }
      ]
    })
  });
  const res2 = await handle(req2);
  assert.equal(res2.status, 200);
  assert.equal(recordedOpts.length, 2);
  assert.equal(recordedOpts[1].resumeId, "session-persisted-456");
  assert.match(recordedOpts[1].prompt, /Now check this second change/);
});

test("handle-request.ts: fallback ve session moi khi gap SessionNotFoundError", async () => {
  const token = "retry-token";
  const calls: RunnerOptions[] = [];

  const { handle } = createRequestHandler({
    cwd: "/fake/cwd",
    token,
    runner: async opts => {
      calls.push({ ...opts });
      if (opts.resumeId === "expired-session") {
        throw new SessionNotFoundError("Session not found");
      }
      return {
        structuredOutput: { severity: "none", note: "recovered" },
        sessionId: "expired-session"
      };
    }
  });

  // Luot 1 thanh cong voi expired-session
  await handle(
    new Request("http://127.0.0.1/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "fable",
        messages: [{ role: "user", content: "Turn 1" }]
      })
    })
  );

  calls.length = 0;
  // Luot 2: runner throw SessionNotFoundError tren expired-session -> retry sang new
  const resRetry = await handle(
    new Request("http://127.0.0.1/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "fable",
        messages: [
          { role: "user", content: "Turn 1" },
          { role: "assistant", content: "Ack" },
          { role: "user", content: "Turn 2" }
        ]
      })
    })
  );
  assert.equal(resRetry.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].resumeId, "expired-session");
  assert.equal(calls[1].resumeId, undefined);
  assert.ok(calls[1].sessionId);
  assert.match(calls[1].prompt, /Turn 1/);
  assert.match(calls[1].prompt, /Turn 2/);
});
test("handle-request.ts: real-time streaming phat chunk dau truoc khi runner ket thuc", async () => {
  const token = "stream-gate-token";
  const runnerGate = Promise.withResolvers<void>();

  const { handle } = createRequestHandler({
    cwd: "/fake/cwd",
    token,
    streamRunner: async opts => {
      // Phat chunk text dau tien ngay lap tuc
      opts.onTextDelta?.("realtime_chunk_1");
      // DUNG LAI tai gate, chua ket thuc runner
      await runnerGate.promise;
      return {
        structuredOutput: { severity: "none", note: "completed" },
        sessionId: "stream-gate-session"
      };
    }
  });

  const req = new Request("http://127.0.0.1/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "opus",
      stream: true,
      messages: [{ role: "user", content: "stream test" }]
    })
  });

  const res = await handle(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "text/event-stream");
  assert.ok(res.body);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  // Doc chunk dau tien: phai co truoc khi runnerGate duoc mo!
  const firstRead = await reader.read();
  assert.equal(firstRead.done, false);
  const firstChunkText = decoder.decode(firstRead.value);
  assert.ok(firstChunkText.includes("realtime_chunk_1"));

  // Bay gio mo gate de runner hoan tat
  runnerGate.resolve();

  // Doc phan con lai cho den khi ket thuc
  let remainingText = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    remainingText += decoder.decode(value);
  }

  assert.ok(remainingText.includes("data: [DONE]"));
});

test("handle-request.ts: ma hoa in-band SSE error khi gap loi post-header", async () => {
  const token = "post-header-token";

  const { handle } = createRequestHandler({
    cwd: "/fake/cwd",
    token,
    streamRunner: async opts => {
      // Phat delta dau tien de mo header 200 OK
      opts.onTextDelta?.("initial_delta");
      // Nem loi RunnerError sau khi header da gui
      throw new RunnerError("Connection broken mid-stream");
    }
  });

  const req = new Request("http://127.0.0.1/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "opus",
      stream: true,
      messages: [{ role: "user", content: "test" }]
    })
  });

  const res = await handle(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "text/event-stream");

  const fullText = await res.text();
  assert.ok(fullText.includes("initial_delta"));
  assert.ok(fullText.includes('"error"'));
  assert.ok(fullText.includes("Connection broken mid-stream"));
  assert.ok(fullText.includes("data: [DONE]"));
});

test("handle-request.ts: xu ly TimeoutError sau khi da mo headers ma hoa thanh stop chu khong loi", async () => {
  const token = "timeout-post-header-token";
  const { handle, stats } = createRequestHandler({
    cwd: "/fake/cwd",
    token,
    streamRunner: async opts => {
      opts.onTextDelta?.("some delta before timeout");
      throw new TimeoutError("Claude stream timed out");
    }
  });

  const req = new Request("http://127.0.0.1/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "fable",
      stream: true,
      messages: [{ role: "user", content: "test" }]
    })
  });

  const res = await handle(req);
  assert.equal(res.status, 200);
  const fullText = await res.text();
  assert.ok(fullText.includes("some delta before timeout"));
  assert.ok(fullText.includes('"finish_reason":"stop"'));
  assert.ok(fullText.includes("data: [DONE]"));
  assert.equal(stats.timeouts, 1);
});

test("handle-request.ts: isToolResultOnly cap nhat seenMessages de turn tiep theo chi gui delta moi", async () => {
  const token = "tool-result-seen-token";
  const calls: RunnerOptions[] = [];
  const { handle } = createRequestHandler({
    cwd: "/fake/cwd",
    token,
    runner: async opts => {
      calls.push(opts);
      return {
        structuredOutput: { severity: "nit", note: "check something" },
        sessionId: "tool-test-session"
      };
    }
  });

  // Turn 1
  await handle(
    new Request("http://127.0.0.1/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "fable",
        messages: [{ role: "user", content: "Turn 1" }]
      })
    })
  );
  assert.equal(calls.length, 1);

  // Turn 2: tool result -> shim tra stop ngay, khong goi runner, nhung cap nhat seen
  const toolRes = await handle(
    new Request("http://127.0.0.1/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "fable",
        messages: [
          { role: "user", content: "Turn 1" },
          {
            role: "assistant",
            content: "",
            tool_calls: [{ id: "c1", type: "function", function: { name: "advise", arguments: "{}" } }]
          },
          { role: "tool", content: "ok", tool_call_id: "c1" }
        ]
      })
    })
  );
  assert.equal(toolRes.status, 200);
  assert.equal(calls.length, 1); // runner khong bi goi

  // Turn 3: user moi -> chi gui delta
  await handle(
    new Request("http://127.0.0.1/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "fable",
        messages: [
          { role: "user", content: "Turn 1" },
          {
            role: "assistant",
            content: "",
            tool_calls: [{ id: "c1", type: "function", function: { name: "advise", arguments: "{}" } }]
          },
          { role: "tool", content: "ok", tool_call_id: "c1" },
          { role: "user", content: "Turn 3 message" }
        ]
      })
    })
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[1].resumeId, "tool-test-session");
  assert.match(calls[1].prompt, /Turn 3 message/);
  assert.ok(!calls[1].prompt.includes("Turn 1"));
});

test("handle-request.ts: subagent mode voi tools khac advise hoat dong streaming text va finish_reason stop", async () => {
  const token = "test-token";
  let capturedMode: string | undefined;

  const mockStreamRunner = async (opts: RunnerStreamOptions): Promise<RunnerResult> => {
    capturedMode = opts.mode;
    opts.onTextDelta?.("Day la ket qua ");
    opts.onTextDelta?.("tu subagent opus.");
    return {
      structuredOutput: { severity: "none", note: "" },
      textResponse: "Day la ket qua tu subagent opus.",
      sessionId: "subagent-session-1"
    };
  };

  const { handle } = createRequestHandler({
    cwd: "/fake/cwd",
    token,
    streamRunner: mockStreamRunner
  });

  const req = new Request("http://127.0.0.1/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "opus",
      stream: true,
      tools: [
        { type: "function", function: { name: "read", description: "read file" } },
        { type: "function", function: { name: "bash", description: "run command" } }
      ],
      messages: [{ role: "user", content: "Kiem tra file README.md" }]
    })
  });

  const res = await handle(req);
  assert.equal(res.status, 200);
  assert.equal(capturedMode, "general");

  const text = await res.text();
  const lines = text.split("\n").filter(l => l.startsWith("data: ") && l !== "data: [DONE]");
  const chunks = lines.map(l => JSON.parse(l.slice(6)) as { choices: Array<{ delta: { content?: string; tool_calls?: unknown[] }; finish_reason: string | null }> });

  const contentDeltas = chunks.map(c => c.choices[0].delta.content).filter(Boolean);
  assert.equal(contentDeltas.join(""), "Day la ket qua tu subagent opus.");
  const lastChunk = chunks[chunks.length - 1];
  assert.equal(lastChunk.choices[0].finish_reason, "stop");
  assert.equal(lastChunk.choices[0].delta.tool_calls, undefined);
});

test("handle-request.ts: subagent mode khong bi early stop khi nhan ket qua tool va tiep tuc goi runner", async () => {
  const token = "test-token";
  let runnerCalledCount = 0;

  const mockRunner = async (opts: RunnerOptions): Promise<RunnerResult> => {
    runnerCalledCount++;
    return {
      structuredOutput: { severity: "none", note: "" },
      textResponse: "Phan tich tiep sau khi doc file xong",
      sessionId: "subagent-session-2"
    };
  };

  const { handle } = createRequestHandler({
    cwd: "/fake/cwd",
    token,
    runner: mockRunner
  });

  // Request subagent chua ket qua tool result cua tool "read"
  const req = new Request("http://127.0.0.1/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "opus",
      stream: false,
      tools: [
        { type: "function", function: { name: "read", description: "read file" } }
      ],
      messages: [
        { role: "user", content: "Kiem tra README" },
        {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "call_r1", type: "function", function: { name: "read", arguments: "{\"path\":\"README.md\"}" } }]
        },
        { role: "tool", tool_call_id: "call_r1", content: "# OMP Agent README" }
      ]
    })
  });

  const res = await handle(req);
  assert.equal(res.status, 200);
  assert.equal(runnerCalledCount, 1);

  const body = (await res.json()) as {
    choices: Array<{ message: { content: string; tool_calls?: unknown[] }; finish_reason: string }>;
  };
  assert.equal(body.choices[0].finish_reason, "stop");
  assert.equal(body.choices[0].message.content, "Phan tich tiep sau khi doc file xong");
  assert.equal(body.choices[0].message.tool_calls, undefined);
});
