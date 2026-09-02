import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildExtendedPath } from './models-config.ts';
import type {
  OmpGlobalUsageData,
  OmpGlobalStatsData,
  GlobalUsageResult,
  GlobalStatsResult,
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

// Tìm vị trí bắt đầu và kết thúc của JSON payload trong chuỗi output
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
      // Đóng cân bằng cấu trúc gốc thì cắt tới đây, bỏ qua text log phía sau
      if (depth === 0) return text.slice(startIndex, i + 1).trim();
    }
  }

  return text.slice(startIndex).trim();
}

// Parse dữ liệu JSON từ `omp usage --json`
export function parseUsageJson(stdout: string): { data?: OmpGlobalUsageData; raw?: string; error?: string } {
  const jsonStr = extractJsonSubstring(stdout);
  if (!jsonStr) {
    return { error: 'Không tìm thấy cấu trúc JSON trong kết quả omp usage', raw: stdout };
  }
  try {
    const parsed = JSON.parse(jsonStr) as OmpGlobalUsageData;
    if (!parsed || typeof parsed !== 'object') {
      return { error: 'Dữ liệu usage không hợp lệ', raw: stdout };
    }
    return { data: parsed, raw: stdout };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Lỗi parse JSON usage: ${msg}`, raw: stdout };
  }
}

// Parse dữ liệu JSON từ `omp stats --json`
export function parseStatsJson(stdout: string): { data?: OmpGlobalStatsData; raw?: string; error?: string } {
  const jsonStr = extractJsonSubstring(stdout);
  if (!jsonStr) {
    return { error: 'Không tìm thấy cấu trúc JSON trong kết quả omp stats', raw: stdout };
  }
  try {
    const parsed = JSON.parse(jsonStr) as OmpGlobalStatsData;
    if (!parsed || typeof parsed !== 'object') {
      return { error: 'Dữ liệu stats không hợp lệ', raw: stdout };
    }
    return { data: parsed, raw: stdout };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Lỗi parse JSON stats: ${msg}`, raw: stdout };
  }
}

// Xóa cache thống kê phục vụ kiểm thử hoặc làm mới cưỡng bức
export function clearUsageStatsCache(): void {
  usageCache = null;
  statsCache = null;
}

// Lấy thông tin trạng thái cache hiện tại
export function getUsageStatsCacheInfo(): { usageCached: boolean; statsCached: boolean } {
  const now = Date.now();
  return {
    usageCached: usageCache != null && now - usageCache.timestamp < CACHE_TTL_MS,
    statsCached: statsCache != null && now - statsCache.timestamp < CACHE_TTL_MS,
  };
}

// Lấy hạn mức sử dụng toàn cục qua `omp usage --json`
export async function fetchGlobalUsage(
  binaryPath?: string,
  options?: { forceRefresh?: boolean; timeoutMs?: number }
): Promise<GlobalUsageResult> {
  const now = Date.now();
  if (!options?.forceRefresh && usageCache && now - usageCache.timestamp < CACHE_TTL_MS) {
    return { success: true, data: usageCache.data };
  }

  if (!binaryPath) {
    return { success: false, error: 'Không tìm thấy file nhị phân omp' };
  }

  const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, ['usage', '--json'], {
      env: { ...process.env, PATH: buildExtendedPath() },
      encoding: 'utf-8',
      timeout,
      maxBuffer: 10 * 1024 * 1024,
    });

    const parsed = parseUsageJson(stdout || stderr || '');
    if (parsed.data) {
      usageCache = { data: parsed.data, timestamp: Date.now() };
      return { success: true, data: parsed.data, raw: stdout };
    }

    return {
      success: false,
      error: parsed.error || 'Không thể đọc dữ liệu hạn mức từ CLI',
      raw: parsed.raw || stdout || stderr,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    const rawOut = (err?.stdout || '') + (err?.stderr ? `\n${err.stderr}` : '');
    return {
      success: false,
      error: err?.killed || err?.signal === 'SIGTERM'
        ? `Quá thời gian thực thi lệnh (${timeout / 1000}s)`
        : `Lỗi khi chạy omp usage: ${msg}`,
      raw: rawOut.trim() || undefined,
    };
  }
}

// Lấy thống kê toàn cục qua `omp stats --json`
export async function fetchGlobalStats(
  binaryPath?: string,
  options?: { forceRefresh?: boolean; timeoutMs?: number }
): Promise<GlobalStatsResult> {
  const now = Date.now();
  if (!options?.forceRefresh && statsCache && now - statsCache.timestamp < CACHE_TTL_MS) {
    return { success: true, data: statsCache.data };
  }

  if (!binaryPath) {
    return { success: false, error: 'Không tìm thấy file nhị phân omp' };
  }

  const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, ['stats', '--json'], {
      env: { ...process.env, PATH: buildExtendedPath() },
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
      error: parsed.error || 'Không thể đọc dữ liệu thống kê từ CLI',
      raw: parsed.raw || stdout || stderr,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    const rawOut = (err?.stdout || '') + (err?.stderr ? `\n${err.stderr}` : '');
    return {
      success: false,
      error: err?.killed || err?.signal === 'SIGTERM'
        ? `Quá thời gian thực thi lệnh (${timeout / 1000}s)`
        : `Lỗi khi chạy omp stats: ${msg}`,
      raw: rawOut.trim() || undefined,
    };
  }
}
