// Danh muc model Claude Code ho tro cho advisor
export type EffortLevel = "low" | "medium" | "high" | "max";

export interface ClaudeCodeModel {
  id: "fable" | "opus" | "sonnet" | "haiku";
  name: string;
  contextWindow: number;
  maxTokens: number;
  cost: number;
  reasoning: boolean;
  thinking?: {
    mode: "effort";
    efforts: EffortLevel[];
  };
}

export const CLAUDE_CODE_MODELS: ClaudeCodeModel[] = [
  {
    id: "fable",
    name: "Claude Code Fable 5.1",
    contextWindow: 300000,
    maxTokens: 8192,
    cost: 0,
    reasoning: true,
    thinking: {
      mode: "effort",
      efforts: ["low", "medium", "high", "max"]
    }
  },
  {
    id: "opus",
    name: "Claude Code Opus",
    contextWindow: 300000,
    maxTokens: 8192,
    cost: 0,
    reasoning: true,
    thinking: {
      mode: "effort",
      efforts: ["low", "medium", "high", "max"]
    }
  },
  {
    id: "sonnet",
    name: "Claude Code Sonnet",
    contextWindow: 200000,
    maxTokens: 8192,
    cost: 0,
    reasoning: true,
    thinking: {
      mode: "effort",
      efforts: ["low", "medium", "high", "max"]
    }
  },
  {
    id: "haiku",
    name: "Claude Code Haiku",
    contextWindow: 200000,
    maxTokens: 8192,
    cost: 0,
    reasoning: false
  }
];

const VALID_EFFORTS: Record<EffortLevel, true> = {
  low: true,
  medium: true,
  high: true,
  max: true
};

// Xac dinh do sau suy luan theo thu tu uu tien request > settings
export function resolveEffort(
  requestEffort: unknown,
  settingsDefaultEffort?: string
): EffortLevel | undefined {
  if (typeof requestEffort === "string" && requestEffort in VALID_EFFORTS) {
    return requestEffort as EffortLevel;
  }
  if (typeof settingsDefaultEffort === "string" && settingsDefaultEffort in VALID_EFFORTS) {
    return settingsDefaultEffort as EffortLevel;
  }
  return undefined;
}
