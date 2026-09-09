// Test suite kiem tra logic SessionMap va session continuity
import test from "node:test";
import assert from "node:assert/strict";

import { SessionMap } from "../src/shim/session-map.ts";
import type { OpenAiMessage } from "../src/shim/prompt-builder.ts";

test("session-map.ts: pick new va resume khi messages tang dan", () => {
  const map = new SessionMap();
  const systemPrompt = "You are an advisor.";

  const msg1: OpenAiMessage[] = [
    { role: "user", content: "Initial prompt" }
  ];

  // Luot 1: chua co session -> mode new
  const pick1 = map.pick(systemPrompt, msg1);
  assert.equal(pick1.mode, "new");
  assert.ok(pick1.sessionId);
  assert.equal(pick1.deltaMessages.length, 1);

  // Commit sau khi runner thanh cong
  map.commit(pick1.key, pick1.sessionId, msg1);
  assert.equal(map.size(), 1);

  // Luot 2: them assistant + user moi -> mode resume, chi gui delta
  const msg2: OpenAiMessage[] = [
    ...msg1,
    { role: "assistant", content: "OK" },
    { role: "user", content: "Second turn" }
  ];

  const pick2 = map.pick(systemPrompt, msg2);
  assert.equal(pick2.mode, "resume");
  assert.equal(pick2.sessionId, pick1.sessionId);
  assert.equal(pick2.deltaMessages.length, 2);
  assert.equal(pick2.deltaMessages[0].role, "assistant");
  assert.equal(pick2.deltaMessages[1].role, "user");

  // Commit luot 2
  map.commit(pick2.key, pick2.sessionId, msg2);

  // Luot 3: OMP compaction lam thay doi prefix -> mode new
  const compactedMsg: OpenAiMessage[] = [
    { role: "user", content: "Different initial prompt after compaction" }
  ];
  const pick3 = map.pick(systemPrompt, compactedMsg);
  assert.equal(pick3.mode, "new");
  assert.notEqual(pick3.sessionId, pick1.sessionId);
});

test("session-map.ts: LRU gioi han 32 session", () => {
  const map = new SessionMap();
  const systemPrompt = "System";

  // Tao 35 session khac nhau
  for (let i = 0; i < 35; i++) {
    const msgs: OpenAiMessage[] = [{ role: "user", content: `Prompt ${i}` }];
    const p = map.pick(systemPrompt, msgs);
    map.commit(p.key, p.sessionId, msgs);
  }

  assert.ok(map.size() <= 32);
});

test("session-map.ts: acquireLock tuan tu hoa request cung key", async () => {
  const map = new SessionMap();
  const key = "test-conv-key";
  const executionOrder: number[] = [];

  const gate = Promise.withResolvers<void>();

  const task1 = async () => {
    const release = await map.acquireLock(key);
    await gate.promise;
    executionOrder.push(1);
    release();
  };

  const task2 = async () => {
    const release = await map.acquireLock(key);
    executionOrder.push(2);
    release();
  };

  const p1 = task1();
  const p2 = task2();

  // Cho ca 2 da vao hang doi roi moi mo gate cho task 1 chay tiep
  gate.resolve();
  await Promise.all([p1, p2]);

  assert.deepEqual(executionOrder, [1, 2]);
});

test("session-map.ts: markSeen cap nhat seenMessages cho tool result", () => {
  const map = new SessionMap();
  const systemPrompt = "System";
  const msgs: OpenAiMessage[] = [{ role: "user", content: "Prompt 1" }];
  const pick1 = map.pick(systemPrompt, msgs);
  map.commit(pick1.key, pick1.sessionId, msgs);

  // Assistant goi tool advise, sau do nhan tool result
  const msgsWithToolResult: OpenAiMessage[] = [
    ...msgs,
    {
      role: "assistant",
      content: "",
      tool_calls: [{ id: "c1", type: "function", function: { name: "advise", arguments: "{}" } }]
    },
    { role: "tool", content: "ok", tool_call_id: "c1" }
  ];

  // markSeen duoc goi khi isToolResultOnly
  map.markSeen(pick1.key, msgsWithToolResult);

  // Turn tiep theo cua user
  const nextUserTurn: OpenAiMessage[] = [
    ...msgsWithToolResult,
    { role: "user", content: "Prompt 2" }
  ];
  const pickNext = map.pick(pick1.key, nextUserTurn);
  assert.equal(pickNext.mode, "resume");
  assert.equal(pickNext.deltaMessages.length, 1);
  assert.equal(pickNext.deltaMessages[0].content, "Prompt 2");
});
