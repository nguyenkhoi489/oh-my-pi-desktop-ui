import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { buildExtendedPath } from './models-config.ts';

const execFileAsync = promisify(execFile);

export interface OmpPluginInfo {
  name: string;
  version?: string;
  description?: string;
  source?: 'npm' | 'marketplace' | 'local' | string;
  enabled?: boolean;
  scope?: 'user' | 'project' | string;
  path?: string;
  features?: string[];
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OmpPluginDoctorItem {
  name: string;
  status: 'ok' | 'warning' | 'error' | string;
  message: string;
}

export interface OmpPluginFeatureItem {
  name: string;
  enabled?: boolean;
  description?: string;
}

export interface OmpMarketplaceItem {
  name: string;
  source: string;
}

export interface OmpDiscoverPluginItem {
  name: string;
  version?: string;
  description?: string;
  marketplace?: string;
  source?: string;
}

export interface OmpAgentItem {
  id: string;
  name: string;
  description?: string;
  scope: 'bundled' | 'user' | 'project';
  path?: string;
}

// Helper loại bỏ ANSI codes và parse JSON an toàn hoặc trả về fallback khi rỗng
export function parseJsonOrEmpty<T = unknown>(stdout: string, fallback: T): T {
  if (!stdout) return fallback;
  const clean = stdout.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
  if (!clean) return fallback;
  if (
    clean.startsWith('No plugins available') ||
    clean.startsWith('No marketplaces configured') ||
    clean.startsWith('All marketplace plugins are up to date.')
  ) {
    return fallback;
  }
  try {
    return JSON.parse(clean) as T;
  } catch {
    return fallback;
  }
}

function getErrorMessage(err: unknown, defaultMessage: string): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === 'string' && err) {
    return err;
  }
  return defaultMessage;
}

