import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildExtendedPath } from './models-config.ts';
import { extractJsonSubstring } from './usage-stats.ts';
import type {
  EngineConfigEntry,
  FetchEngineConfigOptions,
  SetEngineConfigOptions,
  ResetEngineConfigOptions,
  EngineConfigPathOptions,
  EngineConfigListResult,
  EngineConfigMutationResult,
  EngineConfigPathResult,
} from './types.ts';

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 60_000;
const MAX_BUFFER = 10 * 1024 * 1024;

interface CacheEntry {
  entries: EngineConfigEntry[];
  timestamp: number;
}

const configCache = new Map<string, CacheEntry>();

function getCacheKey(profile?: string): string {
  return profile && profile.trim() ? profile.trim() : '__default__';
}

// Phân tích output JSON từ omp config list --json thành danh sách entry
export function parseConfigListJson(stdout: string): EngineConfigEntry[] {
  if (!stdout || !stdout.trim()) return [];

  function transform(raw: Record<string, unknown>): EngineConfigEntry[] {
    const entries: EngineConfigEntry[] = [];
    for (const [key, item] of Object.entries(raw)) {
      if (!item || typeof item !== 'object') continue;
      const typedItem = item as Record<string, unknown>;
      entries.push({
        key,
        value: typedItem.value,
        type: (typedItem.type as string) || 'string',
        description: typeof typedItem.description === 'string' ? typedItem.description : '',
        ...(typedItem.redacted ? { redacted: true } : {}),
      });
    }
    return entries;
  }

  try {
    const direct = JSON.parse(stdout.trim());
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
      return transform(direct as Record<string, unknown>);
    }
  } catch {
    // Có thể có log hoặc banner xung quanh chuỗi JSON
  }

  const firstBrace = stdout.indexOf('{');
  const lastBrace = stdout.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const candidate = stdout.slice(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return transform(parsed as Record<string, unknown>);
      }
    } catch {
      // Bỏ qua nếu candidate không hợp lệ
    }
  }

  return [];
}

// Trích xuất các tùy chọn enum từ output dạng văn bản của omp config list
export function parseEnumOptions(textListing: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!textListing) return map;

  const pattern = /^\s*([\w.\-]+)\s*=\s*.*?\(([^()]*\|[^()]*)\)\s*$/gm;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(textListing)) !== null) {
    const key = match[1];
    const optionsRaw = match[2];
    const options = optionsRaw
      .split('|')
      .map((opt) => opt.trim())
      .filter(Boolean);

    if (key && options.length > 0) {
      map.set(key, options);
    }
  }

  return map;
}

// Gộp danh sách tùy chọn enum vào từng entry cấu hình tương ứng
export function mergeEnumOptions(
  entries: EngineConfigEntry[],
  enumMap: Map<string, string[]>
): EngineConfigEntry[] {
  for (const entry of entries) {
    const options = enumMap.get(entry.key);
    if (options) {
      entry.enumOptions = options;
    }
  }
  return entries;
}

// Lấy danh sách toàn bộ cấu hình engine với cơ chế cache
export async function fetchEngineConfig(
  binaryPath = 'omp',
  options?: FetchEngineConfigOptions
): Promise<EngineConfigListResult> {
  const cacheKey = getCacheKey(options?.profile);
  const now = Date.now();
  const cached = configCache.get(cacheKey);

  if (!options?.forceRefresh && cached && now - cached.timestamp < CACHE_TTL_MS) {
    return { success: true, entries: cached.entries };
  }

  const profileArgs: string[] = [];
  if (options?.profile && options.profile.trim()) {
    profileArgs.push('--profile', options.profile.trim());
  }

  const execOptions = {
    env: { ...process.env, PATH: buildExtendedPath(), NO_COLOR: '1' },
    encoding: 'utf-8' as const,
    timeout: DEFAULT_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  };

  try {
    const [jsonResult, textResult] = await Promise.all([
      execFileAsync(binaryPath, [...profileArgs, 'config', 'list', '--json'], execOptions),
      execFileAsync(binaryPath, [...profileArgs, 'config', 'list'], execOptions).catch(() => ({
        stdout: '',
        stderr: '',
      })),
    ]);

    const entries = parseConfigListJson(jsonResult.stdout);
    if (entries.length === 0 && jsonResult.stdout.trim().length > 0) {
      return { success: false, error: 'Không thể phân tích dữ liệu cấu hình engine' };
    }

    if (textResult.stdout) {
      const enumMap = parseEnumOptions(textResult.stdout);
      mergeEnumOptions(entries, enumMap);
    }

    configCache.set(cacheKey, { entries, timestamp: now });
    return { success: true, entries };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg || 'Lỗi khi đọc cấu hình engine' };
  }
}

