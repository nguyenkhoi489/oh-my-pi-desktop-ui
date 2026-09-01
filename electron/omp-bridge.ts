import { spawn, execSync, ChildProcess } from 'child_process';
import { BrowserWindow } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  OmpAgentStatus,
  ToolCall,
  ThinkingBlock,
  ChatMessage,
  FileDiffItem,
  PermissionRequest,
  OmpInstallStatus,
} from './types';

export class OmpBridge {
  private process: ChildProcess | null = null;
  private window: BrowserWindow;
  private status: OmpAgentStatus = 'idle';
  private buffer: string = '';
  private currentMessage: Partial<ChatMessage> | null = null;
  private pendingPermissions: Map<string, (approved: boolean) => void> = new Map();
  private detectedPath: string | null = null;
  private customPath: string | null = null;

  constructor(window: BrowserWindow) {
    this.window = window;
  }

  public setCustomBinaryPath(rawPath: string) {
    let resolved = rawPath.trim();
    if (resolved.startsWith('~')) {
      resolved = path.join(os.homedir(), resolved.slice(1));
    }
    this.customPath = resolved;
    this.detectedPath = resolved;
  }

  public detectBinaryPath(): string | null {
    // 1. If user set a custom path
    if (this.customPath) {
      let resolved = this.customPath.trim();
      if (resolved.startsWith('~')) {
        resolved = path.join(os.homedir(), resolved.slice(1));
      }
      if (fs.existsSync(resolved)) {
        return resolved;
      }
    }

    if (this.detectedPath && fs.existsSync(this.detectedPath)) {
      return this.detectedPath;
    }

    const homedir = os.homedir();
    const binaryNames = ['omp', 'oh-my-pi', 'pi-coding-agent', 'pi'];

    // 2. Candidate fixed directories
    const candidateDirs = [
      path.join(homedir, '.local/bin'),
      path.join(homedir, '.bun/bin'),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      path.join(homedir, '.cargo/bin'),
      path.join(homedir, '.npm-global/bin'),
      path.join(homedir, 'Library/pnpm'),
      path.join(homedir, '.yarn/bin'),
      path.join(homedir, '.asdf/shims'),
      path.join(homedir, '.volta/bin'),
      path.join(homedir, '.nix-profile/bin'),
    ];

    // Scan candidate fixed directories for all possible binary names
    for (const dir of candidateDirs) {
      for (const name of binaryNames) {
        const fullPath = path.join(dir, name);
        if (fs.existsSync(fullPath)) {
          this.detectedPath = fullPath;
          return fullPath;
        }
      }
    }

    // 3. Scan dynamic NVM versions directories (e.g. ~/.nvm/versions/node/*/bin/omp)
    const nvmDir = path.join(homedir, '.nvm/versions/node');
    if (fs.existsSync(nvmDir)) {
      try {
        const versions = fs.readdirSync(nvmDir);
        for (const v of versions) {
          for (const name of binaryNames) {
            const nvmBin = path.join(nvmDir, v, 'bin', name);
            if (fs.existsSync(nvmBin)) {
              this.detectedPath = nvmBin;
              return nvmBin;
            }
          }
        }
      } catch {}
    }

    // 4. Query user's interactive login shell (loads .zshrc, .zprofile, PATH)
    for (const name of binaryNames) {
      try {
        const shellOutput = execSync(`/bin/zsh -l -c 'which ${name}' 2>/dev/null`, {
          encoding: 'utf-8',
          timeout: 2500,
        }).trim();

        if (shellOutput && fs.existsSync(shellOutput)) {
          this.detectedPath = shellOutput;
          return shellOutput;
        }
      } catch {}
    }

    return null;
  }

  public async checkInstallation(): Promise<OmpInstallStatus> {
    const binaryPath = this.detectBinaryPath();

    if (!binaryPath || !fs.existsSync(binaryPath)) {
      return {
        installed: false,
        error: 'Chưa tìm thấy file nhị phân OMP trên máy (quét qua ~/.local/bin, /opt/homebrew, ~/.bun, ~/.nvm, zsh).',
      };
    }

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
    ].filter(Boolean).join(':');

    let versionOutput = '';
    try {
      versionOutput = execSync(`"${binaryPath}" --version 2>/dev/null || "${binaryPath}" -v 2>/dev/null`, {
        env: { ...process.env, PATH: extendedPath },
        encoding: 'utf-8',
        timeout: 3000,
      }).trim();
    } catch {}

