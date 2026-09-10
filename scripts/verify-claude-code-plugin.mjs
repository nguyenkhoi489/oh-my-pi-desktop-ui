// Verification suite for Claude Code Advisor Plugin (OMP Plugin)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CLAUDE_CODE_MODELS, resolveEffort } from "../omp-plugins/claude-code/src/shim/models.ts";
import { buildPrompt } from "../omp-plugins/claude-code/src/shim/prompt-builder.ts";
import { resolveClaudeBinary } from "../omp-plugins/claude-code/src/shim/claude-runner.ts";
import { SessionMap } from "../omp-plugins/claude-code/src/shim/session-map.ts";
import { createRequestHandler } from "../omp-plugins/claude-code/src/shim/handle-request.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    failed++;
    throw new Error(message);
  } else {
    console.log(`  ✓ PASSED: ${message}`);
    passed++;
  }
}

console.log("=== Starting Claude Code Advisor Plugin Verification Suite ===\n");

// ----------------------------------------------------
// Test 1: Models Catalog & Fable 5.1 Presence
// ----------------------------------------------------
console.log("[Test 1] Models catalog contains fable 5.1 with 300k context");
{
  assert(CLAUDE_CODE_MODELS.length === 4, "Catalog has 4 models");
  const ids = CLAUDE_CODE_MODELS.map(m => m.id);
  assert(ids.includes("fable"), "Catalog includes fable");
  assert(ids.includes("opus"), "Catalog includes opus");
  assert(ids.includes("sonnet"), "Catalog includes sonnet");
  assert(ids.includes("haiku"), "Catalog includes haiku");

  const fable = CLAUDE_CODE_MODELS.find(m => m.id === "fable");
  assert(fable.contextWindow === 300000, "Fable has 300k context window");
  assert(fable.reasoning === true, "Fable supports reasoning");
  assert(fable.thinking?.efforts.includes("max"), "Fable supports max effort");
}

// ----------------------------------------------------
// Test 2: Effort Resolution Priority
// ----------------------------------------------------
console.log("[Test 2] Effort resolution priority (request > settings)");
{
  assert(resolveEffort("high", "low") === "high", "Request overrides settings");
  assert(resolveEffort(undefined, "medium") === "medium", "Settings default used when request is undefined");
  assert(resolveEffort("invalid", "max") === "max", "Invalid request falls back to valid settings");
  assert(resolveEffort("invalid", "invalid") === undefined, "Both invalid returns undefined");
}

// ----------------------------------------------------
// Test 3: Binary Resolution Prioritizes ~/.local/bin
// ----------------------------------------------------
console.log("[Test 3] Binary resolution prioritizes ~/.local/bin/claude");
{
  const resolved = resolveClaudeBinary();
  assert(typeof resolved === "string" && resolved.length > 0, "Resolved binary path is valid");
  const home = process.env.HOME || "";
  const localBin = path.join(home, ".local/bin/claude");
  if (fs.existsSync(localBin)) {
    assert(resolved === localBin, "Resolved to ~/.local/bin/claude when present");
  }
}

// ----------------------------------------------------
// Test 4: SessionMap Continuity & Lock Order
// ----------------------------------------------------
console.log("[Test 4] SessionMap continuity and lock sequencing");
{
  const map = new SessionMap();
  const sys = "System prompt for testing";
  const msg1 = [{ role: "user", content: "Step 1" }];

  const p1 = map.pick(sys, msg1);
  assert(p1.mode === "new", "Initial pick is new");
  map.commit(p1.key, p1.sessionId, msg1);

  const msg2 = [
    ...msg1,
    { role: "assistant", content: "Ack" },
    { role: "user", content: "Step 2" }
  ];
  const p2 = map.pick(p1.key, msg2);
  assert(p2.mode === "resume", "Follow-up pick resumes session");
  assert(p2.sessionId === p1.sessionId, "Resume session ID matches initial");
  assert(p2.deltaMessages.length === 2, "Only delta messages are returned");
}

// ----------------------------------------------------
// Test 5: Tool Result Handling (markSeen)
// ----------------------------------------------------
console.log("[Test 5] Tool result only marks messages seen without spawning runner");
{
  const token = "test-token-123";
  let runnerSpawned = false;

  const { handle } = createRequestHandler({
    cwd: process.cwd(),
    token,
    runner: async () => {
      runnerSpawned = true;
      return {
        structuredOutput: { severity: "none", note: "ok" },
        sessionId: "sess-tool-test"
      };
    }
  });

  const toolResultReq = new Request("http://127.0.0.1/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "fable",
      messages: [
        { role: "user", content: "Run test" },
        {
          role: "assistant",
          content: "",
          tool_calls: [{ id: "c1", type: "function", function: { name: "advise", arguments: "{}" } }]
        },
        { role: "tool", content: "Completed", tool_call_id: "c1" }
      ]
    })
  });

  const res = await handle(toolResultReq);
  assert(res.status === 200, "Tool result returns 200");
  assert(runnerSpawned === false, "Runner was not spawned for tool result");
  const data = await res.json();
  assert(data.choices[0].finish_reason === "stop", "Finish reason is stop");
}

// ----------------------------------------------------
// Test 6: Bearer Authentication & 401 Rejection
// ----------------------------------------------------
console.log("[Test 6] Bearer authentication verification");
{
  const token = "secret-token-abc";
  const { handle } = createRequestHandler({
    cwd: process.cwd(),
    token
  });

  const unauthReq = new Request("http://127.0.0.1/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer wrong-token", "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "Hi" }] })
  });

  const res = await handle(unauthReq);
  assert(res.status === 401, "Invalid token returns 401");
}
// ----------------------------------------------------
// Test 7: Subagent Mode (General Completion without advise tool)
// ----------------------------------------------------
console.log("[Test 7] Subagent mode runs general runner without advise schema and returns text response");
{
  const token = "subagent-token-xyz";
  let capturedMode = null;
  let runnerCalled = 0;

  const { handle } = createRequestHandler({
    cwd: process.cwd(),
    token,
    runner: async (opts) => {
      runnerCalled++;
      capturedMode = opts.mode;
      return {
        structuredOutput: { severity: "none", note: "" },
        textResponse: "Subagent completed task successfully.",
        sessionId: "subagent-sess-999"
      };
    }
  });

  const subagentReq = new Request("http://127.0.0.1/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "opus",
      tools: [
        { type: "function", function: { name: "read", description: "read file" } },
        { type: "function", function: { name: "edit", description: "edit file" } }
      ],
      messages: [
        { role: "user", content: "Inspect codebase" },
        {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "c_read", type: "function", function: { name: "read", arguments: "{}" } }]
        },
        { role: "tool", content: "file content ok", tool_call_id: "c_read" }
      ]
    })
  });

  const res = await handle(subagentReq);
  assert(res.status === 200, "Subagent request returns 200");
  assert(capturedMode === "general", "Runner mode is general for subagents");
  assert(runnerCalled === 1, "Runner is invoked even with tool result (no early stop in subagent mode)");
  const data = await res.json();
  assert(data.choices[0].finish_reason === "stop", "Finish reason is stop");
  assert(data.choices[0].message.content === "Subagent completed task successfully.", "Content matches text response");
  assert(data.choices[0].message.tool_calls === undefined, "No advise tool call in subagent mode");
}

console.log(`\n=== Verification Summary: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}
