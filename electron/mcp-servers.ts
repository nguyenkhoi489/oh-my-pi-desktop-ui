import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';
import { tm } from '../shared/i18n/index.ts';
import { buildExtendedPath } from './models-config.ts';
import { getOmpBaseDir } from './profile-paths.ts';
import type {
  McpScope,
  McpServerConfig,
  McpConfigFile,
  McpConfigReadResult,
  McpMutationResult,
  McpTestResult,
} from './types.ts';

const MCP_SCHEMA_URL =
  'https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json';

const DEFAULT_TEST_TIMEOUT_MS = 10_000;

function toError(err: unknown): { code?: string; message: string } {
  if (err && typeof err === 'object') {
    const code = 'code' in err && typeof err.code === 'string' ? err.code : undefined;
    const message = 'message' in err && typeof err.message === 'string' ? err.message : String(err);
    return { code, message };
  }
  return { message: String(err) };
}

// Resolve path to mcp.json based on scope and active workspace
export async function getMcpConfigPath(
  scope: McpScope,
  projectPath?: string,
  profile?: string,
): Promise<string> {
  if (scope === 'project') {
    if (!projectPath || !projectPath.trim()) {
      throw new Error(tm('electron.mcp.projectPathRequired'));
    }
    return path.join(projectPath.trim(), '.omp', 'mcp.json');
  }

  // User scope
  const cleanProfile = profile?.trim();
  if (cleanProfile && cleanProfile !== 'default') {
    return path.join(getOmpBaseDir(cleanProfile), 'agent', 'mcp.json');
  }

  const ompHome = process.env.OMP_HOME?.trim() || os.homedir();
  return path.join(ompHome, '.omp', 'agent', 'mcp.json');
}

// Check if a path or its parent directory is writable
async function checkPathWritable(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath, fs.constants.W_OK);
    return true;
  } catch (err: unknown) {
    const error = toError(err);
    if (error.code === 'ENOENT') {
      try {
        let parent = path.dirname(targetPath);
        while (parent && parent !== path.dirname(parent)) {
          try {
            await fs.access(parent, fs.constants.W_OK);
            return true;
          } catch (parentErr: unknown) {
            const parentError = toError(parentErr);
            if (parentError.code === 'ENOENT') {
              parent = path.dirname(parent);
              continue;
            }
            return false;
          }
        }
      } catch {
        return false;
      }
    }
    return false;
  }
}

// Read and parse mcp.json configuration
export async function readMcpConfig(
  scope: McpScope,
  projectPath?: string,
  profile?: string,
): Promise<McpConfigReadResult> {
  let filePath: string;
  try {
    filePath = await getMcpConfigPath(scope, projectPath, profile);
  } catch (err: unknown) {
    return {
      success: false,
      scope,
      filePath: '',
      servers: {},
      isWritable: false,
      error: toError(err).message,
    };
  }

  const isWritable = await checkPathWritable(filePath);

  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const servers: Record<string, McpServerConfig> = {};

    if (parsed && typeof parsed === 'object') {
      const rawServers = (parsed as Record<string, unknown>).mcpServers;
      if (rawServers && typeof rawServers === 'object' && !Array.isArray(rawServers)) {
        for (const [key, val] of Object.entries(rawServers as Record<string, unknown>)) {
          if (val && typeof val === 'object' && !Array.isArray(val)) {
            servers[key] = val as McpServerConfig;
          }
        }
      }
    }

    return {
      success: true,
      scope,
      filePath,
      servers,
      isWritable,
    };
  } catch (err: unknown) {
    const error = toError(err);
    if (error.code === 'ENOENT') {
      return {
        success: true,
        scope,
        filePath,
        servers: {},
        isWritable,
      };
    }

    return {
      success: false,
      scope,
      filePath,
      servers: {},
      isWritable,
      error: `${tm('electron.mcp.parseError')}: ${error.message}`,
    };
  }
}

// Atomic file write using temporary file and rename
async function writeMcpConfigFile(
  filePath: string,
  config: McpConfigFile,
): Promise<McpMutationResult> {
  const dir = path.dirname(filePath);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    await fs.mkdir(dir, { recursive: true });
    const content = JSON.stringify(config, null, 2) + '\n';
    await fs.writeFile(tempPath, content, 'utf-8');
    await fs.rename(tempPath, filePath);
    return { success: true, filePath };
  } catch (err: unknown) {
    await fs.unlink(tempPath).catch(() => {});
    return {
      success: false,
      filePath,
      error: toError(err).message,
    };
  }
}

