import { tm } from '../shared/i18n/index.ts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildExtendedPath } from './models-config.ts';

const execFileAsync = promisify(execFile);

export interface ShareSessionOptions {
  gist?: boolean;
}

export interface ShareSessionResult {
  success: boolean;
  url?: string;
  rawOutput?: string;
  error?: string;
}

export interface JoinSessionResult {
  success: boolean;
  message?: string;
  rawOutput?: string;
  error?: string;
}

// Extract share URL from CLI output
export function extractShareUrl(text: string): string | null {
  if (!text) return null;
  // Find https:// or http:// url
  const urlMatch = text.match(/https?:\/\/[^\s"'<>\)]+/i);
  if (urlMatch) {
    // Trim trailing punctuation
    return urlMatch[0].replace(/[.,;:!?]+$/, '');
  }
  return null;
}

// Share session via omp share
export async function shareSession(
  binaryPath: string,
  sessionIdentifier: string,
  options?: ShareSessionOptions
): Promise<ShareSessionResult> {
  const cleanId = String(sessionIdentifier || '').trim();
  if (!cleanId) {
    return { success: false, error: tm('electron.collab.sessionEmpty') };
  }

  const args = ['share', cleanId];
  if (options?.gist) {
    args.push('--gist');
  }

  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, args, {
      env: {
        ...process.env,
        PATH: buildExtendedPath(),
      },
      timeout: 30000,
      encoding: 'utf-8',
    });

    const combined = `${stdout}\n${stderr}`.trim();
    const url = extractShareUrl(combined);

    if (url) {
      return {
        success: true,
        url,
        rawOutput: combined,
      };
    }

    return {
      success: true,
      rawOutput: combined,
    };
  } catch (err: any) {
    const combined = `${err?.stdout || ''}\n${err?.stderr || ''}`.trim();
    const url = extractShareUrl(combined);
    if (url) {
      return {
        success: true,
        url,
        rawOutput: combined,
      };
    }

    return {
      success: false,
      rawOutput: combined || undefined,
      error: err?.message || tm('electron.collab.shareFailed'),
    };
  }
}

// Join collab session via omp join
export async function joinCollabSession(
  binaryPath: string,
  link: string
): Promise<JoinSessionResult> {
  const cleanLink = String(link || '').trim();
  if (!cleanLink) {
    return { success: false, error: tm('electron.collab.linkEmpty') };
  }

  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, ['join', cleanLink], {
      env: {
        ...process.env,
        PATH: buildExtendedPath(),
      },
      timeout: 30000,
      encoding: 'utf-8',
    });

    const combined = `${stdout}\n${stderr}`.trim();
    return {
      success: true,
      message: tm('electron.collab.joinSuccess'),
      rawOutput: combined,
    };
  } catch (err: any) {
    const combined = `${err?.stdout || ''}\n${err?.stderr || ''}`.trim();
    return {
      success: false,
      rawOutput: combined || undefined,
      error: err?.message || tm('electron.collab.joinFailed'),
    };
  }
}