export class ExtensionManager {
  // 1. Danh sách plugins
  public async listPlugins(
    binaryPath: string,
    options?: { local?: boolean }
  ): Promise<{ success: boolean; plugins?: OmpPluginInfo[]; error?: string }> {
    try {
      const args = ['plugin', 'list'];
      if (options?.local) {
        args.push('--local');
      }
      args.push('--json');

      const { stdout } = await execFileAsync(binaryPath, args, {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        timeout: 15000,
        encoding: 'utf-8',
      });

      const parsed = parseJsonOrEmpty<Record<string, unknown> | unknown[]>(stdout, {});
      const plugins: OmpPluginInfo[] = [];

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'object' && item !== null && 'name' in item) {
            plugins.push(item as OmpPluginInfo);
          }
        }
      } else if (typeof parsed === 'object' && parsed !== null) {
        const pObj = parsed as Record<string, unknown>;
        if (Array.isArray(pObj.npm)) {
          for (const item of pObj.npm) {
            if (typeof item === 'string') {
              plugins.push({ name: item, source: 'npm' });
            } else if (typeof item === 'object' && item !== null) {
              const obj = item as Record<string, unknown>;
              plugins.push({
                name: typeof obj.name === 'string' ? obj.name : '',
                source: 'npm',
                ...obj,
              });
            }
          }
        }
        if (Array.isArray(pObj.marketplace)) {
          for (const item of pObj.marketplace) {
            if (typeof item === 'string') {
              plugins.push({ name: item, source: 'marketplace' });
            } else if (typeof item === 'object' && item !== null) {
              const obj = item as Record<string, unknown>;
              plugins.push({
                name: typeof obj.name === 'string' ? obj.name : '',
                source: 'marketplace',
                ...obj,
              });
            }
          }
        }
        if (Array.isArray(pObj.local)) {
          for (const item of pObj.local) {
            if (typeof item === 'string') {
              plugins.push({ name: item, source: 'local' });
            } else if (typeof item === 'object' && item !== null) {
              const obj = item as Record<string, unknown>;
              plugins.push({
                name: typeof obj.name === 'string' ? obj.name : '',
                source: 'local',
                ...obj,
              });
            }
          }
        }
      }

      return { success: true, plugins };
    } catch (err: unknown) {
      return {
        success: false,
        plugins: [],
        error: getErrorMessage(err, 'Lỗi khi liệt kê plugins'),
      };
    }
  }

  // 2. Cài đặt plugin
  public async installPlugin(
    binaryPath: string,
    target: string,
    options?: { scope?: 'user' | 'project'; force?: boolean; local?: boolean; dryRun?: boolean }
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const cleanTarget = String(target || '').trim();
    if (!cleanTarget) {
      return { success: false, error: 'Tên package hoặc plugin không được để trống' };
    }

    const args = ['plugin', 'install', cleanTarget];
    if (options?.scope) {
      args.push(`--scope=${options.scope}`);
    }
    if (options?.force) {
      args.push('--force');
    }
    if (options?.dryRun) {
      args.push('--dry-run');
    }
    if (options?.local) {
      args.push('--local');
    }

    try {
      const { stdout, stderr } = await execFileAsync(binaryPath, args, {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        timeout: 60000,
        encoding: 'utf-8',
      });

      const output = `${stdout}\n${stderr}`.trim();
      return { success: true, message: output || `Đã cài đặt plugin ${cleanTarget} thành công` };
    } catch (err: unknown) {
      return {
        success: false,
        error: getErrorMessage(err, `Lỗi khi cài đặt plugin ${cleanTarget}`),
      };
    }
  }

  // 3. Gỡ cài đặt plugin
  public async uninstallPlugin(
    binaryPath: string,
    target: string,
    options?: { scope?: 'user' | 'project'; local?: boolean; dryRun?: boolean }
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const cleanTarget = String(target || '').trim();
    if (!cleanTarget) {
      return { success: false, error: 'Tên plugin không được để trống' };
    }

    const args = ['plugin', 'uninstall', cleanTarget];
    if (options?.scope) {
      args.push(`--scope=${options.scope}`);
    }
    if (options?.dryRun) {
      args.push('--dry-run');
    }
    if (options?.local) {
      args.push('--local');
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

      const output = `${stdout}\n${stderr}`.trim();
      return { success: true, message: output || `Đã gỡ cài đặt plugin ${cleanTarget}` };
    } catch (err: unknown) {
      return {
        success: false,
        error: getErrorMessage(err, `Lỗi khi gỡ cài đặt plugin ${cleanTarget}`),
      };
    }
  }

  // 4. Link local plugin
  public async linkPlugin(
    binaryPath: string,
    localPath: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const cleanPath = String(localPath || '').trim();
    if (!cleanPath) {
      return { success: false, error: 'Đường dẫn thư mục plugin không được để trống' };
    }

    try {
      const { stdout, stderr } = await execFileAsync(binaryPath, ['plugin', 'link', cleanPath], {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        timeout: 30000,
        encoding: 'utf-8',
      });

      const output = `${stdout}\n${stderr}`.trim();
      return { success: true, message: output || `Đã liên kết plugin từ ${cleanPath}` };
    } catch (err: unknown) {
      return {
        success: false,
        error: getErrorMessage(err, `Lỗi khi liên kết plugin từ ${cleanPath}`),
      };
    }
  }

  // 5. Doctor kiểm tra plugin health
  public async doctor(
    binaryPath: string,
    options?: { fix?: boolean; local?: boolean }
  ): Promise<{ success: boolean; items?: OmpPluginDoctorItem[]; message?: string; error?: string }> {
    const args = ['plugin', 'doctor'];
    if (options?.fix) {
      args.push('--fix');
    }
    if (options?.local) {
      args.push('--local');
    }
    args.push('--json');

    try {
      const { stdout, stderr } = await execFileAsync(binaryPath, args, {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        timeout: 30000,
        encoding: 'utf-8',
      });

      const items = parseJsonOrEmpty<OmpPluginDoctorItem[]>(stdout, []);
      return {
        success: true,
        items: Array.isArray(items) ? items : [],
        message: `${stdout}\n${stderr}`.trim(),
      };
    } catch (err: unknown) {
      return {
        success: false,
        items: [],
        error: getErrorMessage(err, 'Lỗi khi chạy plugin doctor'),
      };
    }
  }

  // 6. Features của plugin
  public async features(
    binaryPath: string,
    pluginName: string,
    options?: { local?: boolean }
  ): Promise<{ success: boolean; features?: OmpPluginFeatureItem[]; rawOutput?: string; error?: string }> {
    const cleanName = String(pluginName || '').trim();
    if (!cleanName) {
      return { success: false, error: 'Tên plugin không được để trống' };
    }

    const args = ['plugin', 'features', cleanName];
    if (options?.local) {
      args.push('--local');
    }
    args.push('--json');

    try {
      const { stdout } = await execFileAsync(binaryPath, args, {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        timeout: 15000,
        encoding: 'utf-8',
      });

      const parsed = parseJsonOrEmpty<unknown>(stdout, []);
      const features: OmpPluginFeatureItem[] = [];

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'string') {
            features.push({ name: item, enabled: true });
          } else if (typeof item === 'object' && item !== null) {
            const obj = item as Record<string, unknown>;
            const fName = typeof obj.name === 'string' ? obj.name : typeof obj.id === 'string' ? obj.id : '';
            if (fName) {
              features.push({
                name: fName,
                enabled: typeof obj.enabled === 'boolean' ? obj.enabled : true,
                description: typeof obj.description === 'string' ? obj.description : undefined,
              });
            }
          }
        }
      } else if (typeof parsed === 'object' && parsed !== null) {
        for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
          features.push({
            name: key,
            enabled: Boolean(val),
          });
        }
      }

      return { success: true, features, rawOutput: stdout };
    } catch (err: unknown) {
      return {
        success: false,
        features: [],
        error: getErrorMessage(err, `Lỗi khi lấy danh sách features của plugin ${cleanName}`),
      };
    }
  }

  // 7. Toggle feature của plugin (--enable / --disable)
  public async toggleFeature(
    binaryPath: string,
    pluginName: string,
    feature: string,
    enabled: boolean,
    options?: { local?: boolean }
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const cleanName = String(pluginName || '').trim();
    const cleanFeature = String(feature || '').trim();
    if (!cleanName || !cleanFeature) {
      return { success: false, error: 'Tên plugin và feature không được để trống' };
    }

    const args = [
      'plugin',
      'features',
      cleanName,
      enabled ? `--enable=${cleanFeature}` : `--disable=${cleanFeature}`,
    ];
    if (options?.local) {
      args.push('--local');
    }

    try {
      const { stdout, stderr } = await execFileAsync(binaryPath, args, {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        timeout: 15000,
        encoding: 'utf-8',
      });

      const output = `${stdout}\n${stderr}`.trim();
      return {
        success: true,
        message: output || `Đã ${enabled ? 'bật' : 'tắt'} feature ${cleanFeature} cho plugin ${cleanName}`,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: getErrorMessage(err, `Lỗi khi chuyển trạng thái feature ${cleanFeature}`),
      };
    }
  }

  // 8. Cấu hình plugin (--set k=v)
  public async setPluginConfig(
    binaryPath: string,
    pluginName: string,
    pairs: Array<{ key: string; value: string }>,
    options?: { local?: boolean }
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const cleanName = String(pluginName || '').trim();
    if (!cleanName) {
      return { success: false, error: 'Tên plugin không được để trống' };
    }
    if (!Array.isArray(pairs) || pairs.length === 0) {
      return { success: false, error: 'Danh sách cấu hình không được để trống' };
    }

    const args = ['plugin', 'config', cleanName];
    for (const pair of pairs) {
      if (pair?.key) {
        args.push(`--set=${pair.key}=${pair.value ?? ''}`);
      }
    }
    if (options?.local) {
      args.push('--local');
    }

    try {
      const { stdout, stderr } = await execFileAsync(binaryPath, args, {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        timeout: 15000,
        encoding: 'utf-8',
      });

      const output = `${stdout}\n${stderr}`.trim();
      return {
        success: true,
        message: output || `Đã cập nhật cấu hình cho plugin ${cleanName}`,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: getErrorMessage(err, `Lỗi khi cập nhật cấu hình plugin ${cleanName}`),
      };
    }
  }

  // 9. Lấy cấu hình plugin
  public async getPluginConfig(
    binaryPath: string,
    pluginName: string,
    options?: { local?: boolean }
  ): Promise<{ success: boolean; config?: Record<string, unknown>; rawOutput?: string; error?: string }> {
    const cleanName = String(pluginName || '').trim();
    if (!cleanName) {
      return { success: false, error: 'Tên plugin không được để trống' };
    }

    const args = ['plugin', 'config', cleanName];
    if (options?.local) {
      args.push('--local');
    }
    args.push('--json');

    try {
      const { stdout } = await execFileAsync(binaryPath, args, {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        timeout: 15000,
        encoding: 'utf-8',
      });

      const parsed = parseJsonOrEmpty<Record<string, unknown>>(stdout, {});
      return { success: true, config: parsed, rawOutput: stdout };
    } catch (err: unknown) {
      return {
        success: false,
        config: {},
        error: getErrorMessage(err, `Lỗi khi lấy cấu hình của plugin ${cleanName}`),
      };
    }
  }

  // 10. Bật / Tắt plugin (enable / disable)
  public async togglePlugin(
    binaryPath: string,
    name: string,
    enabled: boolean,
    options?: { local?: boolean }
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const cleanName = String(name || '').trim();
    if (!cleanName) {
      return { success: false, error: 'Tên plugin không được để trống' };
    }

    const args = ['plugin', enabled ? 'enable' : 'disable', cleanName];
    if (options?.local) {
      args.push('--local');
    }

    try {
      const { stdout, stderr } = await execFileAsync(binaryPath, args, {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        timeout: 15000,
        encoding: 'utf-8',
      });

      const output = `${stdout}\n${stderr}`.trim();
      return {
        success: true,
        message: output || `Đã ${enabled ? 'bật' : 'tắt'} plugin ${cleanName}`,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: getErrorMessage(err, `Lỗi khi thay đổi trạng thái plugin ${cleanName}`),
      };
    }
  }

  // 11. Upgrade plugin
  public async upgrade(
    binaryPath: string,
    options?: { name?: string; dryRun?: boolean; local?: boolean }
  ): Promise<{ success: boolean; message?: string; rawOutput?: string; error?: string }> {
    const args = ['plugin', 'upgrade'];
    if (options?.name) {
      args.push(options.name.trim());
    }
    if (options?.dryRun) {
      args.push('--dry-run');
    }
    if (options?.local) {
      args.push('--local');
    }

    try {
      const { stdout, stderr } = await execFileAsync(binaryPath, args, {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        timeout: 60000,
        encoding: 'utf-8',
      });

      const output = `${stdout}\n${stderr}`.trim();
      return {
        success: true,
        message: output || 'Đã nâng cấp plugin thành công',
        rawOutput: output,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: getErrorMessage(err, 'Lỗi khi nâng cấp plugin'),
      };
    }
  }

  // 12. Discover marketplace plugins
  public async discover(
    binaryPath: string,
    options?: { local?: boolean }
  ): Promise<{ success: boolean; plugins?: OmpDiscoverPluginItem[]; rawOutput?: string; error?: string }> {
    const args = ['plugin', 'discover'];
    if (options?.local) {
      args.push('--local');
    }
    args.push('--json');

    try {
      const { stdout } = await execFileAsync(binaryPath, args, {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        timeout: 30000,
        encoding: 'utf-8',
      });

      const clean = stdout.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
      if (!clean || clean.includes('No plugins available')) {
        return { success: true, plugins: [], rawOutput: stdout };
      }

      // Thử parse JSON trước
      const jsonParsed = parseJsonOrEmpty<unknown>(clean, null);
      if (Array.isArray(jsonParsed)) {
        return {
          success: true,
          plugins: jsonParsed.map((item) => {
            const obj = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
            return {
              name: typeof obj.name === 'string' ? obj.name : '',
              version: typeof obj.version === 'string' ? obj.version : undefined,
              description: typeof obj.description === 'string' ? obj.description : undefined,
              marketplace: typeof obj.marketplace === 'string' ? obj.marketplace : undefined,
              source: typeof obj.source === 'string' ? obj.source : undefined,
            };
          }),
          rawOutput: stdout,
        };
      }

      // Parse định dạng text: "Available Plugins:\n  name@version\n    description"
      const plugins: OmpDiscoverPluginItem[] = [];
      const lines = clean.split('\n');
      let currentPlugin: OmpDiscoverPluginItem | null = null;

      for (const line of lines) {
        if (line.includes('Available Plugins:')) continue;
        const nameMatch = line.match(/^\s{2}([a-zA-Z0-9@_/-]+)(?:@([a-zA-Z0-9.-]+))?/);
        if (nameMatch) {
          if (currentPlugin) {
            plugins.push(currentPlugin);
          }
          currentPlugin = {
            name: nameMatch[1],
            version: nameMatch[2],
            description: '',
          };
        } else if (currentPlugin && line.trim()) {
          currentPlugin.description = currentPlugin.description
            ? `${currentPlugin.description} ${line.trim()}`
            : line.trim();
        }
      }
      if (currentPlugin) {
        plugins.push(currentPlugin);
      }

      return { success: true, plugins, rawOutput: stdout };
    } catch (err: unknown) {
      return {
        success: false,
        plugins: [],
        error: getErrorMessage(err, 'Lỗi khi khám phá plugins từ marketplace'),
      };
    }
  }

  // 13. Quản lý marketplace (list | add | remove)
  public async marketplace(
    binaryPath: string,
    action: 'list' | 'add' | 'remove',
    source?: string,
    options?: { local?: boolean }
  ): Promise<{ success: boolean; marketplaces?: OmpMarketplaceItem[]; message?: string; rawOutput?: string; error?: string }> {
    const cleanAction = action || 'list';
    const cleanSource = String(source || '').trim();

    if ((cleanAction === 'add' || cleanAction === 'remove') && !cleanSource) {
      return {
        success: false,
        error: `Cần cung cấp source hoặc tên marketplace để thực hiện ${cleanAction}`,
      };
    }

    const args = ['plugin', 'marketplace'];
    if (cleanAction !== 'list') {
      args.push(cleanAction);
    }
    if (cleanSource) {
      args.push(cleanSource);
    }
    if (options?.local) {
      args.push('--local');
    }
    args.push('--json');

    try {
      const { stdout, stderr } = await execFileAsync(binaryPath, args, {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        timeout: 30000,
        encoding: 'utf-8',
      });

      const output = `${stdout}\n${stderr}`.trim();
      const clean = stdout.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();

      if (cleanAction === 'list') {
        if (!clean || clean.includes('No marketplaces configured')) {
          return { success: true, marketplaces: [], rawOutput: output };
        }

        const jsonParsed = parseJsonOrEmpty<unknown>(clean, null);
        if (Array.isArray(jsonParsed)) {
          return {
            success: true,
            marketplaces: jsonParsed.map((m) => {
              const obj = (typeof m === 'object' && m !== null ? m : {}) as Record<string, unknown>;
              return {
                name: typeof obj.name === 'string' ? obj.name : '',
                source: typeof obj.source === 'string' ? obj.source : typeof obj.url === 'string' ? obj.url : typeof obj.path === 'string' ? obj.path : '',
              };
            }),
            rawOutput: output,
          };
        }

        // Parse text list: "Configured Marketplaces:\n  name  path"
        const marketplaces: OmpMarketplaceItem[] = [];
        const lines = clean.split('\n');
        for (const line of lines) {
          if (line.includes('Configured Marketplaces:')) continue;
          const match = line.match(/^\s+(\S+)\s+(.+)$/);
          if (match) {
            marketplaces.push({
              name: match[1],
              source: match[2].trim(),
            });
          }
        }

        return { success: true, marketplaces, rawOutput: output };
      }

      return {
        success: true,
        message: output || `Marketplace ${cleanAction} thành công`,
        rawOutput: output,
      };
    } catch (err: unknown) {
      return {
        success: false,
        marketplaces: [],
        error: getErrorMessage(err, `Lỗi khi thực hiện thao tác marketplace ${cleanAction}`),
      };
    }
  }

  // 14. Danh sách agents (bundled + user + project)
  public async listAgents(
    _binaryPath: string,
    projectCwd?: string
  ): Promise<{ success: boolean; agents?: OmpAgentItem[]; error?: string }> {
    const agents: OmpAgentItem[] = [];

    // Danh sách bundled mặc định đã biết
    const BUNDLED_AGENTS = [
      { id: 'scout', name: 'Codebase Scout', description: 'Agent quét nhanh cấu trúc và tìm file liên quan' },
      { id: 'reviewer', name: 'Code Reviewer', description: 'Review chất lượng, bảo mật và logic' },
      { id: 'security-reviewer', name: 'Security Reviewer', description: 'Rà soát lỗ hổng STRIDE + OWASP' },
      { id: 'designer', name: 'UI/UX Designer', description: 'Thiết kế giao diện và tinh chỉnh visual' },
      { id: 'librarian', name: 'Librarian', description: 'Tra cứu tài liệu và API thư viện' },
      { id: 'sonic', name: 'Sonic (Low-reasoning)', description: 'Thực thi các thao tác cơ học nhanh' },
    ];

    for (const b of BUNDLED_AGENTS) {
      agents.push({
        id: b.id,
        name: b.name,
        description: b.description,
        scope: 'bundled',
      });
    }

    // Quét user agents (~/.omp/agent/agents)
    try {
      const userDir = path.join(os.homedir(), '.omp', 'agent', 'agents');
      const files = await fs.readdir(userDir, { withFileTypes: true });
      for (const f of files) {
        if (f.isFile() && (f.name.endsWith('.md') || f.name.endsWith('.yaml') || f.name.endsWith('.yml'))) {
          const agentId = f.name.replace(/\.[^.]+$/, '');
          agents.push({
            id: agentId,
            name: agentId,
            scope: 'user',
            path: path.join(userDir, f.name),
          });
        }
      }
    } catch {}

    // Quét project agents (./.omp/agents)
    if (projectCwd) {
      try {
        const projDir = path.join(projectCwd, '.omp', 'agents');
        const files = await fs.readdir(projDir, { withFileTypes: true });
        for (const f of files) {
          if (f.isFile() && (f.name.endsWith('.md') || f.name.endsWith('.yaml') || f.name.endsWith('.yml'))) {
            const agentId = f.name.replace(/\.[^.]+$/, '');
            agents.push({
              id: agentId,
              name: agentId,
              scope: 'project',
              path: path.join(projDir, f.name),
            });
          }
        }
      } catch {}
    }

    return { success: true, agents };
  }

  // 15. Unpack agents
  public async unpackAgents(
    binaryPath: string,
    options?: { scope?: 'user' | 'project'; force?: boolean; dir?: string }
  ): Promise<{ success: boolean; rawOutput?: string; error?: string }> {
    const args = ['agents', 'unpack'];
    if (options?.scope === 'project') {
      args.push('--project');
    } else if (options?.scope === 'user') {
      args.push('--user');
    }
    if (options?.force) {
      args.push('--force');
    }
    if (options?.dir) {
      args.push(`--dir=${options.dir}`);
    }
    args.push('--json');

    try {
      const { stdout, stderr } = await execFileAsync(binaryPath, args, {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        timeout: 30000,
        encoding: 'utf-8',
      });

      const output = `${stdout}\n${stderr}`.trim();
      return { success: true, rawOutput: output };
    } catch (err: unknown) {
      return {
        success: false,
        error: getErrorMessage(err, 'Lỗi khi giải nén bundled agents'),
      };
    }
  }
}
