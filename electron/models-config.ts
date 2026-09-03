import { tm } from '../shared/i18n/index.ts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import YAML from 'yaml';

import type { OmpFoundModel, FindModelsResult } from './types.ts';
const execFileAsync = promisify(execFile);

export interface CustomModelCost {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export type OmpEffortLevel = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type CustomThinkingMode =
  | 'effort'
  | 'budget'
  | 'google-level'
  | 'anthropic-adaptive'
  | 'anthropic-budget-effort';

export interface CustomModelThinking {
  mode: CustomThinkingMode;
  efforts?: OmpEffortLevel[];
  defaultLevel?: OmpEffortLevel;
}

export type CustomProviderDiscoveryType =
  | 'ollama'
  | 'llama.cpp'
  | 'lm-studio'
  | 'openai-models-list'
  | 'proxy'
  | 'litellm';

export interface CustomProviderDiscovery {
  type: CustomProviderDiscoveryType;
  timeoutMs?: number;
}

export interface CustomModelConfig {
  id: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
  input?: ('text' | 'image')[];
  reasoning?: boolean;
  supportsTools?: boolean;
  cost?: CustomModelCost;
  thinking?: CustomModelThinking;
  premiumMultiplier?: number;
  omitMaxOutputTokens?: boolean;
}

export interface CustomProviderConfig {
  id: string;
  baseUrl: string;
  api?: string;
  apiKey?: string;
  authHeader?: boolean;
  auth?: 'apiKey' | 'none' | 'oauth';
  headers?: Record<string, string>;
  discovery?: CustomProviderDiscovery;
  compat?: {
    supportsUsageInStreaming?: boolean;
    [key: string]: unknown;
  };
  models?: CustomModelConfig[];
  hasEnvVar?: boolean;
}

export interface ModelsConfigReadResult {
  providers: CustomProviderConfig[];
  filePath: string;
  isWritable: boolean;
  error?: string;
}

export interface ModelsConfigWriteResult {
  success: boolean;
  filePath?: string;
  backupPath?: string;
  error?: string;
}

export interface LoginProviderItem {
  id: string;
  name: string;
  available?: boolean;
  authenticated?: boolean;
}

let loginProvidersCache: LoginProviderItem[] | null = null;

export function getDefaultModelsConfigPath(): string {
  return path.join(os.homedir(), '.omp', 'agent', 'models.yml');
}

export function parseModelsYaml(yamlContent: string): CustomProviderConfig[] {
  if (!yamlContent || !yamlContent.trim()) {
    return [];
  }

  let parsed: any;
  try {
    parsed = YAML.parse(yamlContent);
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== 'object') {
    return [];
  }

  const providersObj = parsed.providers;
  if (!providersObj || typeof providersObj !== 'object') {
    return [];
  }

  const result: CustomProviderConfig[] = [];

  for (const [providerId, rawConfig] of Object.entries(providersObj)) {
    if (!rawConfig || typeof rawConfig !== 'object') {
      continue;
    }

    const cfg = rawConfig as Record<string, any>;
    const models: CustomModelConfig[] = [];

    if (Array.isArray(cfg.models)) {
      for (const m of cfg.models) {
        if (m && typeof m === 'object' && typeof m.id === 'string') {
          models.push({
            id: m.id,
            name: typeof m.name === 'string' ? m.name : undefined,
            contextWindow: typeof m.contextWindow === 'number' ? m.contextWindow : undefined,
            maxTokens: typeof m.maxTokens === 'number' ? m.maxTokens : undefined,
            input: parseModelInput(m.input),
            reasoning: typeof m.reasoning === 'boolean' ? m.reasoning : undefined,
            supportsTools: typeof m.supportsTools === 'boolean' ? m.supportsTools : undefined,
            cost: parseModelCost(m.cost),
            thinking: parseModelThinking(m.thinking),
            premiumMultiplier:
              typeof m.premiumMultiplier === 'number' && Number.isFinite(m.premiumMultiplier) && m.premiumMultiplier > 0
                ? m.premiumMultiplier
                : undefined,
            omitMaxOutputTokens: typeof m.omitMaxOutputTokens === 'boolean' ? m.omitMaxOutputTokens : undefined,
          });
        }
      }
    }

    const apiKeyEnvName = typeof cfg.apiKey === 'string' ? cfg.apiKey.trim() : undefined;
    const hasEnvVar = apiKeyEnvName ? Boolean(process.env[apiKeyEnvName]) : false;

    result.push({
      id: providerId,
      baseUrl: typeof cfg.baseUrl === 'string' ? cfg.baseUrl : '',
      api: typeof cfg.api === 'string' ? cfg.api : 'openai-completions',
      apiKey: apiKeyEnvName,
      authHeader: typeof cfg.authHeader === 'boolean' ? cfg.authHeader : undefined,
      auth: cfg.auth === 'apiKey' || cfg.auth === 'none' || cfg.auth === 'oauth' ? cfg.auth : undefined,
      headers: parseProviderHeaders(cfg.headers),
      discovery: parseProviderDiscovery(cfg.discovery),
      compat: cfg.compat && typeof cfg.compat === 'object' ? cfg.compat : undefined,
      models: models.length > 0 ? models : undefined,
      hasEnvVar,
    });
  }

  return result;
}

const EFFORT_LEVELS: OmpEffortLevel[] = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const THINKING_MODES: CustomThinkingMode[] = [
  'effort',
  'budget',
  'google-level',
  'anthropic-adaptive',
  'anthropic-budget-effort',
];
const DISCOVERY_TYPES: CustomProviderDiscoveryType[] = [
  'ollama',
  'llama.cpp',
  'lm-studio',
  'openai-models-list',
  'proxy',
  'litellm',
];

function parseModelThinking(raw: unknown): CustomModelThinking | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Record<string, unknown>;
  if (!THINKING_MODES.includes(src.mode as CustomThinkingMode)) return undefined;
  const rawEfforts = Array.isArray(src.efforts) ? src.efforts : Array.isArray(src.levels) ? src.levels : [];
  const efforts = rawEfforts.filter((v): v is OmpEffortLevel => EFFORT_LEVELS.includes(v as OmpEffortLevel));
  if (efforts.length === 0) return undefined;
  const defaultLevel = EFFORT_LEVELS.includes(src.defaultLevel as OmpEffortLevel)
    ? (src.defaultLevel as OmpEffortLevel)
    : undefined;
  return { mode: src.mode as CustomThinkingMode, efforts, defaultLevel };
}

