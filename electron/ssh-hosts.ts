import { tm } from '../shared/i18n/index.ts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { buildExtendedPath } from './models-config.ts';
import { expandHomeDir } from './launch-args.ts';
import { extractJsonSubstring } from './usage-stats.ts';
import type {
  SshHostAddInput,
  SshHostsListResponse,
  SshHostMutationResponse,
  SshHostsListData,
} from './types.ts';

const execFileAsync = promisify(execFile);

// Regex to validate SSH host name (letters, numbers, hyphen, underscore, dot)
const SSH_HOST_NAME_REGEX = /^[\w.-]+$/;

// Validate SSH host name
export function validateHostName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  return SSH_HOST_NAME_REGEX.test(name.trim());
}

// Build CLI argument list for omp ssh
export function buildSshArgs(
  action: 'list' | 'add' | 'remove',
  opts: {
    name?: string;
    input?: Partial<SshHostAddInput>;
    scope?: 'project' | 'user';
    profile?: string | null;
  } = {}
): string[] {
  const args: string[] = [];

  if (opts.profile) {
    args.push(`--profile=${opts.profile}`);
  }

  args.push('ssh', action);

  if (action === 'list') {
    args.push('--json');
    return args;
  }

  if (action === 'add') {
    const input = opts.input || {};
    const name = (input.name || opts.name || '').trim();
    if (name) {
      args.push(name);
    }
    if (input.host && input.host.trim()) {
      args.push(`--host=${input.host.trim()}`);
    }
    if (input.user && input.user.trim()) {
      args.push(`--user=${input.user.trim()}`);
    }
    if (typeof input.port === 'number' && !Number.isNaN(input.port) && input.port > 0) {
      args.push(`--port=${input.port}`);
    }
    if (input.key && input.key.trim()) {
      args.push(`--key=${expandHomeDir(input.key.trim())}`);
    }
    if (input.desc && input.desc.trim()) {
      args.push(`--desc=${input.desc.trim()}`);
    }
    if (input.compat) {
      args.push('--compat');
    }
    if (input.scope) {
      args.push(`--scope=${input.scope}`);
    }
    args.push('--json');
    return args;
  }

  if (action === 'remove') {
    const name = (opts.name || '').trim();
    if (name) {
      args.push(name);
    }
    if (opts.scope) {
      args.push(`--scope=${opts.scope}`);
    }
    args.push('--json');
    return args;
  }

  return args;
}

// List configured SSH hosts across project and user scopes
export async function listSshHosts(
  binaryPath: string,
  cwd?: string,
  profile?: string | null
): Promise<SshHostsListResponse> {
  const args = buildSshArgs('list', { profile });
  const workingDir = cwd || process.cwd();

  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, args, {
      cwd: workingDir,
      env: {
        ...process.env,
        PATH: buildExtendedPath(),
      },
      timeout: 15_000,
      maxBuffer: 5 * 1024 * 1024,
    });

    const trimmed = (stdout || '').trim();
    if (!trimmed) {
      return {
        success: false,
        error: stderr ? stderr.trim() : tm('electron.ssh.noDataReturned'),
      };
    }

    try {
      const jsonStr = extractJsonSubstring(trimmed) || trimmed;
      const parsed = JSON.parse(jsonStr);
      const data: SshHostsListData = {
        project:
          parsed && typeof parsed.project === 'object' && parsed.project !== null
            ? parsed.project
            : {},
        user:
          parsed && typeof parsed.user === 'object' && parsed.user !== null
            ? parsed.user
            : {},
      };
      return {
        success: true,
        data,
      };
    } catch (parseErr: unknown) {
      const message = parseErr instanceof Error ? parseErr.message : String(parseErr);
      return {
        success: false,
        error: tm('electron.ssh.cannotParseJson', { message }),
      };
    }
  } catch (err: unknown) {
    const errObj = err as { stderr?: string; stdout?: string; message?: string };
    const errMsg = (errObj.stderr || errObj.stdout || errObj.message || tm('electron.ssh.listError'))
      .trim()
      .replace(/^Error:\s*/i, '');
    return {
      success: false,
      error: errMsg,
    };
  }
}

