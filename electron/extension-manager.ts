import { tm } from '../shared/i18n/index.ts';
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

// Helper removing ANSI codes and safely parsing JSON or returning fallback when empty
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
  // 1. Plugins list
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
        error: getErrorMessage(err, tm('electron.extensions.listPluginsFailed')),
      };
    }
  }

  // 2. Install plugin
  public async installPlugin(
    binaryPath: string,
    target: string,
    options?: { scope?: 'user' | 'project'; force?: boolean; local?: boolean; dryRun?: boolean }
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const cleanTarget = String(target || '').trim();
    if (!cleanTarget) {
      return { success: false, error: tm('electron.extensions.packageOrPluginEmpty') };
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
      return { success: true, message: output || tm('electron.extensions.installSuccess', { name: cleanTarget }) };
    } catch (err: unknown) {
      return {
        success: false,
        error: getErrorMessage(err, tm('electron.extensions.installFailed', { name: cleanTarget })),
      };
    }
  }

  // 3. Uninstall plugin
  public async uninstallPlugin(
    binaryPath: string,
    target: string,
    options?: { scope?: 'user' | 'project'; local?: boolean; dryRun?: boolean }
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const cleanTarget = String(target || '').trim();
    if (!cleanTarget) {
      return { success: false, error: tm('electron.extensions.pluginNameEmpty') };
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
      return { success: true, message: output || tm('electron.extensions.uninstallSuccess', { name: cleanTarget }) };
    } catch (err: unknown) {
      return {
        success: false,
        error: getErrorMessage(err, tm('electron.extensions.uninstallFailed', { name: cleanTarget })),
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
      return { success: false, error: tm('electron.extensions.pluginPathEmpty') };
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
      return { success: true, message: output || tm('electron.extensions.linkSuccess', { path: cleanPath }) };
    } catch (err: unknown) {
      return {
        success: false,
        error: getErrorMessage(err, tm('electron.extensions.linkFailed', { path: cleanPath })),
      };
    }
  }

  // 5. Doctor checking plugin health
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
        error: getErrorMessage(err, tm('electron.extensions.doctorFailed')),
      };
    }
  }

  // 6. Plugin features
  public async features(
    binaryPath: string,
    pluginName: string,
    options?: { local?: boolean }
  ): Promise<{ success: boolean; features?: OmpPluginFeatureItem[]; rawOutput?: string; error?: string }> {
    const cleanName = String(pluginName || '').trim();
    if (!cleanName) {
      return { success: false, error: tm('electron.extensions.pluginNameEmpty') };
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
        error: getErrorMessage(err, tm('electron.extensions.featuresFailed', { name: cleanName })),
      };
    }
  }

  // 7. Toggle plugin feature (--enable / --disable)
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
      return { success: false, error: tm('electron.extensions.pluginAndFeatureEmpty') };
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
        message: output || (enabled ? tm('electron.extensions.featureEnabled', { feature: cleanFeature, name: cleanName }) : tm('electron.extensions.featureDisabled', { feature: cleanFeature, name: cleanName })),
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: getErrorMessage(err, tm('electron.extensions.toggleFeatureFailed', { feature: cleanFeature })),
      };
    }
  }

  // 8. Plugin config (--set k=v)
  public async setPluginConfig(
    binaryPath: string,
    pluginName: string,
    pairs: Array<{ key: string; value: string }>,
    options?: { local?: boolean }
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const cleanName = String(pluginName || '').trim();
    if (!cleanName) {
      return { success: false, error: tm('electron.extensions.pluginNameEmpty') };
    }
    if (!Array.isArray(pairs) || pairs.length === 0) {
      return { success: false, error: tm('electron.extensions.configPairsEmpty') };
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
        message: output || tm('electron.extensions.setConfigSuccess', { name: cleanName }),
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: getErrorMessage(err, tm('electron.extensions.setConfigFailed', { name: cleanName })),
      };
    }
  }

  // 9. Get plugin config
  public async getPluginConfig(
    binaryPath: string,
    pluginName: string,
    options?: { local?: boolean }
  ): Promise<{ success: boolean; config?: Record<string, unknown>; rawOutput?: string; error?: string }> {
    const cleanName = String(pluginName || '').trim();
    if (!cleanName) {
      return { success: false, error: tm('electron.extensions.pluginNameEmpty') };
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
        error: getErrorMessage(err, tm('electron.extensions.getConfigFailed', { name: cleanName })),
      };
    }
  }

  // 10. Toggle plugin (enable / disable)
  public async togglePlugin(
    binaryPath: string,
    name: string,
    enabled: boolean,
    options?: { local?: boolean }
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const cleanName = String(name || '').trim();
    if (!cleanName) {
      return { success: false, error: tm('electron.extensions.pluginNameEmpty') };
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
        message: output || (enabled ? tm('electron.extensions.enablePluginSuccess', { name: cleanName }) : tm('electron.extensions.disablePluginSuccess', { name: cleanName })),
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: getErrorMessage(err, tm('electron.extensions.togglePluginFailed', { name: cleanName })),
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
        message: output || tm('electron.extensions.upgradeSuccess'),
        rawOutput: output,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: getErrorMessage(err, tm('electron.extensions.upgradeFailed')),
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

      // Try to parse JSON first
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

      // Parse text format: "Available Plugins:\n  name@version\n    description"
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
        error: getErrorMessage(err, tm('electron.extensions.marketplaceDiscoverFailed')),
      };
    }
  }

  // 13. Marketplace management (list | add | remove)
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
        error: tm('electron.extensions.marketplaceSourceEmpty', { action: cleanAction }),
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
        message: output || tm('electron.extensions.marketplaceActionSuccess', { action: cleanAction }),
        rawOutput: output,
      };
    } catch (err: unknown) {
      return {
        success: false,
        marketplaces: [],
        error: getErrorMessage(err, tm('electron.extensions.marketplaceActionFailed', { action: cleanAction })),
      };
    }
  }

  // 14. Agents list (bundled + user + project)
  public async listAgents(
    _binaryPath: string,
    projectCwd?: string
  ): Promise<{ success: boolean; agents?: OmpAgentItem[]; error?: string }> {
    const agents: OmpAgentItem[] = [];

    // Known default bundled agents list
    const BUNDLED_AGENTS = [
      { id: 'scout', name: 'Codebase Scout', description: tm('electron.extensions.bundledAgent.scoutDesc') },
      { id: 'reviewer', name: 'Code Reviewer', description: tm('electron.extensions.bundledAgent.reviewerDesc') },
      { id: 'security-reviewer', name: 'Security Reviewer', description: tm('electron.extensions.bundledAgent.securityDesc') },
      { id: 'designer', name: 'UI/UX Designer', description: tm('electron.extensions.bundledAgent.designerDesc') },
      { id: 'librarian', name: 'Librarian', description: tm('electron.extensions.bundledAgent.librarianDesc') },
      { id: 'sonic', name: 'Sonic (Low-reasoning)', description: tm('electron.extensions.bundledAgent.sonicDesc') },
    ];

    for (const b of BUNDLED_AGENTS) {
      agents.push({
        id: b.id,
        name: b.name,
        description: b.description,
        scope: 'bundled',
      });
    }

    // Scan user agents (~/.omp/agent/agents)
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

    // Scan project agents (./.omp/agents)
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
        error: getErrorMessage(err, tm('electron.extensions.extractBundledFailed')),
      };
    }
  }
}