// Helper to read existing file object or create a blank one
async function getExistingFileStructure(filePath: string): Promise<McpConfigFile> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const validServers: Record<string, McpServerConfig> = {};
      const rawServers = (parsed as Record<string, unknown>).mcpServers;
      if (rawServers && typeof rawServers === 'object' && !Array.isArray(rawServers)) {
        for (const [k, v] of Object.entries(rawServers as Record<string, unknown>)) {
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            validServers[k] = v as McpServerConfig;
          }
        }
      }
      return {
        $schema: typeof parsed.$schema === 'string' ? parsed.$schema : MCP_SCHEMA_URL,
        ...parsed,
        mcpServers: validServers,
      };
    }
  } catch {
    // Return default template if missing or corrupt
  }

  return {
    $schema: MCP_SCHEMA_URL,
    mcpServers: {},
  };
}

// Save or update an MCP server entry
export async function saveMcpServer(
  scope: McpScope,
  name: string,
  server: McpServerConfig,
  projectPath?: string,
  profile?: string,
): Promise<McpMutationResult> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { success: false, error: tm('electron.mcp.nameRequired') };
  }

  let filePath: string;
  try {
    filePath = await getMcpConfigPath(scope, projectPath, profile);
  } catch (err: unknown) {
    return { success: false, error: toError(err).message };
  }

  const isWritable = await checkPathWritable(filePath);
  if (!isWritable) {
    return { success: false, filePath, error: tm('electron.mcp.permissionDenied') };
  }

  const current = await getExistingFileStructure(filePath);
  current.mcpServers[trimmedName] = { ...server };

  return writeMcpConfigFile(filePath, current);
}

// Delete an MCP server entry
export async function deleteMcpServer(
  scope: McpScope,
  name: string,
  projectPath?: string,
  profile?: string,
): Promise<McpMutationResult> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { success: false, error: tm('electron.mcp.nameRequired') };
  }

  let filePath: string;
  try {
    filePath = await getMcpConfigPath(scope, projectPath, profile);
  } catch (err: unknown) {
    return { success: false, error: toError(err).message };
  }

  const isWritable = await checkPathWritable(filePath);
  if (!isWritable) {
    return { success: false, filePath, error: tm('electron.mcp.permissionDenied') };
  }

  const current = await getExistingFileStructure(filePath);
  if (current.mcpServers && trimmedName in current.mcpServers) {
    delete current.mcpServers[trimmedName];
    return writeMcpConfigFile(filePath, current);
  }

  return { success: true, filePath };
}

// Toggle enabled/disabled status of an MCP server
export async function toggleMcpServer(
  scope: McpScope,
  name: string,
  enabled: boolean,
  projectPath?: string,
  profile?: string,
): Promise<McpMutationResult> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { success: false, error: tm('electron.mcp.nameRequired') };
  }

  let filePath: string;
  try {
    filePath = await getMcpConfigPath(scope, projectPath, profile);
  } catch (err: unknown) {
    return { success: false, error: toError(err).message };
  }

  const isWritable = await checkPathWritable(filePath);
  if (!isWritable) {
    return { success: false, filePath, error: tm('electron.mcp.permissionDenied') };
  }

  const current = await getExistingFileStructure(filePath);
  if (!current.mcpServers || !(trimmedName in current.mcpServers)) {
    return { success: false, filePath, error: tm('electron.mcp.serverNotFound') };
  }

  current.mcpServers[trimmedName] = {
    ...current.mcpServers[trimmedName],
    disabled: !enabled,
  };

  return writeMcpConfigFile(filePath, current);
}

