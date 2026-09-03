import { tm } from '../shared/i18n/index.ts';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import YAML from 'yaml';

export interface ModelRolesReadResult {
  roles: Record<string, string>;
  filePath: string;
  isWritable: boolean;
  error?: string;
}

export interface ModelRolesWriteResult {
  success: boolean;
  filePath?: string;
  backupPath?: string;
  error?: string;
}

export function getDefaultAgentConfigPath(): string {
  return path.join(os.homedir(), '.omp', 'agent', 'config.yml');
}

export function parseModelRolesYaml(yamlContent: string): Record<string, string> {
  if (!yamlContent || !yamlContent.trim()) {
    return {};
  }

  let parsed: any;
  try {
    parsed = YAML.parse(yamlContent);
  } catch {
    return {};
  }

  const rolesObj = parsed?.modelRoles;
  if (!rolesObj || typeof rolesObj !== 'object' || Array.isArray(rolesObj)) {
    return {};
  }

  const roles: Record<string, string> = {};
  for (const [role, model] of Object.entries(rolesObj)) {
    if (role.trim() && typeof model === 'string' && model.trim()) {
      roles[role.trim()] = model.trim();
    }
  }
  return roles;
}

export async function readModelRolesConfig(customPath?: string): Promise<ModelRolesReadResult> {
  const targetPath = customPath || getDefaultAgentConfigPath();

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
    return {
      roles: parseModelRolesYaml(rawContent),
      filePath: targetPath,
      isWritable,
      error: !isWritable
        ? tm('electron.roles.permissionError', { path: targetPath })
        : undefined,
    };
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return { roles: {}, filePath: targetPath, isWritable };
    }

    if (err?.code === 'EACCES' || err?.code === 'EPERM') {
      return {
        roles: {},
        filePath: targetPath,
        isWritable: false,
        error: tm('electron.roles.permissionError', { path: targetPath }),
      };
    }

    return {
      roles: {},
      filePath: targetPath,
      isWritable,
      error: tm('electron.roles.readConfigError', { detail: err?.message || String(err) }),
    };
  }
}

// Override only modelRoles key, preserve other keys and comments in config.yml
export async function writeModelRolesConfig(
  roles: Record<string, string>,
  customPath?: string
): Promise<ModelRolesWriteResult> {
  const targetPath = customPath || getDefaultAgentConfigPath();
  const backupPath = `${targetPath}.bak`;
  const parentDir = path.dirname(targetPath);

  const cleanRoles: Record<string, string> = {};
  for (const [role, model] of Object.entries(roles || {})) {
    if (role.trim() && typeof model === 'string' && model.trim()) {
      cleanRoles[role.trim()] = model.trim();
    }
  }

  try {
    await fs.mkdir(parentDir, { recursive: true });

    let rawContent = '';
    if (fsSync.existsSync(targetPath)) {
      rawContent = await fs.readFile(targetPath, 'utf-8');
      await fs.copyFile(targetPath, backupPath);
    }

    const doc = YAML.parseDocument(rawContent || '{}');
    if (doc.errors && doc.errors.length > 0) {
      return {
        success: false,
        filePath: targetPath,
        error: tm('electron.roles.syntaxError', { detail: doc.errors[0].message }),
      };
    }

    if (Object.keys(cleanRoles).length > 0) {
      doc.set('modelRoles', doc.createNode(cleanRoles));
    } else {
      doc.delete('modelRoles');
    }

    const yamlContent = doc.toString();

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
        error: tm('electron.roles.permissionError', { path: targetPath }),
      };
    }

    return {
      success: false,
      filePath: targetPath,
      error: tm('electron.roles.saveConfigError', { detail: err?.message || String(err) }),
    };
  }
}
