// Entrypoint extension dang ky provider claude-code va quan ly lifecycle
import crypto from "node:crypto";
import { CLAUDE_CODE_MODELS } from "./shim/models.ts";
import { createRequestHandler } from "./shim/handle-request.ts";
import { killAllActiveProcesses } from "./shim/claude-runner.ts";
import { startShimServer, type ServerHandle } from "./server.ts";
import { loadSettings, saveSettings, type EffortSetting } from "./settings.ts";

export interface OmpExtensionContext {
  registerProvider?: (name: string, config: unknown) => void;
  registerCommand?: (
    name: string,
    options: {
      description?: string;
      handler: (args: string, ctx?: unknown) => void | Promise<void>;
    }
  ) => void;
  on?: (event: string, handler: (data?: unknown) => void | Promise<void>) => void;
  events?: {
    on: (event: string, handler: (data?: unknown) => void | Promise<void>) => void;
  };
  logger?: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
  cwd?: string;
  [key: string]: unknown;
}

// Factory khoi tao extension khi OMP nap plugin
export default async function (pi: OmpExtensionContext): Promise<void> {
  const settings = loadSettings();
  const token = crypto.randomUUID();
  let currentCwd = typeof pi.cwd === "string" ? pi.cwd : process.cwd();
  const shimSettings = {
    cwd: currentCwd,
    token,
    defaultEffort: settings.defaultEffort === "off" ? undefined : settings.defaultEffort,
    timeoutMs: settings.timeoutMs
  };

  const { handle, stats, sessionMap } = createRequestHandler(shimSettings);

  let server: ServerHandle;
  try {
    server = await startShimServer(handle);
    pi.logger?.info?.(`[claude-code] Shim server listening on http://127.0.0.1:${server.port}/v1`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    pi.logger?.error?.(`[claude-code] Failed to start shim server: ${msg}`);
    return;
  }

  // Dang ky provider vao OMP
  if (typeof pi.registerProvider === "function") {
    pi.registerProvider("claude-code", {
      baseUrl: `http://127.0.0.1:${server.port}/v1`,
      api: "openai-completions",
      apiKey: token,
      authHeader: true,
      models: CLAUDE_CODE_MODELS
    });
  }

  // Dang ky lang nghe su kien lifecycle
  const registerEvent = (event: string, cb: (data?: unknown) => void | Promise<void>) => {
    if (typeof pi.on === "function") {
      pi.on(event, cb);
    } else if (pi.events && typeof pi.events.on === "function") {
      pi.events.on(event, cb);
    }
  };

  registerEvent("session_start", (data?: unknown) => {
    if (data && typeof data === "object" && "cwd" in data && typeof data.cwd === "string") {
      currentCwd = data.cwd;
      shimSettings.cwd = data.cwd;
    }
  });

  registerEvent("session_shutdown", () => {
    // Giu shim server hoat dong xuyen suot cac session; chi don tien trinh va session map
    killAllActiveProcesses();
    sessionMap.reset();
  });

  // Dang ky slash command /claude-code
  if (typeof pi.registerCommand === "function") {
    pi.registerCommand("claude-code", {
      description: "Manage Claude Code advisor provider (status | effort <level>)",
      handler: (rawArgs: string, ctx?: unknown) => {
        const args = (rawArgs || "").trim().split(/\s+/);
        const subcommand = args[0] || "status";

        const printMsg = (text: string) => {
          if (
            ctx &&
            typeof ctx === "object" &&
            "ui" in ctx &&
            ctx.ui &&
            typeof ctx.ui === "object" &&
            "notify" in ctx.ui &&
            typeof ctx.ui.notify === "function"
          ) {
            ctx.ui.notify(text);
          } else {
            console.log(text);
          }
        };

        if (subcommand === "effort") {
          const newEffort = args[1] as EffortSetting | undefined;
          const validEfforts: Record<EffortSetting, true> = {
            low: true,
            medium: true,
            high: true,
            max: true,
            off: true
          };

          if (newEffort && newEffort in validEfforts) {
            settings.defaultEffort = newEffort;
            shimSettings.defaultEffort = newEffort === "off" ? undefined : newEffort;
            saveSettings(settings);
            printMsg(`[claude-code] Default effort set to: ${newEffort}`);
          } else {
            printMsg(
              `[claude-code] Invalid effort level. Valid values: low, medium, high, max, off`
            );
          }
          return;
        }

        // Subcommand status
        const statusLines = [
          `=== Claude Code Advisor Provider ===`,
          `Port: ${server.port}`,
          `Models: ${CLAUDE_CODE_MODELS.map(m => m.id).join(", ")}`,
          `Active sessions: ${sessionMap.size()}`,
          `Total spawns: ${stats.spawnCount}`,
          `Timeouts: ${stats.timeouts}`,
          `Default effort: ${settings.defaultEffort || "auto"}`,
          `Timeout setting: ${settings.timeoutMs}ms`,
          `Last error: ${stats.lastError || "none"}`
        ];
        printMsg(statusLines.join("\n"));
      }
    });
  }
}
