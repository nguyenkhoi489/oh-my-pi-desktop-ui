import type { McpServerConfig, McpTransportType } from '../types';

export interface McpPresetField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'folder';
  required?: boolean;
  placeholder?: string;
  description?: string;
  isEnv?: boolean;
  isArg?: boolean;
  argIndex?: number;
}

export interface McpPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultTransport: McpTransportType;
  command: string;
  defaultArgs: string[];
  fields: McpPresetField[];
}

export const MCP_PRESETS: McpPreset[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Access GitHub repositories, issues, pull requests, and search',
    icon: 'Github',
    defaultTransport: 'stdio',
    command: 'npx',
    defaultArgs: ['-y', '@modelcontextprotocol/server-github'],
    fields: [
      {
        key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        label: 'Personal Access Token',
        type: 'password',
        required: true,
        isEnv: true,
        placeholder: 'ghp_...',
        description: 'GitHub Personal Access Token (classic or fine-grained) with repo scope',
      },
    ],
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Direct file system access to a specified directory',
    icon: 'Folder',
    defaultTransport: 'stdio',
    command: 'npx',
    defaultArgs: ['-y', '@modelcontextprotocol/server-filesystem'],
    fields: [
      {
        key: 'allowedDir',
        label: 'Allowed Directory Path',
        type: 'folder',
        required: true,
        isArg: true,
        argIndex: 2,
        placeholder: '/Users/username/workspace',
        description: 'Absolute path to the directory this MCP server is allowed to access',
      },
    ],
  },
  {
    id: 'memory',
    name: 'Memory (Knowledge Graph)',
    description: 'Graph-based persistent long-term memory across sessions',
    icon: 'Brain',
    defaultTransport: 'stdio',
    command: 'npx',
    defaultArgs: ['-y', '@modelcontextprotocol/server-memory'],
    fields: [],
  },
  {
    id: 'fetch',
    name: 'Fetch & Web Markdown',
    description: 'Web scraper and HTML to Markdown converter',
    icon: 'Globe',
    defaultTransport: 'stdio',
    command: 'npx',
    defaultArgs: ['-y', '@modelcontextprotocol/server-fetch'],
    fields: [],
  },
  {
    id: 'postgres',
    name: 'PostgreSQL Database',
    description: 'Inspect schemas and query PostgreSQL database tables',
    icon: 'Database',
    defaultTransport: 'stdio',
    command: 'npx',
    defaultArgs: ['-y', '@modelcontextprotocol/server-postgres'],
    fields: [
      {
        key: 'connectionUrl',
        label: 'Database Connection URL',
        type: 'password',
        required: true,
        isArg: true,
        argIndex: 2,
        placeholder: 'postgresql://user:password@localhost:5432/dbname',
        description: 'Postgres connection string URL',
      },
    ],
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer Browser',
    description: 'Control headless Chrome browser and capture web content',
    icon: 'Compass',
    defaultTransport: 'stdio',
    command: 'npx',
    defaultArgs: ['-y', '@modelcontextprotocol/server-puppeteer'],
    fields: [],
  },
];

export interface EnvRow {
  id: string;
  key: string;
  value: string;
}

export function envToRows(env?: Record<string, string>): EnvRow[] {
  if (!env || typeof env !== 'object') return [];
  return Object.entries(env).map(([key, value], idx) => ({
    id: `env-${idx}-${Date.now()}`,
    key,
    value: String(value ?? ''),
  }));
}

export function rowsToEnv(rows: Array<{ key: string; value: string }>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of rows) {
    const trimmedKey = row.key.trim();
    if (trimmedKey) {
      result[trimmedKey] = row.value;
    }
  }
  return result;
}

export function argsToText(args?: string[]): string {
  if (!args || !Array.isArray(args) || args.length === 0) return '';
  return args.join('\n');
}

export function textToArgs(text: string): string[] {
  if (!text || !text.trim()) return [];
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  const result: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match[1] !== undefined) {
      result.push(match[1]);
    } else if (match[2] !== undefined) {
      result.push(match[2]);
    } else {
      result.push(match[0]);
    }
  }

  return result;
}

export function validateServerName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: 'Server name is required' };
  }

  if (!/^[a-zA-Z0-9_.:-]+$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Name must contain only letters, numbers, dashes, underscores, dots, or colons',
    };
  }

  return { valid: true };
}

export function buildConfigFromPreset(
  preset: McpPreset,
  fieldValues: Record<string, string>,
): McpServerConfig {
  const env: Record<string, string> = {};
  const args = [...preset.defaultArgs];

  for (const field of preset.fields) {
    const val = fieldValues[field.key]?.trim() || '';
    if (field.isEnv) {
      if (val) env[field.key] = val;
    } else if (field.isArg) {
      if (typeof field.argIndex === 'number' && field.argIndex >= 0) {
        while (args.length <= field.argIndex) {
          args.push('');
        }
        args[field.argIndex] = val;
      } else if (val) {
        args.push(val);
      }
    }
  }

  return {
    command: preset.command,
    args: args.filter((a) => Boolean(a && a.trim())),
    env: Object.keys(env).length > 0 ? env : undefined,
    type: preset.defaultTransport,
    disabled: false,
  };
}