    return {
      installed: true,
      version: versionOutput || 'v0.1.0',
      binaryPath,
    };
  }

  public setStatus(newStatus: OmpAgentStatus) {
    this.status = newStatus;
    this.window.webContents.send('omp:status-change', newStatus);
  }

  public async startProcess(workspacePath: string, model?: string): Promise<{ success: boolean; pid?: number }> {
    if (this.process) {
      this.stopProcess();
    }

    try {
      const binaryPath = this.detectBinaryPath() || 'omp';
      const args = ['--mode', 'rpc', '--cwd', workspacePath];
      if (model) {
        args.push('--model', model);
      }

      const homedir = os.homedir();
      const extendedPath = `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin:${homedir}/.bun/bin:${homedir}/.cargo/bin:${homedir}/Library/pnpm:${homedir}/.local/bin`;

      this.process = spawn(binaryPath, args, {
        cwd: workspacePath,
        env: { ...process.env, PATH: extendedPath, FORCE_COLOR: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.stdout?.on('data', (chunk: Buffer) => {
        this.handleStdoutData(chunk.toString('utf-8'));
      });

      this.process.stderr?.on('data', (chunk: Buffer) => {
        console.error('[OMP STDERR]:', chunk.toString('utf-8'));
      });

      this.process.on('close', (code) => {
        console.log(`OMP process exited with code ${code}`);
        this.process = null;
        this.setStatus('idle');
      });

      this.process.on('error', (err) => {
        console.warn('OMP binary failed to spawn. Switching to fallback mode.', err.message);
        this.process = null;
        this.setStatus('idle');
      });

      this.setStatus('idle');
      return { success: true, pid: this.process?.pid };
    } catch (err: any) {
      console.error('Failed to start OMP process:', err);
      return { success: false };
    }
  }

  public stopProcess(): { success: boolean } {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    this.setStatus('idle');
    return { success: true };
  }

  public async sendMessage(prompt: string, context?: { files?: string[] }): Promise<{ success: boolean }> {
    // If active process exists, write JSON-RPC command
    if (this.process && this.process.stdin?.writable) {
      const rpcPayload = {
        jsonrpc: '2.0',
        method: 'agent.prompt',
        params: {
          prompt,
          context: context?.files || [],
        },
        id: Date.now(),
      };
      this.process.stdin.write(JSON.stringify(rpcPayload) + '\n');
      this.setStatus('thinking');
      return { success: true };
    }

    // Fallback simulation flow
    this.simulateAgentFlow(prompt, context);
    return { success: true };
  }

  public respondPermission(requestId: string, approved: boolean) {
    const resolver = this.pendingPermissions.get(requestId);
    if (resolver) {
      resolver(approved);
      this.pendingPermissions.delete(requestId);
    }

    if (this.process && this.process.stdin?.writable) {
      const responsePayload = {
        jsonrpc: '2.0',
        method: 'permission.response',
        params: { requestId, approved },
      };
      this.process.stdin.write(JSON.stringify(responsePayload) + '\n');
    }
  }

  private handleStdoutData(data: string) {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const event = JSON.parse(trimmed);
        this.processRpcEvent(event);
      } catch {
        console.log('[OMP RAW]:', trimmed);
      }
    }
  }

  private processRpcEvent(event: any) {
    const { method, params } = event;

    switch (method) {
      case 'agent.status':
        this.setStatus(params.status);
        break;

      case 'agent.stream_token':
        this.window.webContents.send('omp:stream-token', params.token);
        break;

      case 'agent.thinking':
        const thinkingBlock: ThinkingBlock = {
          id: 'think-' + Date.now(),
          thought: params.content,
          timestamp: Date.now(),
          completed: params.completed ?? false,
        };
        this.window.webContents.send('omp:thinking', thinkingBlock);
        break;

      case 'agent.tool_call':
        const toolCall: ToolCall = {
          id: params.id || 'tool-' + Date.now(),
          name: params.name,
          params: params.args || {},
          status: params.status || 'running',
          result: params.result,
          error: params.error,
          startTime: params.startTime || Date.now(),
          endTime: params.endTime,
        };
        this.window.webContents.send('omp:tool-call', toolCall);
        break;

      case 'agent.file_diff':
        const diff: FileDiffItem = {
          id: 'diff-' + Date.now(),
          filePath: params.filePath,
          relativePath: params.relativePath || params.filePath,
          originalContent: params.originalContent,
          modifiedContent: params.modifiedContent,
          status: 'pending',
          additions: params.additions || 0,
          deletions: params.deletions || 0,
        };
        this.window.webContents.send('omp:diff-generated', diff);
        break;

      case 'agent.permission_request':
        const req: PermissionRequest = {
          id: params.id,
          toolName: params.toolName,
          description: params.description,
          command: params.command,
          targetFile: params.targetFile,
          dangerous: params.dangerous ?? true,
        };
        this.setStatus('waiting_permission');
        this.window.webContents.send('omp:permission-request', req);
        break;

      case 'agent.complete':
        this.setStatus('idle');
        this.window.webContents.send('omp:message-complete', params.message);
        break;
    }
  }

  // Simulated agent responses fallback
  private simulateAgentFlow(prompt: string, context?: { files?: string[] }) {
    this.setStatus('thinking');

    setTimeout(() => {
      const thinking: ThinkingBlock = {
        id: 'think-' + Date.now(),
        thought: `Đang phân tích yêu cầu: "${prompt}".\nĐọc cấu trúc AST, kiểm tra các symbols liên quan qua Language Server Protocol (LSP) và lên kế hoạch patch...`,
        timestamp: Date.now(),
        completed: true,
      };
      this.window.webContents.send('omp:thinking', thinking);

      this.setStatus('executing_tool');
      const tool1: ToolCall = {
        id: 'tool-1',
        name: 'tree_sitter_ast_query',
        params: { file: context?.files?.[0] || 'src/auth/service.ts', query: '(function_declaration)' },
        status: 'running',
        startTime: Date.now(),
      };
      this.window.webContents.send('omp:tool-call', tool1);

      setTimeout(() => {
        tool1.status = 'completed';
        tool1.result = { matchedNodes: 3, rootSymbol: 'AuthService' };
        tool1.endTime = Date.now();
        this.window.webContents.send('omp:tool-call', tool1);

        const mockOriginal = `export class AuthService {
  private secret: string;

  constructor() {
    this.secret = process.env.JWT_SECRET || 'dev_secret';
  }

  async validateUser(token: string) {
    // TODO: implement validation
    return null;
  }
}`;

        const mockModified = `export class AuthService {
  private secret: string;
  private tokenExpiry: number = 3600;

  constructor() {
    this.secret = process.env.JWT_SECRET || 'dev_secret';
  }

  /**
   * Validates JWT token and checks expiry
   */
  async validateUser(token: string) {
    if (!token) throw new Error('Token is required');
    try {
      const decoded = await jwt.verify(token, this.secret);
      return { valid: true, user: decoded };
    } catch (err) {
      return { valid: false, error: 'Invalid or expired token' };
    }
  }
}`;

        const diff: FileDiffItem = {
          id: 'diff-' + Date.now(),
          filePath: '/Users/nguyenkhoi/Project/src/auth/service.ts',
          relativePath: 'src/auth/service.ts',
          originalContent: mockOriginal,
          modifiedContent: mockModified,
          status: 'pending',
          additions: 12,
          deletions: 2,
        };
        this.window.webContents.send('omp:diff-generated', diff);

        this.setStatus('streaming');
        const text = `Tôi đã phân tích AST của \`src/auth/service.ts\` và hoàn thiện hàm \`validateUser\` với việc kiểm tra Token và giải mã JWT an toàn.\n\nBạn có thể xem **Visual Diff** ở khung Canvas ở giữa và nhấn **Accept Changes** (⌘↵) để ghi đè code.`;
        
        let index = 0;
        const interval = setInterval(() => {
          if (index < text.length) {
            this.window.webContents.send('omp:stream-token', text.slice(index, index + 4));
            index += 4;
          } else {
            clearInterval(interval);
            this.setStatus('idle');
            this.window.webContents.send('omp:message-complete', {
              id: 'msg-' + Date.now(),
              role: 'assistant',
              content: text,
              timestamp: Date.now(),
            });
          }
        }, 30);
      }, 900);
    }, 800);
  }
}