function parseProviderHeaders(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key.trim() && typeof value === 'string') headers[key] = value;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function parseProviderDiscovery(raw: unknown): CustomProviderDiscovery | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Record<string, unknown>;
  if (!DISCOVERY_TYPES.includes(src.type as CustomProviderDiscoveryType)) return undefined;
  const timeoutMs =
    typeof src.timeoutMs === 'number' && Number.isFinite(src.timeoutMs) && src.timeoutMs > 0
      ? src.timeoutMs
      : undefined;
  return { type: src.type as CustomProviderDiscoveryType, timeoutMs };
}

function parseModelInput(raw: unknown): ('text' | 'image')[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const modalities = raw.filter((v): v is 'text' | 'image' => v === 'text' || v === 'image');
  return modalities.length > 0 ? modalities : undefined;
}

function parseModelCost(raw: unknown): CustomModelCost | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Record<string, unknown>;
  const cost: CustomModelCost = {};
  for (const key of ['input', 'output', 'cacheRead', 'cacheWrite'] as const) {
    if (typeof src[key] === 'number' && Number.isFinite(src[key])) {
      cost[key] = src[key] as number;
    }
  }
  return Object.keys(cost).length > 0 ? cost : undefined;
}

export function serializeModelsYaml(providers: CustomProviderConfig[]): string {
  const providersObj: Record<string, any> = {};

  for (const p of providers) {
    if (!p.id || !p.id.trim()) continue;

    const providerEntry: Record<string, any> = {
      baseUrl: p.baseUrl || '',
      api: p.api || 'openai-completions',
    };

    if (p.apiKey && p.apiKey.trim()) {
      providerEntry.apiKey = p.apiKey.trim();
    }

    if (typeof p.authHeader === 'boolean') {
      providerEntry.authHeader = p.authHeader;
    }

    // auth apiKey is default in OMP, so only write when different from default
    if (p.auth === 'none' || p.auth === 'oauth') {
      providerEntry.auth = p.auth;
    }

    const headers = parseProviderHeaders(p.headers);
    if (headers) providerEntry.headers = headers;

    const discovery = parseProviderDiscovery(p.discovery);
    if (discovery) {
      providerEntry.discovery = { type: discovery.type };
      if (discovery.timeoutMs) providerEntry.discovery.timeoutMs = discovery.timeoutMs;
    }

    if (p.compat && typeof p.compat === 'object' && Object.keys(p.compat).length > 0) {
      providerEntry.compat = p.compat;
    }

    if (Array.isArray(p.models) && p.models.length > 0) {
      providerEntry.models = p.models
        .filter((m) => m && m.id && m.id.trim())
        .map((m) => {
          const mObj: Record<string, any> = { id: m.id.trim() };
          if (m.name && m.name.trim()) mObj.name = m.name.trim();
          if (typeof m.contextWindow === 'number' && !isNaN(m.contextWindow)) {
            mObj.contextWindow = m.contextWindow;
          }
          if (typeof m.maxTokens === 'number' && !isNaN(m.maxTokens)) {
            mObj.maxTokens = m.maxTokens;
          }
          const input = parseModelInput(m.input);
          if (input) mObj.input = input;
          if (typeof m.reasoning === 'boolean') mObj.reasoning = m.reasoning;
          if (typeof m.supportsTools === 'boolean') mObj.supportsTools = m.supportsTools;
          const cost = parseModelCost(m.cost);
          if (cost) mObj.cost = cost;
          const thinking = parseModelThinking(m.thinking);
          if (thinking) {
            mObj.thinking = { mode: thinking.mode, efforts: thinking.efforts };
            if (thinking.defaultLevel) mObj.thinking.defaultLevel = thinking.defaultLevel;
          }
          if (typeof m.premiumMultiplier === 'number' && Number.isFinite(m.premiumMultiplier) && m.premiumMultiplier > 0) {
            mObj.premiumMultiplier = m.premiumMultiplier;
          }
          if (m.omitMaxOutputTokens === true) mObj.omitMaxOutputTokens = true;
          return mObj;
        });
    }

    providersObj[p.id.trim()] = providerEntry;
  }

  return YAML.stringify({ providers: providersObj }, { indent: 2 });
}

