import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import YAML from 'yaml';

const execFileAsync = promisify(execFile);

export interface CustomModelConfig {
  id: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
}

export interface CustomProviderConfig {
  id: string;
  baseUrl: string;
  api?: string;
  apiKey?: string;
  authHeader?: boolean;
  compat?: {
    supportsUsageInStreaming?: boolean;
    [key: string]: unknown;
  };
  models?: CustomModelConfig[];
  hasEnvVar?: boolean;
}

export interface ModelsConfigReadResult {
  providers: CustomProviderConfig[];
  filePath: string;
  isWritable: boolean;
  error?: string;
}

export interface ModelsConfigWriteResult {
  success: boolean;
  filePath?: string;
  backupPath?: string;
  error?: string;
}

export interface LoginProviderItem {
  id: string;
  name: string;
}

let loginProvidersCache: LoginProviderItem[] | null = null;

export function getDefaultModelsConfigPath(): string {
  return path.join(os.homedir(), '.omp', 'agent', 'models.yml');
}

export function parseModelsYaml(yamlContent: string): CustomProviderConfig[] {
  if (!yamlContent || !yamlContent.trim()) {
    return [];
  }

  let parsed: any;
  try {
    parsed = YAML.parse(yamlContent);
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== 'object') {
    return [];
  }

  const providersObj = parsed.providers;
  if (!providersObj || typeof providersObj !== 'object') {
    return [];
  }

  const result: CustomProviderConfig[] = [];

  for (const [providerId, rawConfig] of Object.entries(providersObj)) {
    if (!rawConfig || typeof rawConfig !== 'object') {
      continue;
    }

    const cfg = rawConfig as Record<string, any>;
    const models: CustomModelConfig[] = [];

    if (Array.isArray(cfg.models)) {
      for (const m of cfg.models) {
        if (m && typeof m === 'object' && typeof m.id === 'string') {
          models.push({
            id: m.id,
            name: typeof m.name === 'string' ? m.name : undefined,
            contextWindow: typeof m.contextWindow === 'number' ? m.contextWindow : undefined,
            maxTokens: typeof m.maxTokens === 'number' ? m.maxTokens : undefined,
          });
        }
      }
    }

    const apiKeyEnvName = typeof cfg.apiKey === 'string' ? cfg.apiKey.trim() : undefined;
    const hasEnvVar = apiKeyEnvName ? Boolean(process.env[apiKeyEnvName]) : false;

    result.push({
      id: providerId,
      baseUrl: typeof cfg.baseUrl === 'string' ? cfg.baseUrl : '',
      api: typeof cfg.api === 'string' ? cfg.api : 'openai-completions',
      apiKey: apiKeyEnvName,
      authHeader: typeof cfg.authHeader === 'boolean' ? cfg.authHeader : undefined,
      compat: cfg.compat && typeof cfg.compat === 'object' ? cfg.compat : undefined,
      models: models.length > 0 ? models : undefined,
      hasEnvVar,
    });
  }

  return result;
}

export function serializeModelsYaml(providers: CustomProviderConfig[]): string {
  const providersObj: Record<string, any> = {};

  for (const p of providers) {
    if (!p.id || !p.id.trim()) continue;

    const providerEntry: Record<string, any> = {
      baseUrl: p.baseUrl || '',
      api: p.api || 'openai-completions',
    };

    if (p.apiKey && p.apiKey.trim()) {
      providerEntry.apiKey = p.apiKey.trim();
    }

    if (typeof p.authHeader === 'boolean') {
      providerEntry.authHeader = p.authHeader;
    }

    if (p.compat && typeof p.compat === 'object' && Object.keys(p.compat).length > 0) {
      providerEntry.compat = p.compat;
    }

    if (Array.isArray(p.models) && p.models.length > 0) {
      providerEntry.models = p.models
        .filter((m) => m && m.id && m.id.trim())
        .map((m) => {
          const mObj: Record<string, any> = { id: m.id.trim() };
          if (m.name && m.name.trim()) mObj.name = m.name.trim();
          if (typeof m.contextWindow === 'number' && !isNaN(m.contextWindow)) {
            mObj.contextWindow = m.contextWindow;
          }
          if (typeof m.maxTokens === 'number' && !isNaN(m.maxTokens)) {
            mObj.maxTokens = m.maxTokens;
          }
          return mObj;
        });
    }

    providersObj[p.id.trim()] = providerEntry;
  }

  return YAML.stringify({ providers: providersObj }, { indent: 2 });
}