// Cập nhật giá trị cấu hình theo key
export async function setEngineConfigValue(
  binaryPath = 'omp',
  key: string,
  value: string,
  options?: SetEngineConfigOptions
): Promise<EngineConfigMutationResult> {
  if (!key || typeof key !== 'string' || !key.trim() || /\s/.test(key.trim())) {
    return { success: false, error: 'Tên cấu hình không hợp lệ' };
  }

  const sanitizedKey = key.trim();
  const profileArgs: string[] = [];
  if (options?.profile && options.profile.trim()) {
    profileArgs.push('--profile', options.profile.trim());
  }

  const execOptions = {
    env: { ...process.env, PATH: buildExtendedPath(), NO_COLOR: '1' },
    encoding: 'utf-8' as const,
    timeout: DEFAULT_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  };

  try {
    await execFileAsync(
      binaryPath,
      [...profileArgs, 'config', 'set', sanitizedKey, String(value ?? '')],
      execOptions
    );
    clearEngineConfigCache(options?.profile);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg || 'Lỗi khi cập nhật cấu hình engine' };
  }
}

// Đặt lại giá trị mặc định cho cấu hình theo key
export async function resetEngineConfigValue(
  binaryPath = 'omp',
  key: string,
  options?: ResetEngineConfigOptions
): Promise<EngineConfigMutationResult> {
  if (!key || typeof key !== 'string' || !key.trim() || /\s/.test(key.trim())) {
    return { success: false, error: 'Tên cấu hình không hợp lệ' };
  }

  const sanitizedKey = key.trim();
  const profileArgs: string[] = [];
  if (options?.profile && options.profile.trim()) {
    profileArgs.push('--profile', options.profile.trim());
  }

  const execOptions = {
    env: { ...process.env, PATH: buildExtendedPath(), NO_COLOR: '1' },
    encoding: 'utf-8' as const,
    timeout: DEFAULT_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  };

  try {
    await execFileAsync(binaryPath, [...profileArgs, 'config', 'reset', sanitizedKey], execOptions);
    clearEngineConfigCache(options?.profile);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg || 'Lỗi khi đặt lại cấu hình engine' };
  }
}

// Lấy đường dẫn thư mục lưu trữ cấu hình engine
export async function getEngineConfigPath(
  binaryPath = 'omp',
  options?: EngineConfigPathOptions
): Promise<EngineConfigPathResult> {
  const profileArgs: string[] = [];
  if (options?.profile && options.profile.trim()) {
    profileArgs.push('--profile', options.profile.trim());
  }

  const execOptions = {
    env: { ...process.env, PATH: buildExtendedPath(), NO_COLOR: '1' },
    encoding: 'utf-8' as const,
    timeout: DEFAULT_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  };

  try {
    const { stdout } = await execFileAsync(
      binaryPath,
      [...profileArgs, 'config', 'path'],
      execOptions
    );
    return { success: true, path: stdout.trim() };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg || 'Lỗi khi lấy đường dẫn cấu hình engine' };
  }
}

// Xóa cache cấu hình engine
export function clearEngineConfigCache(profile?: string): void {
  if (profile !== undefined) {
    configCache.delete(getCacheKey(profile));
  } else {
    configCache.clear();
  }
}

// Kiểm tra trạng thái cache cho profile chỉ định
export function getEngineConfigCacheInfo(profile?: string): {
  hasCached: boolean;
  ageMs?: number;
} {
  const cached = configCache.get(getCacheKey(profile));
  if (!cached) {
    return { hasCached: false };
  }
  return {
    hasCached: true,
    ageMs: Date.now() - cached.timestamp,
  };
}
