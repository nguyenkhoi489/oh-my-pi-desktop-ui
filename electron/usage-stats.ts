import { tm } from '../shared/i18n/index.ts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildExtendedPath } from './models-config.ts';
import type {
  OmpGlobalUsageData,
  OmpGlobalStatsData,
  GlobalUsageResult,
  GlobalStatsResult,
  FetchGlobalUsageOptions,
  OmpUsageHistoryData,
  UsageHistoryResult,
  FetchUsageHistoryOptions,
  OmpUsageClientsData,
  UsageClientsResult,
  FetchUsageClientsOptions,
  InvalidateUsageOptions,
  UsageInvalidateResult,
} from './types.ts';

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

let usageCache: CacheEntry<OmpGlobalUsageData> | null = null;
let statsCache: CacheEntry<OmpGlobalStatsData> | null = null;
const historyCache = new Map<string, CacheEntry<OmpUsageHistoryData>>();
const clientsCache = new Map<string, CacheEntry<OmpUsageClientsData>>();

// Find start and end position of JSON payload in output string
export function extractJsonSubstring(text: string): string | null {
  if (!text) return null;
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  let startIndex = -1;
  let isObject = false;

  if (firstBrace !== -1 && firstBracket !== -1) {
    if (firstBrace < firstBracket) {
      startIndex = firstBrace;
      isObject = true;
    } else {
      startIndex = firstBracket;
      isObject = false;
    }
  } else if (firstBrace !== -1) {
    startIndex = firstBrace;
    isObject = true;
  } else if (firstBracket !== -1) {
    startIndex = firstBracket;
    isObject = false;
  }

  if (startIndex === -1) return null;

  const open = isObject ? '{' : '[';
  const close = isObject ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      // Balance structure reached root, slice here and ignore trailing logs
      if (depth === 0) return text.slice(startIndex, i + 1).trim();
    }
  }

  return text.slice(startIndex).trim();
}

// Parse JSON data from `omp usage --json`
export function parseUsageJson(stdout: string): { data?: OmpGlobalUsageData; raw?: string; error?: string } {
  const jsonStr = extractJsonSubstring(stdout);
  if (!jsonStr) {
    return { error: tm('electron.usageStats.jsonNotFoundUsage'), raw: stdout };
  }
  try {
    const parsed = JSON.parse(jsonStr) as OmpGlobalUsageData;
    if (!parsed || typeof parsed !== 'object') {
      return { error: tm('electron.usageStats.invalidUsageData'), raw: stdout };
    }
    return { data: parsed, raw: stdout };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: tm('electron.usageStats.parseJsonUsageError', { detail: msg }), raw: stdout };
  }
}

// Parse JSON data from `omp stats --json`
export function parseStatsJson(stdout: string): { data?: OmpGlobalStatsData; raw?: string; error?: string } {
  const jsonStr = extractJsonSubstring(stdout);
  if (!jsonStr) {
    return { error: tm('electron.usageStats.jsonNotFoundStats'), raw: stdout };
  }
  try {
    const parsed = JSON.parse(jsonStr) as OmpGlobalStatsData;
    if (!parsed || typeof parsed !== 'object') {
      return { error: tm('electron.usageStats.invalidStatsData'), raw: stdout };
    }
    return { data: parsed, raw: stdout };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: tm('electron.usageStats.parseJsonStatsError', { detail: msg }), raw: stdout };
  }
}

// Parse JSON data from `omp usage --history --json`
export function parseUsageHistoryJson(stdout: string): { data?: OmpUsageHistoryData; raw?: string; error?: string } {
  const jsonStr = extractJsonSubstring(stdout);
  if (!jsonStr) {
    return { error: tm('electron.usageStats.jsonNotFoundHistory'), raw: stdout };
  }
  try {
    const parsed = JSON.parse(jsonStr) as OmpUsageHistoryData;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) {
      return { error: tm('electron.usageStats.invalidHistoryData'), raw: stdout };
    }
    return { data: parsed, raw: stdout };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: tm('electron.usageStats.parseJsonHistoryError', { detail: msg }), raw: stdout };
  }
}

// Parse JSON data from `omp usage clients --json`
export function parseUsageClientsJson(stdout: string): { data?: OmpUsageClientsData; raw?: string; error?: string } {
  const jsonStr = extractJsonSubstring(stdout);
  if (!jsonStr) {
    return { error: tm('electron.usageStats.jsonNotFoundClients'), raw: stdout };
  }
  try {
    const parsed = JSON.parse(jsonStr) as OmpUsageClientsData;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.clients)) {
      return { error: tm('electron.usageStats.invalidClientsData'), raw: stdout };
    }
    return { data: parsed, raw: stdout };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: tm('electron.usageStats.parseJsonClientsError', { detail: msg }), raw: stdout };
  }
}