export async function readModelsConfig(customPath?: string): Promise<ModelsConfigReadResult> {
  const targetPath = customPath || getDefaultModelsConfigPath();

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
    const providers = parseModelsYaml(rawContent);

    return {
      providers,
      filePath: targetPath,
      isWritable,
      error: !isWritable
        ? `Không có quyền ghi vào file ${targetPath}. Hãy chạy lệnh sau trong Terminal để cấp quyền: sudo chown $USER ${targetPath}`
        : undefined,
    };
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return {
        providers: [],
        filePath: targetPath,
        isWritable,
      };
    }

    if (err?.code === 'EACCES' || err?.code === 'EPERM') {
      return {
        providers: [],
        filePath: targetPath,
        isWritable: false,
        error: `Không có quyền truy cập file ${targetPath}. Hãy chạy lệnh sau trong Terminal để cấp quyền: sudo chown $USER ${targetPath}`,
      };
    }

    return {
      providers: [],
      filePath: targetPath,
      isWritable,
      error: `Lỗi đọc cấu hình: ${err?.message || String(err)}`,
    };
  }
}

export async function writeModelsConfig(
  providers: CustomProviderConfig[],
  customPath?: string
): Promise<ModelsConfigWriteResult> {
  const targetPath = customPath || getDefaultModelsConfigPath();
  const backupPath = `${targetPath}.bak`;
  const parentDir = path.dirname(targetPath);

  try {
    await fs.mkdir(parentDir, { recursive: true });

    if (fsSync.existsSync(targetPath)) {
      await fs.copyFile(targetPath, backupPath);
    }

    const yamlContent = serializeModelsYaml(providers);

    // Kiểm tra tính toàn vẹn bằng cách parse lại trước khi ghi
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
        error: `Không có quyền ghi vào file ${targetPath}. Hãy chạy lệnh sau trong Terminal để cấp quyền: sudo chown $USER ${targetPath}`,
      };
    }

    return {
      success: false,
      filePath: targetPath,
      error: `Lỗi khi lưu cấu hình models.yml: ${err?.message || String(err)}`,
    };
  }
}

export function parseLoginProvidersJson(jsonString: string): LoginProviderItem[] {
  try {
    const parsed = JSON.parse(jsonString);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item) => item && typeof item.id === 'string')
        .map((item) => ({
          id: item.id,
          name: typeof item.name === 'string' ? item.name : item.id,
        }));
    }
    return [];
  } catch {
    return [];
  }
}

export function clearLoginProvidersCache(): void {
  loginProvidersCache = null;
}

export async function fetchLoginProviders(
  binaryPath?: string,
  forceRefresh = false
): Promise<{ success: boolean; providers?: LoginProviderItem[]; error?: string }> {
  if (loginProvidersCache && !forceRefresh) {
    return { success: true, providers: loginProvidersCache };
  }

  if (!binaryPath) {
    return {
      success: false,
      providers: [],
      error: 'Không tìm thấy đường dẫn file nhị phân omp để lấy danh sách login services.',
    };
  }

  try {
    const homedir = os.homedir();
    const extendedPath = [
      process.env.PATH,
      '/opt/homebrew/bin',
      '/usr/local/bin',
      path.join(homedir, '.local/bin'),
      path.join(homedir, '.bun/bin'),
      path.join(homedir, '.cargo/bin'),
      path.join(homedir, 'Library/pnpm'),
      '/usr/bin',
      '/bin',
    ]
      .filter(Boolean)
      .join(':');

    const { stdout } = await execFileAsync(binaryPath, ['auth-broker', 'list', '--json'], {
      env: { ...process.env, PATH: extendedPath },
      encoding: 'utf-8',
      timeout: 5000,
    });

    const providers = parseLoginProvidersJson(stdout);
    loginProvidersCache = providers;

    return { success: true, providers };
  } catch (err: any) {
    return {
      success: false,
      providers: [],
      error: `Lỗi khi lấy danh sách auth-broker list: ${err?.message || String(err)}`,
    };
  }
}
