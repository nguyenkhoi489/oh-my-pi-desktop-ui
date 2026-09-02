import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Chuẩn hóa tên profile
export function sanitizeProfileName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
}

// Lấy thư mục gốc OMP theo profile
export function getOmpBaseDir(profile?: string | null): string {
  const cleanProfile = profile?.trim();
  if (!cleanProfile || cleanProfile === 'default') {
    return path.join(os.homedir(), '.omp');
  }
  return path.join(os.homedir(), '.omp', 'profiles', sanitizeProfileName(cleanProfile));
}

// Lấy thư mục sessions theo profile và workspace
export function getProfileSessionDir(profile?: string | null, workspacePath?: string | null): string {
  const base = getOmpBaseDir(profile);
  const sessionsBase = path.join(base, 'agent', 'sessions');
  if (!workspacePath) return sessionsBase;

  // Mã hóa path theo convention --path--
  const sanitizedWs = workspacePath.replace(/^[/\\]+/, '').replace(/[/\\:]+/g, '-');
  return path.join(sessionsBase, `--${sanitizedWs}--`);
}

// Liệt kê tất cả profiles có trên hệ thống
export async function listProfiles(): Promise<string[]> {
  const profilesDir = path.join(os.homedir(), '.omp', 'profiles');
  const profiles: string[] = ['default'];

  try {
    const entries = await fs.readdir(profilesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        profiles.push(entry.name);
      }
    }
  } catch {
    // Thư mục profiles chưa tồn tại
  }

  return Array.from(new Set(profiles)).sort();
}

// Tạo profile mới
export async function createProfile(name: string): Promise<{ success: boolean; profile?: string; error?: string }> {
  const cleanName = sanitizeProfileName(name);
  if (!cleanName || cleanName === 'default') {
    return { success: false, error: 'Tên profile không hợp lệ hoặc trùng với default' };
  }

  const profileDir = path.join(os.homedir(), '.omp', 'profiles', cleanName);
  try {
    await fs.mkdir(profileDir, { recursive: true });
    await fs.mkdir(path.join(profileDir, 'agent', 'sessions'), { recursive: true });
    return { success: true, profile: cleanName };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Lỗi tạo thư mục profile' };
  }
}

// Xoá profile
export async function deleteProfile(name: string): Promise<{ success: boolean; error?: string }> {
  const cleanName = sanitizeProfileName(name);
  if (!cleanName || cleanName === 'default') {
    return { success: false, error: 'Không thể xoá profile mặc định (default)' };
  }

  const profileDir = path.join(os.homedir(), '.omp', 'profiles', cleanName);
  try {
    await fs.rm(profileDir, { recursive: true, force: true });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Lỗi khi xoá profile' };
  }
}