// Clear usage stats cache for testing or forced refresh
export function clearUsageStatsCache(): void {
  usageCache = null;
  statsCache = null;
  historyCache.clear();
  clientsCache.clear();
}

// Get current cache status
export function getUsageStatsCacheInfo(): {
  usageCached: boolean;
  statsCached: boolean;
  historyCachedCount: number;
  clientsCachedCount: number;
} {
  const now = Date.now();
  return {
    usageCached: usageCache != null && now - usageCache.timestamp < CACHE_TTL_MS,
    statsCached: statsCache != null && now - statsCache.timestamp < CACHE_TTL_MS,
    historyCachedCount: historyCache.size,
    clientsCachedCount: clientsCache.size,
  };
}

// Fetch global usage limit via `omp usage --json`
export async function fetchGlobalUsage(
  binaryPath?: string,
  options?: FetchGlobalUsageOptions | boolean
): Promise<GlobalUsageResult> {
  const opts: FetchGlobalUsageOptions =
    typeof options === 'boolean' ? { forceRefresh: options } : options || {};
  const isDefaultFetch = !opts.provider && !opts.redact;

  const now = Date.now();
  if (isDefaultFetch && !opts.forceRefresh && usageCache && now - usageCache.timestamp < CACHE_TTL_MS) {
    return { success: true, data: usageCache.data };
  }

  if (!binaryPath) {
    return { success: false, error: tm('electron.usageStats.binaryNotFound') };
  }

  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const args = ['usage', '--json'];
  if (opts.provider) {
    args.push('--provider', opts.provider);
  }
  if (opts.redact) {
    args.push('--redact');
  }

  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, args, {
      env: { ...process.env, PATH: buildExtendedPath(), NO_COLOR: '1' },
      encoding: 'utf-8',
      timeout,
      maxBuffer: 10 * 1024 * 1024,
    });

    const parsed = parseUsageJson(stdout || stderr || '');
    if (parsed.data) {
      if (isDefaultFetch) {
        usageCache = { data: parsed.data, timestamp: Date.now() };
      }
      return { success: true, data: parsed.data, raw: stdout };
    }

    return {
      success: false,
      error: parsed.error || tm('electron.usageStats.cannotReadUsageCli'),
      raw: parsed.raw || stdout || stderr,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    const rawOut = (err?.stdout || '') + (err?.stderr ? `\n${err.stderr}` : '');
    return {
      success: false,
      error: err?.killed || err?.signal === 'SIGTERM'
        ? tm('electron.usageStats.commandTimeout', { seconds: String(timeout / 1000) })
        : tm('electron.usageStats.runUsageFailed', { detail: msg }),
      raw: rawOut.trim() || undefined,
    };
  }
}

// Fetch global stats via `omp stats --json`
export async function fetchGlobalStats(
  binaryPath?: string,
  options?: { forceRefresh?: boolean; timeoutMs?: number }
): Promise<GlobalStatsResult> {
  const now = Date.now();
  if (!options?.forceRefresh && statsCache && now - statsCache.timestamp < CACHE_TTL_MS) {
    return { success: true, data: statsCache.data };
  }

  if (!binaryPath) {
    return { success: false, error: tm('electron.usageStats.binaryNotFound') };
  }

  const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, ['stats', '--json'], {
      env: { ...process.env, PATH: buildExtendedPath(), NO_COLOR: '1' },
      encoding: 'utf-8',
      timeout,
      maxBuffer: 10 * 1024 * 1024,
    });

    const parsed = parseStatsJson(stdout || stderr || '');
    if (parsed.data) {
      statsCache = { data: parsed.data, timestamp: Date.now() };
      return { success: true, data: parsed.data, raw: stdout };
    }

    return {
      success: false,
      error: parsed.error || tm('electron.usageStats.cannotReadStatsCli'),
      raw: parsed.raw || stdout || stderr,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    const rawOut = (err?.stdout || '') + (err?.stderr ? `\n${err.stderr}` : '');
    return {
      success: false,
      error: err?.killed || err?.signal === 'SIGTERM'
        ? tm('electron.usageStats.commandTimeout', { seconds: String(timeout / 1000) })
        : tm('electron.usageStats.runStatsFailed', { detail: msg }),
      raw: rawOut.trim() || undefined,
    };
  }
}

