import { tm } from '../shared/i18n/index.ts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildExtendedPath } from './models-config.ts';
import type {
  GrievanceItem,
  GrievancesListOptions,
  GrievancesListResponse,
  GrievancesCleanOptions,
  GrievancesCleanResponse,
  GrievancesPushResponse,
} from './types.ts';

const execFileAsync = promisify(execFile);

// Maximum limit of lines when loading grievances list
export const MAX_GRIEVANCES_LIMIT = 200;
export const DEFAULT_AUTOQA_ENDPOINT = 'https://qa.omp.sh/v1/grievances';

// Validate clean grievances options (requires exactly one of id, tool, all)
export function validateCleanOptions(options: GrievancesCleanOptions): { valid: boolean; error?: string } {
  if (!options) {
    return { valid: false, error: tm('electron.grievances.cleanOptsEmpty') };
  }

  const hasId = options.id !== undefined && options.id !== null;
  const hasTool = typeof options.tool === 'string' && options.tool.trim().length > 0;
  const hasAll = options.all === true;

  const count = (hasId ? 1 : 0) + (hasTool ? 1 : 0) + (hasAll ? 1 : 0);

  if (count === 0) {
    return {
      valid: false,
      error: tm('electron.grievances.specifyOneCondition'),
    };
  }

  if (count > 1) {
    return {
      valid: false,
      error: tm('electron.grievances.mutuallyExclusive'),
    };
  }

  if (hasId) {
    if (typeof options.id !== 'number' || !Number.isInteger(options.id) || options.id <= 0) {
      return {
        valid: false,
        error: tm('electron.grievances.invalidId'),
      };
    }
  }

  return { valid: true };
}

// Build CLI argument list for omp grievances
export function buildGrievancesArgs(
  action: 'list' | 'clean' | 'push',
  opts: {
    limit?: number;
    tool?: string;
    id?: number;
    all?: boolean;
    profile?: string | null;
  } = {}
): string[] {
  const args: string[] = [];

  if (opts.profile) {
    args.push(`--profile=${opts.profile}`);
  }

  args.push('grievances', action);

  if (action === 'list') {
    args.push('--json');
    const limit = typeof opts.limit === 'number' && opts.limit > 0
      ? Math.min(opts.limit, MAX_GRIEVANCES_LIMIT)
      : MAX_GRIEVANCES_LIMIT;
    args.push(`--limit=${limit}`);

    if (opts.tool && opts.tool.trim()) {
      args.push(`--tool=${opts.tool.trim()}`);
    }
    return args;
  }

  if (action === 'clean') {
    if (opts.id !== undefined && opts.id !== null) {
      args.push(`--id=${opts.id}`);
    } else if (opts.tool && opts.tool.trim()) {
      args.push(`--tool=${opts.tool.trim()}`);
    } else if (opts.all) {
      args.push('--all');
    }
    return args;
  }

  if (action === 'push') {
    return args;
  }

  return args;
}

// Parse JSON result from omp grievances list
export function parseGrievancesListJson(stdout: string): GrievanceItem[] {
  const trimmed = (stdout || '').trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item: any) => ({
        id: Number(item.id) || 0,
        model: String(item.model || ''),
        version: String(item.version || ''),
        tool: String(item.tool || ''),
        report: String(item.report || ''),
      }));
    }
    return [];
  } catch {
    return [];
  }
}

// Read push endpoint from dev.autoqaPush.endpoint config
export async function getAutoqaPushEndpoint(
  binaryPath: string,
  profile?: string | null,
  cwd?: string
): Promise<string> {
  const args: string[] = [];
  if (profile) {
    args.push(`--profile=${profile}`);
  }
  args.push('config', 'get', 'dev.autoqaPush.endpoint');

  try {
    const { stdout } = await execFileAsync(binaryPath, args, {
      env: {
        ...process.env,
        PATH: buildExtendedPath(),
      },
      cwd: cwd || undefined,
      timeout: 10000,
    });
    const endpoint = (stdout || '').trim();
    return endpoint || DEFAULT_AUTOQA_ENDPOINT;
  } catch {
    return DEFAULT_AUTOQA_ENDPOINT;
  }
}

// List tool issues (grievances)
export async function listGrievances(
  binaryPath: string,
  options: GrievancesListOptions = {},
  cwd?: string
): Promise<GrievancesListResponse> {
  const args = buildGrievancesArgs('list', options);

  try {
    const [execResult, endpoint] = await Promise.all([
      execFileAsync(binaryPath, args, {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        cwd: cwd || undefined,
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      }),
      getAutoqaPushEndpoint(binaryPath, options.profile, cwd).catch(() => DEFAULT_AUTOQA_ENDPOINT),
    ]);

    const grievances = parseGrievancesListJson(execResult.stdout);
    return {
      success: true,
      grievances,
      endpoint,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.stderr || err?.message || String(err),
    };
  }
}

// Clean grievances by ID, tool, or all
export async function cleanGrievances(
  binaryPath: string,
  options: GrievancesCleanOptions,
  cwd?: string
): Promise<GrievancesCleanResponse> {
  const validation = validateCleanOptions(options);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  const args = buildGrievancesArgs('clean', options);

  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, args, {
      env: {
        ...process.env,
        PATH: buildExtendedPath(),
      },
      cwd: cwd || undefined,
      timeout: 30000,
    });

    const msg = (stdout || '').trim() || (stderr || '').trim() || tm('electron.grievances.cleanSuccess');
    return {
      success: true,
      message: msg,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.stderr || err?.message || String(err),
    };
  }
}

// Push grievances to external QA server (requires user confirmation)
export async function pushGrievances(
  binaryPath: string,
  options: { profile?: string | null } = {},
  cwd?: string
): Promise<GrievancesPushResponse> {
  const args = buildGrievancesArgs('push', options);

  try {
    const endpoint = await getAutoqaPushEndpoint(binaryPath, options.profile, cwd);
    const { stdout, stderr } = await execFileAsync(binaryPath, args, {
      env: {
        ...process.env,
        PATH: buildExtendedPath(),
      },
      cwd: cwd || undefined,
      timeout: 45000,
    });

    const msg = (stdout || '').trim() || (stderr || '').trim() || tm('electron.grievances.pushSuccess');
    return {
      success: true,
      message: msg,
      endpoint,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.stderr || err?.message || String(err),
    };
  }
}