export async function readModelsConfig(customPath?: string): Promise<ModelsConfigReadResult> {
  const targetPath = customPath || getDefaultModelsConfigPath();

  let isWritable = true;
  try {
    if (fsSync.existsSync(targetPath)) {
      await fs.access(targetPath, fsSync.constants.W_OK);
    } else {
      const parentDir = path.dirname(targetPath);
      if (fsSync.existsSync(parentDir)) {
        await fs.access(parentDir, fsSync.constants.W_OK);
      }
    }
  } catch {
    isWritable = false;
  }

  try {
    const rawContent = await fs.readFile(targetPath, 'utf-8');
    const providers = parseModelsYaml(rawContent);

    return {
      providers,
      filePath: targetPath,
      isWritable,
      error: !isWritable
        ? tm('electron.models.permissionError', { path: targetPath })
        : undefined,
    };
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return {
        providers: [],
        filePath: targetPath,
        isWritable,
      };
    }

    if (err?.code === 'EACCES' || err?.code === 'EPERM') {
      return {
        providers: [],
        filePath: targetPath,
        isWritable: false,
        error: tm('electron.models.permissionError', { path: targetPath }),
      };
    }

    return {
      providers: [],
      filePath: targetPath,
      isWritable,
      error: tm('electron.models.readConfigError', { detail: err?.message || String(err) }),
    };
  }
}

export async function writeModelsConfig(
  providers: CustomProviderConfig[],
  customPath?: string
): Promise<ModelsConfigWriteResult> {
  const targetPath = customPath || getDefaultModelsConfigPath();
  const backupPath = `${targetPath}.bak`;
  const parentDir = path.dirname(targetPath);

  try {
    await fs.mkdir(parentDir, { recursive: true });

    if (fsSync.existsSync(targetPath)) {
      await fs.copyFile(targetPath, backupPath);
    }

    const yamlContent = serializeModelsYaml(providers);

    // Validate integrity before writing
    YAML.parse(yamlContent);

    await fs.writeFile(targetPath, yamlContent, 'utf-8');

    return {
      success: true,
      filePath: targetPath,
      backupPath: fsSync.existsSync(backupPath) ? backupPath : undefined,
    };
  } catch (err: any) {
    if (err?.code === 'EACCES' || err?.code === 'EPERM') {
      return {
        success: false,
        filePath: targetPath,
        error: tm('electron.models.permissionError', { path: targetPath }),
      };
    }

    return {
      success: false,
      filePath: targetPath,
      error: tm('electron.models.saveConfigError', { detail: err?.message || String(err) }),
    };
  }
}

  // Extend PATH with standard installation locations on macOS
export function buildExtendedPath(): string {
  const homedir = os.homedir();
  return [
    process.env.PATH,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.join(homedir, '.local/bin'),
    path.join(homedir, '.bun/bin'),
    path.join(homedir, '.cargo/bin'),
    path.join(homedir, 'Library/pnpm'),
    '/usr/bin',
    '/bin',
  ]
    .filter(Boolean)
    .join(':');
}

export function parseLoginProvidersJson(jsonString: string): LoginProviderItem[] {
  try {
    const parsed = JSON.parse(jsonString);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item) => item && typeof item.id === 'string')
        .map((item) => ({
          id: item.id,
          name: typeof item.name === 'string' ? item.name : item.id,
        }));
    }
    return [];
  } catch {
    return [];
  }
}

export function clearLoginProvidersCache(): void {
  loginProvidersCache = null;
}

