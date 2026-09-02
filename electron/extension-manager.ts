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
  [key: string]: unknown;
}

export interface OmpAgentItem {
  id: string;
  name: string;
  description?: string;
  scope: 'bundled' | 'user' | 'project';
  path?: string;
}

export class ExtensionManager {
  // 1. Danh sách plugins
  public async listPlugins(
    binaryPath: string
  ): Promise<{ success: boolean; plugins?: OmpPluginInfo[]; error?: string }> {
    try {
      const { stdout } = await execFileAsync(binaryPath, ['plugin', 'list', '--json'], {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        timeout: 15000,
        encoding: 'utf-8',
      });

      const parsed = JSON.parse(stdout || '{}');
      const plugins: OmpPluginInfo[] = [];

      if (Array.isArray(parsed)) {
        plugins.push(...parsed);
      } else if (typeof parsed === 'object' && parsed !== null) {
        if (Array.isArray(parsed.npm)) {
          for (const item of parsed.npm) {
            plugins.push({
              name: typeof item === 'string' ? item : item.name,
              source: 'npm',
              ...item,
            });
          }
        }
        if (Array.isArray(parsed.marketplace)) {
          for (const item of parsed.marketplace) {
            plugins.push({
              name: typeof item === 'string' ? item : item.name,
              source: 'marketplace',
              ...item,
            });
          }
        }
        if (Array.isArray(parsed.local)) {
          for (const item of parsed.local) {
            plugins.push({
              name: typeof item === 'string' ? item : item.name,
              source: 'local',
              ...item,
            });
          }
        }
      }

      return { success: true, plugins };
    } catch (err: any) {
      return {
        success: false,
        plugins: [],
        error: err?.message || 'Lỗi khi liệt kê plugins',
      };
    }
  }

  // 2. Cài đặt plugin
  public async installPlugin(
    binaryPath: string,
    target: string,
    options?: { scope?: 'user' | 'project'; force?: boolean }
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
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || `Lỗi khi cài đặt plugin ${cleanTarget}`,
      };
    }
  }

  // 3. Gỡ cài đặt plugin
  public async uninstallPlugin(
    binaryPath: string,
    target: string,
    options?: { scope?: 'user' | 'project' }
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const cleanTarget = String(target || '').trim();
    if (!cleanTarget) {
      return { success: false, error: 'Tên plugin không được để trống' };
    }

    const args = ['plugin', 'uninstall', cleanTarget];
    if (options?.scope) {
      args.push(`--scope=${options.scope}`);
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
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || `Lỗi khi gỡ cài đặt plugin ${cleanTarget}`,
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
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || `Lỗi khi liên kết plugin từ ${cleanPath}`,
      };
    }
  }

  // 5. Danh sách agents (bundled + user + project)
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

  // 6. Unpack agents
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
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Lỗi khi giải nén bundled agents',
      };
    }
  }
}