// Fetch usage limit history via `omp usage --history --json`
export async function fetchUsageHistory(
  binaryPath?: string,
  options?: FetchUsageHistoryOptions
): Promise<UsageHistoryResult> {
  const days = options?.days ?? 7;
  const provider = options?.provider;
  const cacheKey = `${days}:${provider || 'all'}`;

  const now = Date.now();
  const cached = historyCache.get(cacheKey);
  if (!options?.forceRefresh && cached && now - cached.timestamp < CACHE_TTL_MS) {
    return { success: true, data: cached.data };
  }

  if (!binaryPath) {
    return { success: false, error: tm('electron.usageStats.binaryNotFound') };
  }

  const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const args = ['usage', '--history', '--days', String(days), '--json'];
  if (provider) {
    args.push('--provider', provider);
  }

  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, args, {
      env: { ...process.env, PATH: buildExtendedPath(), NO_COLOR: '1' },
      encoding: 'utf-8',
      timeout,
      maxBuffer: 10 * 1024 * 1024,
    });

    const parsed = parseUsageHistoryJson(stdout || stderr || '');
    if (parsed.data) {
      historyCache.set(cacheKey, { data: parsed.data, timestamp: Date.now() });
      return { success: true, data: parsed.data, raw: stdout };
    }

    return {
      success: false,
      error: parsed.error || tm('electron.usageStats.cannotReadHistoryCli'),
      raw: parsed.raw || stdout || stderr,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    const rawOut = (err?.stdout || '') + (err?.stderr ? `\n${err.stderr}` : '');
    return {
      success: false,
      error: err?.killed || err?.signal === 'SIGTERM'
        ? tm('electron.usageStats.commandTimeout', { seconds: String(timeout / 1000) })
        : tm('electron.usageStats.runHistoryFailed', { detail: msg }),
      raw: rawOut.trim() || undefined,
    };
  }
}

// Fetch token consumption by client via `omp usage clients --json`
export async function fetchUsageClients(
  binaryPath?: string,
  options?: FetchUsageClientsOptions
): Promise<UsageClientsResult> {
  const days = options?.days ?? 7;
  const cacheKey = `${days}`;

  const now = Date.now();
  const cached = clientsCache.get(cacheKey);
  if (!options?.forceRefresh && cached && now - cached.timestamp < CACHE_TTL_MS) {
    return { success: true, data: cached.data };
  }

  if (!binaryPath) {
    return { success: false, error: tm('electron.usageStats.binaryNotFound') };
  }

  const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const args = ['usage', 'clients', '--days', String(days), '--json'];

  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, args, {
      env: { ...process.env, PATH: buildExtendedPath(), NO_COLOR: '1' },
      encoding: 'utf-8',
      timeout,
      maxBuffer: 10 * 1024 * 1024,
    });

    const parsed = parseUsageClientsJson(stdout || stderr || '');
    if (parsed.data) {
      clientsCache.set(cacheKey, { data: parsed.data, timestamp: Date.now() });
      return { success: true, data: parsed.data, raw: stdout };
    }

    return {
      success: false,
      error: parsed.error || tm('electron.usageStats.cannotReadClientsCli'),
      raw: parsed.raw || stdout || stderr,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    const rawOut = (err?.stdout || '') + (err?.stderr ? `\n${err.stderr}` : '');
    return {
      success: false,
      error: err?.killed || err?.signal === 'SIGTERM'
        ? tm('electron.usageStats.commandTimeout', { seconds: String(timeout / 1000) })
        : tm('electron.usageStats.runClientsFailed', { detail: msg }),
      raw: rawOut.trim() || undefined,
    };
  }
}

// Clear usage cache on engine via `omp usage invalidate`
export async function invalidateUsage(
  binaryPath?: string,
  options?: InvalidateUsageOptions
): Promise<UsageInvalidateResult> {
  if (!binaryPath) {
    return { success: false, error: tm('electron.usageStats.binaryNotFound') };
  }

  const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const args = ['usage', 'invalidate'];
  if (options?.provider) {
    args.push('--provider', options.provider);
  }

  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, args, {
      env: { ...process.env, PATH: buildExtendedPath(), NO_COLOR: '1' },
      encoding: 'utf-8',
      timeout,
      maxBuffer: 10 * 1024 * 1024,
    });

    // Invalidate local in-memory cache
    usageCache = null;
    historyCache.clear();
    clientsCache.clear();

    const outText = (stdout || stderr || '').trim();
    return {
      success: true,
      message: outText || 'Invalidated cached usage reports',
      raw: stdout,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    const rawOut = (err?.stdout || '') + (err?.stderr ? `\n${err.stderr}` : '');
    return {
      success: false,
      error: err?.killed || err?.signal === 'SIGTERM'
        ? tm('electron.usageStats.commandTimeout', { seconds: String(timeout / 1000) })
        : tm('electron.usageStats.runInvalidateFailed', { detail: msg }),
      raw: rawOut.trim() || undefined,
    };
  }
}
