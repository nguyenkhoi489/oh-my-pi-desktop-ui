// Doc va ghi cau hinh plugin tu ~/.omp/agent/claude-code.json
import fs from "node:fs";
import path from "node:path";
import type { EffortLevel } from "./shim/models.ts";

export type EffortSetting = EffortLevel | "off";

export interface PluginSettings {
  defaultEffort?: EffortSetting;
  timeoutMs: number;
}

const VALID_EFFORT_SETTINGS: Record<EffortSetting, true> = {
  low: true,
  medium: true,
  high: true,
  xhigh: true,
  max: true,
  off: true
};

const DEFAULT_SETTINGS: PluginSettings = {
  defaultEffort: undefined,
  timeoutMs: 120000
};

// Lay duong dan file cau hinh
export function getSettingsFilePath(): string {
  const home = process.env.HOME || "";
  const agentDir = process.env.PI_CODING_AGENT_DIR || path.join(home, ".omp/agent");
  return path.join(agentDir, "claude-code.json");
}

// Nap cau hinh tu dia hoac tra ve gia tri mac dinh
export function loadSettings(): PluginSettings {
  const filePath = getSettingsFilePath();
  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    let defaultEffort: EffortSetting | undefined = undefined;
    if (
      typeof parsed.defaultEffort === "string" &&
      parsed.defaultEffort in VALID_EFFORT_SETTINGS
    ) {
      defaultEffort = parsed.defaultEffort as EffortSetting;
    }

    const timeoutMs =
      typeof parsed.timeoutMs === "number" && parsed.timeoutMs > 0
        ? parsed.timeoutMs
        : DEFAULT_SETTINGS.timeoutMs;

    return { defaultEffort, timeoutMs };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

// Luu cau hinh xuong dia voi quyen 0600
export function saveSettings(settings: PluginSettings): void {
  const filePath = getSettingsFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const content = JSON.stringify(settings, null, 2);
  fs.writeFileSync(filePath, content, { encoding: "utf8", mode: 0o600 });
}
