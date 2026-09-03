export type RoleThinkingLevel =
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'
  | 'auto';

export interface ModelRoleSpec {
  model: string;
  level?: RoleThinkingLevel;
}

export const ROLE_THINKING_LEVELS: RoleThinkingLevel[] = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'auto',
];

const LEVEL_SET = new Set<string>(ROLE_THINKING_LEVELS);

// Characters indicating advanced role pattern, not a single model
const ADVANCED_VALUE_CHARS = ['*', '?', '[', ','];

// Split "provider/model[:level]" per OMP CLI spec; null if advanced pattern
export function parseModelRoleSpec(raw: string): ModelRoleSpec | null {
  const value = (raw || '').trim();
  if (!value) return null;

  const slashIndex = value.indexOf('/');
  if (slashIndex <= 0) return null;
  if (ADVANCED_VALUE_CHARS.some((char) => value.includes(char))) return null;

  const colonIndex = value.lastIndexOf(':');
  if (colonIndex > slashIndex) {
    const suffix = value.slice(colonIndex + 1);
    if (LEVEL_SET.has(suffix)) {
      return { model: value.slice(0, colonIndex), level: suffix as RoleThinkingLevel };
    }
  }

  return { model: value };
}

export function formatModelRoleSpec(model: string, level?: RoleThinkingLevel): string {
  const base = (model || '').trim();
  if (!base) return '';
  return level ? `${base}:${level}` : base;
}