export async function fetchLoginProviders(
  binaryPath?: string,
  forceRefresh = false
): Promise<{ success: boolean; providers?: LoginProviderItem[]; error?: string }> {
  if (loginProvidersCache && !forceRefresh) {
    return { success: true, providers: loginProvidersCache };
  }

  if (!binaryPath) {
    return {
      success: false,
      providers: [],
      error: tm('electron.models.binaryNotFoundForServices'),
    };
  }

  try {
    const { stdout } = await execFileAsync(binaryPath, ['auth-broker', 'list', '--json'], {
      env: { ...process.env, PATH: buildExtendedPath() },
      encoding: 'utf-8',
      timeout: 5000,
    });

    const providers = parseLoginProvidersJson(stdout);
    loginProvidersCache = providers;

    return { success: true, providers };
  } catch (err: any) {
    return {
      success: false,
      providers: [],
      error: tm('electron.models.listAuthBrokerError', { detail: err?.message || String(err) }),
    };
  }
}

  // Parse JSON output from omp models find <pattern> --json
export function parseFindModelsJson(stdout: string): OmpFoundModel[] {
  if (!stdout || !stdout.trim()) return [];

  function normalizeModels(rawArray: unknown[]): OmpFoundModel[] {
    const models: OmpFoundModel[] = [];
    for (const item of rawArray) {
      if (!item || typeof item !== 'object') continue;
      const typed = item as Record<string, unknown>;
      const provider = typeof typed.provider === 'string' ? typed.provider : '';
      const id = typeof typed.id === 'string' ? typed.id : '';
      if (!id) continue;

      const selector =
        typeof typed.selector === 'string' && typed.selector.trim()
          ? typed.selector
          : provider
            ? `${provider}/${id}`
            : id;

      const costRaw = typed.cost && typeof typed.cost === 'object' ? (typed.cost as Record<string, unknown>) : undefined;
      const cost = costRaw
        ? {
            ...(typeof costRaw.input === 'number' ? { input: costRaw.input } : {}),
            ...(typeof costRaw.output === 'number' ? { output: costRaw.output } : {}),
            ...(typeof costRaw.cacheRead === 'number' ? { cacheRead: costRaw.cacheRead } : {}),
            ...(typeof costRaw.cacheWrite === 'number' ? { cacheWrite: costRaw.cacheWrite } : {}),
          }
        : undefined;

      models.push({
        provider,
        id,
        selector,
        ...(typeof typed.name === 'string' ? { name: typed.name } : {}),
        ...(typeof typed.contextWindow === 'number' ? { contextWindow: typed.contextWindow } : {}),
        ...(typeof typed.maxTokens === 'number' ? { maxTokens: typed.maxTokens } : {}),
        ...(typeof typed.reasoning === 'boolean' ? { reasoning: typed.reasoning } : {}),
        ...(Array.isArray(typed.thinking) ? { thinking: typed.thinking.map(String) } : {}),
        ...(Array.isArray(typed.input) ? { input: typed.input as ('text' | 'image' | string)[] } : {}),
        ...(cost && Object.keys(cost).length > 0 ? { cost } : {}),
      });
    }
    return models;
  }

  try {
    const direct = JSON.parse(stdout.trim());
    if (direct && typeof direct === 'object') {
      if (Array.isArray(direct.models)) {
        return normalizeModels(direct.models);
      }
      if (Array.isArray(direct)) {
        return normalizeModels(direct);
      }
    }
  } catch {
  // Fallback parse when output contains text/logs outside JSON
  }

  const firstBrace = stdout.indexOf('{');
  const lastBrace = stdout.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const candidate = stdout.slice(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.models)) {
        return normalizeModels(parsed.models);
      }
    } catch {
  // Ignore fallback error
    }
  }

  return [];
}

  // Execute omp models find <pattern> --json to search models in catalog
export async function findModels(
  binaryPath?: string,
  pattern?: string,
  options?: { profile?: string }
): Promise<FindModelsResult> {
  const trimmedPattern = (pattern || '').trim();
  if (!trimmedPattern) {
    return { success: true, models: [] };
  }

  if (!binaryPath) {
    return {
      success: false,
      models: [],
      error: tm('electron.models.binaryNotFound'),
    };
  }

  const args: string[] = [];
  if (options?.profile && options.profile.trim()) {
    args.push('--profile', options.profile.trim());
  }
  args.push('models', 'find', trimmedPattern, '--json');

  try {
    const { stdout } = await execFileAsync(binaryPath, args, {
      env: { ...process.env, PATH: buildExtendedPath() },
      encoding: 'utf-8',
      timeout: 15000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const models = parseFindModelsJson(stdout);
    return { success: true, models };
  } catch (err: any) {
    return {
      success: false,
      models: [],
      error: tm('electron.models.findModelsError', { detail: err?.message || String(err) }),
    };
  }
}