// Test MCP server connection using stdio handshake or HTTP probe
export async function testMcpConnection(
  config: McpServerConfig,
  timeoutMs: number = DEFAULT_TEST_TIMEOUT_MS,
): Promise<McpTestResult> {
  const startTime = Date.now();
  const transport = config.type || (config.url ? 'http' : 'stdio');

  // Test HTTP / SSE endpoint
  if (transport === 'http' || transport === 'sse') {
    if (!config.url || !config.url.trim()) {
      return {
        success: false,
        latencyMs: 0,
        error: tm('electron.mcp.urlRequired'),
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const headers: Record<string, string> = {
        Accept: 'application/json, text/event-stream',
        ...(config.headers || {}),
      };

      const res = await fetch(config.url.trim(), {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latencyMs = Date.now() - startTime;

      if (res.ok || res.status === 401 || res.status === 403 || res.status === 405) {
        return {
          success: true,
          serverInfo: { name: config.url, version: `HTTP ${res.status}` },
          latencyMs,
        };
      }

      return {
        success: false,
        latencyMs,
        error: `HTTP ${res.status}: ${res.statusText}`,
      };
    } catch (err: unknown) {
      const error = toError(err);
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        error: error.message.includes('abort') ? tm('electron.mcp.timeout') : error.message,
      };
    }
  }

  // Test stdio server
  const rawCommand = config.command?.trim();
  if (!rawCommand) {
    return {
      success: false,
      latencyMs: 0,
      error: tm('electron.mcp.commandRequired'),
    };
  }
  const command = rawCommand;

  return new Promise<McpTestResult>((resolve) => {
    let resolved = false;
    let timer: NodeJS.Timeout | null = null;
    let buffer = '';
    let serverInfo: { name: string; version: string } | undefined;
    let tools: Array<{ name: string; description?: string }> = [];

    const env: Record<string, string> = {
      ...process.env,
      PATH: buildExtendedPath(),
      ...(config.env || {}),
    };

    let proc: ChildProcess;
    try {
      proc = spawn(command, config.args || [], {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err: unknown) {
      return resolve({
        success: false,
        latencyMs: Date.now() - startTime,
        error: `${tm('electron.mcp.spawnFailed')}: ${toError(err).message}`,
      });
    }

    // Ignore EPIPE or write errors when child process exits early
    proc.stdin?.on('error', () => {});

    const safeResolve = (result: McpTestResult) => {
      if (resolved) return;
      resolved = true;
      if (timer) clearTimeout(timer);
      try {
        if (proc.exitCode === null && proc.signalCode === null) {
          proc.kill('SIGTERM');
          setTimeout(() => {
            if (proc.exitCode === null && proc.signalCode === null) {
              proc.kill('SIGKILL');
            }
          }, 500).unref();
        }
      } catch {
        // Ignore kill errors
      }
      resolve(result);
    };

    timer = setTimeout(() => {
      safeResolve({
        success: false,
        latencyMs: Date.now() - startTime,
        error: tm('electron.mcp.timeout'),
      });
    }, timeoutMs);

    proc.on('error', (err: unknown) => {
      safeResolve({
        success: false,
        latencyMs: Date.now() - startTime,
        error: `${tm('electron.mcp.processError')}: ${toError(err).message}`,
      });
    });

    let stderrOutput = '';
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrOutput += chunk.toString();
      if (stderrOutput.length > 2000) {
        stderrOutput = stderrOutput.slice(-2000);
      }
    });

    proc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const msg = JSON.parse(trimmed) as {
            id?: number;
            error?: { message?: string };
            result?: {
              serverInfo?: { name?: string; version?: string };
              tools?: Array<{ name?: string; description?: string }>;
            };
          };

          if (msg && typeof msg === 'object') {
            // Response to initialize (id: 1)
            if (msg.id === 1) {
              if (msg.error) {
                safeResolve({
                  success: false,
                  latencyMs: Date.now() - startTime,
                  error: msg.error.message || JSON.stringify(msg.error),
                });
                return;
              }

              if (msg.result && typeof msg.result === 'object') {
                const sInfo = msg.result.serverInfo;
                if (sInfo && typeof sInfo === 'object') {
                  serverInfo = {
                    name: String(sInfo.name || 'unknown'),
                    version: String(sInfo.version || ''),
                  };
                }

                if (proc.stdin && !proc.stdin.destroyed) {
                  proc.stdin.write(
                    JSON.stringify({
                      jsonrpc: '2.0',
                      method: 'notifications/initialized',
                    }) + '\n',
                  );
                  proc.stdin.write(
                    JSON.stringify({
                      jsonrpc: '2.0',
                      id: 2,
                      method: 'tools/list',
                      params: {},
                    }) + '\n',
                  );
                }
              }
            }

            // Response to tools/list (id: 2)
            if (msg.id === 2) {
              if (msg.result && Array.isArray(msg.result.tools)) {
                tools = msg.result.tools.map((t) => ({
                  name: String(t?.name || ''),
                  description: t?.description ? String(t.description) : undefined,
                }));
              }

              safeResolve({
                success: true,
                serverInfo,
                tools,
                latencyMs: Date.now() - startTime,
              });
              return;
            }
          }
        } catch {
          // Ignore non-JSON logs
        }
      }
    });

    proc.on('close', (code) => {
      if (!resolved) {
        const errDetail = stderrOutput.trim() ? ` (${stderrOutput.trim().slice(0, 300)})` : '';
        safeResolve({
          success: false,
          latencyMs: Date.now() - startTime,
          error: `${tm('electron.mcp.processExited')} code ${code}${errDetail}`,
        });
      }
    });

    if (proc.stdin && !proc.stdin.destroyed) {
      proc.stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
              name: 'omp-agent',
              version: '1.1.1',
            },
          },
        }) + '\n',
      );
    }
  });
}
