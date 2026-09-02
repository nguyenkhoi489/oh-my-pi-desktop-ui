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

// Trích xuất link chia sẻ từ output CLI
export function extractShareUrl(text: string): string | null {
  if (!text) return null;
  // Tìm url https:// hoặc http://
  const urlMatch = text.match(/https?:\/\/[^\s"'<>\)]+/i);
  if (urlMatch) {
    // Làm sạch ký tự cuối nếu bị dính dấu chấm hoặc ngoặc
    return urlMatch[0].replace(/[.,;:!?]+$/, '');
  }
  return null;
}

// Chia sẻ session qua omp share
export async function shareSession(
  binaryPath: string,
  sessionIdentifier: string,
  options?: ShareSessionOptions
): Promise<ShareSessionResult> {
  const cleanId = String(sessionIdentifier || '').trim();
  if (!cleanId) {
    return { success: false, error: 'Session identifier không được để trống' };
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
      error: err?.message || 'Lỗi khi chia sẻ session',
    };
  }
}

// Tham gia session collab qua omp join
export async function joinCollabSession(
  binaryPath: string,
  link: string
): Promise<JoinSessionResult> {
  const cleanLink = String(link || '').trim();
  if (!cleanLink) {
    return { success: false, error: 'Đường dẫn liên kết không được để trống' };
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
      message: 'Đã tham gia session thành công',
      rawOutput: combined,
    };
  } catch (err: any) {
    const combined = `${err?.stdout || ''}\n${err?.stderr || ''}`.trim();
    return {
      success: false,
      rawOutput: combined || undefined,
      error: err?.message || 'Lỗi khi tham gia session',
    };
  }
}
