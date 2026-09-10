// Thuc thi tien trinh claude -p va phan tich ket qua JSON / streaming JSON
import { spawn, type ChildProcess } from "node:child_process";
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export class QuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaError";
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

export class RunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunnerError";
  }
}

export class SessionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionNotFoundError";
  }
}

export type AdvisorySeverity = "none" | "nit" | "concern" | "blocker";

export interface StructuredAdvisory {
  severity: AdvisorySeverity;
  note: string;
}

export interface RunnerUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  [key: string]: unknown;
}

export interface RunnerResult {
  structuredOutput: StructuredAdvisory;
  textResponse?: string;
  sessionId?: string;
  usage?: RunnerUsage;
  totalCostUsd?: number;
  rawResult?: unknown;
}

export interface RunnerOptions {
  cwd: string;
  model: string;
  prompt: string;
  effort?: string;
  systemPrompt?: string;
  sessionId?: string;
  resumeId?: string;
  timeoutMs?: number;
  claudePath?: string;
  mode?: "advisor" | "general";
}

export interface RunnerStreamOptions extends RunnerOptions {
  onTextDelta?: (text: string) => void;
}

const ADVISE_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    severity: {
      enum: ["none", "nit", "concern", "blocker"],
      type: "string"
    },
    note: {
      type: "string"
    }
  },
  required: ["severity", "note"]
});

const DEFAULT_TIMEOUT_MS = 120000;
const activeProcesses = new Set<ChildProcess>();

// Dong tat ca tien trinh claude dang chay khi shutdown
export function killAllActiveProcesses(): void {
  for (const proc of activeProcesses) {
    try {
      proc.kill("SIGKILL");
    } catch {
      // Bo qua loi neu tien trinh da tat
    }
  }
  activeProcesses.clear();
}

