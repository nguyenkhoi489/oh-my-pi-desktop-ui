import { tm } from '../shared/i18n/index.ts';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Sanitize profile name
export function sanitizeProfileName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
}

// Base OMP directory by profile
function getOmpHome(): string {
  return process.env.OMP_HOME && process.env.OMP_HOME.trim() ? process.env.OMP_HOME.trim() : os.homedir();
}

export function getOmpBaseDir(profile?: string | null): string {
  const cleanProfile = profile?.trim();
  const baseDir = getOmpHome();
  if (!cleanProfile || cleanProfile === 'default') {
    return path.join(baseDir, '.omp');
  }
  return path.join(baseDir, '.omp', 'profiles', sanitizeProfileName(cleanProfile));
}

// Profile session directory by profile and workspace
export function getProfileSessionDir(profile?: string | null, workspacePath?: string | null): string {
  const base = getOmpBaseDir(profile);
  const sessionsBase = path.join(base, 'agent', 'sessions');
  if (!workspacePath) return sessionsBase;

  // Encode path convention --path--
  const sanitizedWs = workspacePath.replace(/^[/\\]+/, '').replace(/[/\\:]+/g, '-');
  return path.join(sessionsBase, `--${sanitizedWs}--`);
}

// List all profiles on system
export async function listProfiles(): Promise<string[]> {
  const profilesDir = path.join(getOmpHome(), '.omp', 'profiles');
  const profiles: string[] = ['default'];

  try {
    const entries = await fs.readdir(profilesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        profiles.push(entry.name);
      }
    }
  } catch {
    // Profiles directory does not exist yet
  }

  return Array.from(new Set(profiles)).sort();
}

// Create new profile
export async function createProfile(name: string): Promise<{ success: boolean; profile?: string; error?: string }> {
  const cleanName = sanitizeProfileName(name);
  if (!cleanName || cleanName === 'default') {
    return { success: false, error: tm('electron.profile.invalidOrDuplicateName') };
  }

  const profileDir = path.join(getOmpHome(), '.omp', 'profiles', cleanName);
  try {
    await fs.mkdir(profileDir, { recursive: true });
    await fs.mkdir(path.join(profileDir, 'agent', 'sessions'), { recursive: true });
    return { success: true, profile: cleanName };
  } catch (err: any) {
    return { success: false, error: err?.message || tm('electron.profile.createDirError') };
  }
}

// Delete profile
export async function deleteProfile(name: string): Promise<{ success: boolean; error?: string }> {
  const cleanName = sanitizeProfileName(name);
  if (!cleanName || cleanName === 'default') {
    return { success: false, error: tm('electron.profile.cannotDeleteDefault') };
  }

  const profileDir = path.join(getOmpHome(), '.omp', 'profiles', cleanName);
  try {
    await fs.rm(profileDir, { recursive: true, force: true });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || tm('electron.profile.deleteError') };
  }
}