// Add new SSH host configuration
export async function addSshHost(
  binaryPath: string,
  cwd: string | undefined,
  input: SshHostAddInput,
  profile?: string | null
): Promise<SshHostMutationResponse> {
  if (!input || typeof input !== 'object') {
    return {
      success: false,
      error: tm('electron.ssh.invalidConfig'),
    };
  }

  const name = (input.name || '').trim();
  if (!validateHostName(name)) {
    return {
      success: false,
      error: tm('electron.ssh.invalidNameChars'),
    };
  }

  const host = (input.host || '').trim();
  if (!host) {
    return {
      success: false,
      error: tm('electron.ssh.hostAddressEmpty'),
    };
  }

  if (input.port !== undefined && input.port !== null && String(input.port).trim() !== '') {
    const portNum = Number(input.port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      return {
        success: false,
        error: tm('electron.ssh.invalidPort'),
      };
    }
  }

  if (input.scope !== 'project' && input.scope !== 'user') {
    return {
      success: false,
      error: tm('electron.ssh.invalidScope'),
    };
  }

  if (input.key && input.key.trim()) {
    const expandedKey = expandHomeDir(input.key.trim());
    if (!fs.existsSync(expandedKey)) {
      return {
        success: false,
        error: tm('electron.ssh.keyFileNotFound', { key: expandedKey }),
      };
    }
  }

  const args = buildSshArgs('add', { input, profile });
  const workingDir = cwd || process.cwd();

  try {
    const { stdout } = await execFileAsync(binaryPath, args, {
      cwd: workingDir,
      env: {
        ...process.env,
        PATH: buildExtendedPath(),
      },
      timeout: 15_000,
      maxBuffer: 5 * 1024 * 1024,
    });

    return {
      success: true,
      message: (stdout || '').trim() || tm('electron.ssh.addSuccess', { name, scope: input.scope }),
    };
  } catch (err: unknown) {
    const errObj = err as { stderr?: string; stdout?: string; message?: string };
    const errMsg = (errObj.stderr || errObj.stdout || errObj.message || tm('electron.ssh.addError'))
      .trim()
      .replace(/^Error:\s*/i, '');
    return {
      success: false,
      error: errMsg,
    };
  }
}

// Remove SSH host configuration by name and scope
export async function removeSshHost(
  binaryPath: string,
  cwd: string | undefined,
  name: string,
  scope: 'project' | 'user',
  profile?: string | null
): Promise<SshHostMutationResponse> {
  const trimmedName = (name || '').trim();
  if (!validateHostName(trimmedName)) {
    return {
      success: false,
      error: tm('electron.ssh.invalidHostName'),
    };
  }

  if (scope !== 'project' && scope !== 'user') {
    return {
      success: false,
      error: tm('electron.ssh.invalidScope'),
    };
  }

  const args = buildSshArgs('remove', { name: trimmedName, scope, profile });
  const workingDir = cwd || process.cwd();

  try {
    const { stdout } = await execFileAsync(binaryPath, args, {
      cwd: workingDir,
      env: {
        ...process.env,
        PATH: buildExtendedPath(),
      },
      timeout: 15_000,
      maxBuffer: 5 * 1024 * 1024,
    });

    return {
      success: true,
      message: (stdout || '').trim() || tm('electron.ssh.removeSuccess', { name: trimmedName, scope }),
    };
  } catch (err: unknown) {
    const errObj = err as { stderr?: string; stdout?: string; message?: string };
    const errMsg = (errObj.stderr || errObj.stdout || errObj.message || tm('electron.ssh.removeError'))
      .trim()
      .replace(/^Error:\s*/i, '');
    return {
      success: false,
      error: errMsg,
    };
  }
}