// Tim duong dan thuc thi claude tren may: uu tien ~/.local/bin truoc de chon dung ban moi nhat ho tro fable
export function resolveClaudeBinary(): string {
  const home = process.env.HOME || "";
  const candidates = [
    path.join(home, ".local/bin/claude"),
    "/opt/homebrew/bin/claude",
    path.join(home, ".bun/bin/claude"),
    "/usr/local/bin/claude"
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "claude";
}

function checkCommonErrors(text: string): void {
  if (
    text.includes("Not logged in") ||
    text.includes("Please run /login") ||
    text.includes("Authentication required")
  ) {
    throw new AuthError("Claude Code is not logged in. Please run claude login.");
  }

  if (
    text.includes("rate limit") ||
    text.includes("usage limit") ||
    text.includes("quota exceeded") ||
    text.includes("429")
  ) {
    throw new QuotaError("Claude Code rate limit or quota exceeded.");
  }

  if (
    text.includes("Session not found") ||
    text.includes("No session found") ||
    text.includes("session does not exist")
  ) {
    throw new SessionNotFoundError("Claude session not found.");
  }
}

function extractStructuredOutput(parsed: Record<string, unknown>, fallbackText: string): StructuredAdvisory {
  let structured = parsed.structured_output as StructuredAdvisory | undefined;
  if (!structured || typeof structured !== "object" || !structured.severity) {
    const noteText = typeof parsed.result === "string" ? parsed.result : fallbackText;
    structured = {
      severity: "nit",
      note: noteText || "Advisor execution finished without structured output"
    };
  }

  const validSeverities: Record<AdvisorySeverity, true> = {
    none: true,
    nit: true,
    concern: true,
    blocker: true
  };
  if (!(structured.severity in validSeverities)) {
    structured.severity = "nit";
  }
  return structured;
}

function buildChildEnv(): NodeJS.ProcessEnv {
  const home = process.env.HOME || "";
  const extendedPath = [
    path.join(home, ".local/bin"),
    "/opt/homebrew/bin",
    path.join(home, ".bun/bin"),
    "/usr/local/bin",
    process.env.PATH || ""
  ]
    .filter(Boolean)
    .join(":");

  return {
    ...process.env,
    PATH: extendedPath
  };
}

// Chay claude -p non-streaming
export async function runClaudeProcess(options: RunnerOptions): Promise<RunnerResult> {
  const binary = options.claudePath || resolveClaudeBinary();
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const isGeneral = options.mode === "general";
  const args: string[] = [
    "-p",
    "--model",
    options.model,
    "--output-format",
    "json",
    ...(isGeneral ? [] : ["--json-schema", ADVISE_SCHEMA]),
    "--allowedTools",
    isGeneral ? "Read,Grep,Glob,Edit,Write,Bash" : "Read,Grep,Glob",
    "--permission-mode",
    "dontAsk"
  ];

  if (options.effort) {
    args.push("--effort", options.effort);
  }
  if (options.systemPrompt) {
    args.push("--append-system-prompt", options.systemPrompt);
  }
  if (options.sessionId && !options.resumeId) {
    args.push("--session-id", options.sessionId);
  }
  if (options.resumeId) {
    args.push("--resume", options.resumeId);
  }

  args.push(options.prompt);

  return new Promise<RunnerResult>((resolve, reject) => {
    let proc: ChildProcess;
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let timedOut = false;

    try {
      proc = spawn(binary, args, {
        cwd: options.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: buildChildEnv()
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      reject(new RunnerError(`Failed to spawn claude: ${msg}`));
      return;
    }

    activeProcesses.add(proc);

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill("SIGTERM");
      } catch {
        // Bo qua loi
      }
      setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          // Bo qua loi
        }
      }, 5000);
      reject(new TimeoutError(`Claude process timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString("utf8");
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString("utf8");
    });

    proc.on("error", (err: Error) => {
      clearTimeout(timeoutTimer);
      activeProcesses.delete(proc);
      if (!timedOut) {
        reject(new RunnerError(`Process error: ${err.message}`));
      }
    });

    proc.on("close", (code: number | null) => {
      clearTimeout(timeoutTimer);
      activeProcesses.delete(proc);
      if (timedOut) return;

      const combinedText = `${stdoutBuffer}\n${stderrBuffer}`;

      try {
        checkCommonErrors(combinedText);
      } catch (e) {
        reject(e);
        return;
      }

      if (code !== 0) {
        const errDetail = stderrBuffer.trim() || stdoutBuffer.trim() || `exit code ${code}`;
        reject(new RunnerError(`Claude process exited with code ${code}: ${errDetail}`));
        return;
      }

      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(stdoutBuffer.trim()) as Record<string, unknown>;
      } catch {
        const jsonMatch = stdoutBuffer.match(/\{[\s\S]*"structured_output"[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
          } catch {
            // Bo qua
          }
        }
      }

      if (parsed.is_error === true) {
        const errMsg = String(parsed.result || "Claude execution error");
        if (errMsg.toLowerCase().includes("quota") || errMsg.toLowerCase().includes("rate limit")) {
          reject(new QuotaError(errMsg));
        } else {
          reject(new RunnerError(errMsg));
        }
        return;
      }

      if (isGeneral) {
        const textResult =
          typeof parsed.result === "string"
            ? parsed.result
            : stdoutBuffer.trim();
        resolve({
          structuredOutput: { severity: "none", note: "" },
          textResponse: textResult,
          sessionId: typeof parsed.session_id === "string" ? parsed.session_id : undefined,
          usage: parsed.usage as RunnerUsage | undefined,
          totalCostUsd: typeof parsed.total_cost_usd === "number" ? parsed.total_cost_usd : undefined,
          rawResult: parsed
        });
        return;
      }

      const structured = extractStructuredOutput(parsed, stdoutBuffer.trim());

      resolve({
        structuredOutput: structured,
        sessionId: typeof parsed.session_id === "string" ? parsed.session_id : undefined,
        usage: parsed.usage as RunnerUsage | undefined,
        totalCostUsd: typeof parsed.total_cost_usd === "number" ? parsed.total_cost_usd : undefined,
        rawResult: parsed
      });
    });
  });
}

// Chay claude -p voi output format stream-json
export async function runClaudeStreamProcess(options: RunnerStreamOptions): Promise<RunnerResult> {
  const binary = options.claudePath || resolveClaudeBinary();
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  const isGeneral = options.mode === "general";
  const args: string[] = [
    "-p",
    "--verbose",
    "--model",
    options.model,
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    ...(isGeneral ? [] : ["--json-schema", ADVISE_SCHEMA]),
    "--allowedTools",
    isGeneral ? "Read,Grep,Glob,Edit,Write,Bash" : "Read,Grep,Glob",
    "--permission-mode",
    "dontAsk"
  ];

  if (options.effort) {
    args.push("--effort", options.effort);
  }
  if (options.systemPrompt) {
    args.push("--append-system-prompt", options.systemPrompt);
  }
  if (options.sessionId && !options.resumeId) {
    args.push("--session-id", options.sessionId);
  }
  if (options.resumeId) {
    args.push("--resume", options.resumeId);
  }

  args.push(options.prompt);

  return new Promise<RunnerResult>((resolve, reject) => {
    let proc: ChildProcess;
    let lastResultObj: Record<string, unknown> | null = null;
    let observedStructuredOutput:
      | { severity: "none" | "nit" | "concern" | "blocker"; note: string }
      | undefined;
    let observedSessionId: string | undefined;
    let observedUsage: RunnerUsage | undefined;
    let observedCost: number | undefined;
    let stderrBuffer = "";
    let timedOut = false;

    let accumulatedText = "";
    try {
      proc = spawn(binary, args, {
        cwd: options.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: buildChildEnv()
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      reject(new RunnerError(`Failed to spawn claude stream: ${msg}`));
      return;
    }

    activeProcesses.add(proc);

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill("SIGTERM");
      } catch {
        // Bo qua loi
      }
      setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          // Bo qua loi
        }
      }, 5000);
      reject(new TimeoutError(`Claude stream process timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    if (proc.stdout) {
      const rl = readline.createInterface({ input: proc.stdout });
      rl.on("line", line => {
        if (!line.trim()) return;
        try {
          const item = JSON.parse(line.trim()) as Record<string, unknown>;
          if (typeof item.session_id === "string") {
            observedSessionId = item.session_id;
          }
          if (item.usage && typeof item.usage === "object") {
            observedUsage = item.usage as RunnerUsage;
          }
          if (typeof item.total_cost_usd === "number") {
            observedCost = item.total_cost_usd;
          }

          if (item.type === "stream_event") {
            const ev = item.event as Record<string, unknown> | undefined;
            if (ev && ev.type === "content_block_delta") {
              const delta = ev.delta as Record<string, unknown> | undefined;
              if (delta && delta.type === "text_delta" && typeof delta.text === "string") {
                accumulatedText += delta.text;
                options.onTextDelta?.(delta.text);
              }
            }
          } else if (item.type === "assistant") {
            const msg = item.message as Record<string, unknown> | undefined;
            if (msg && Array.isArray(msg.content)) {
              for (const block of msg.content) {
                if (
                  block &&
                  typeof block === "object" &&
                  block.type === "tool_use" &&
                  block.name === "StructuredOutput"
                ) {
                  const inp = block.input as Record<string, unknown> | undefined;
                  if (inp && typeof inp.severity === "string") {
                    const sev = ["none", "nit", "concern", "blocker"].includes(inp.severity)
                      ? inp.severity
                      : "none";
                    observedStructuredOutput = {
                      severity: sev as "none" | "nit" | "concern" | "blocker",
                      note: typeof inp.note === "string" ? inp.note : ""
                    };
                  }
                }
              }
            }
          } else if (item.type === "result") {
            lastResultObj = item;
          }
        } catch {
          // Bo qua dong khong phai JSON
        }
      });
    }

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString("utf8");
    });

    proc.on("error", (err: Error) => {
      clearTimeout(timeoutTimer);
      activeProcesses.delete(proc);
      if (!timedOut) {
        reject(new RunnerError(`Stream process error: ${err.message}`));
      }
    });

    proc.on("close", (code: number | null) => {
      clearTimeout(timeoutTimer);
      activeProcesses.delete(proc);
      if (timedOut) return;

      try {
        checkCommonErrors(stderrBuffer);
      } catch (e) {
        reject(e);
        return;
      }

      if (code !== 0) {
        const errDetail = stderrBuffer.trim() || `exit code ${code}`;
        reject(new RunnerError(`Claude stream process exited with code ${code}: ${errDetail}`));
        return;
      }

      const parsed = lastResultObj || {};
      if (isGeneral) {
        const textResult =
          accumulatedText.trim() ||
          (typeof parsed.result === "string" ? parsed.result : "");
        resolve({
          structuredOutput: { severity: "none", note: "" },
          textResponse: textResult,
          sessionId: typeof parsed.session_id === "string" ? parsed.session_id : observedSessionId,
          usage: (parsed.usage as RunnerUsage | undefined) || observedUsage,
          totalCostUsd: typeof parsed.total_cost_usd === "number" ? parsed.total_cost_usd : observedCost,
          rawResult: parsed
        });
        return;
      }

      const structured = observedStructuredOutput || extractStructuredOutput(parsed, "");

      resolve({
        structuredOutput: structured,
        sessionId: typeof parsed.session_id === "string" ? parsed.session_id : observedSessionId,
        usage: (parsed.usage as RunnerUsage | undefined) || observedUsage,
        totalCostUsd: typeof parsed.total_cost_usd === "number" ? parsed.total_cost_usd : observedCost,
        rawResult: parsed
      });
    });
  });
}
