import electronPkg from 'electron';
import fs from 'fs';
import path from 'path';
import type { HostUriResultPayload } from './omp-rpc-types.ts';
import type { HostOpenRequest } from './types.ts';

const electron = typeof electronPkg === 'object' && electronPkg !== null ? (electronPkg as any).default || electronPkg : {};
const shell = electron.shell || { openExternal: async () => {}, showItemInFolder: () => {} };
const dialog = electron.dialog || { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) };
const Notification = electron.Notification || class MockNotification {
  static isSupported() { return false; }
  show() {}
};

export interface HostToolDefinition {
  name: string;
  label?: string;
  description: string;
  parameters: Record<string, unknown>;
  hidden?: boolean;
  loadMode?: string;
  timeoutMs?: number;
  execute: (
    args: any,
    context: { toolCallId: string; signal: AbortSignal }
  ) => Promise<{ content: Array<{ type: string; text?: string; [k: string]: any }>; details?: any } | string>;
}

export interface HostIntegrationOptions {
  openInApp?: (request: HostOpenRequest) => void;
}

const DEFAULT_TOOL_TIMEOUT_MS = 15000;
const PICK_FILE_TIMEOUT_MS = 10 * 60 * 1000;

export class HostToolRegistry {
  private tools: Map<string, HostToolDefinition> = new Map();
  private openInApp?: (request: HostOpenRequest) => void;

  constructor(options: HostIntegrationOptions = {}) {
    this.openInApp = options.openInApp;
    this.registerBuiltinTools();
  }

  // Đăng ký tool
  public register(tool: HostToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  public getTool(name: string): HostToolDefinition | undefined {
    return this.tools.get(name);
  }

  public getDeclarations(): Array<{
    name: string;
    label?: string;
    description: string;
    parameters: Record<string, unknown>;
    hidden?: boolean;
    loadMode?: string;
  }> {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      label: t.label,
      description: t.description,
      parameters: t.parameters,
      hidden: t.hidden,
      loadMode: t.loadMode,
    }));
  }

  // Thực thi tool có bảo vệ timeout và signal
  public async executeTool(
    name: string,
    args: any,
    context: { toolCallId: string; signal: AbortSignal; timeoutMs?: number }
  ): Promise<{ content: Array<{ type: string; text?: string }>; details?: any; isError?: boolean }> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Host tool "${name}" is not registered in Desktop` }],
        details: {},
        isError: true,
      };
    }

    if (context.signal.aborted) {
      return { content: [{ type: 'text', text: `Host tool "${name}" was aborted` }], details: {}, isError: true };
    }

    const timeoutMs = context.timeoutMs ?? tool.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
    let timer: NodeJS.Timeout | undefined;
    let onAbort: (() => void) | undefined;
    const guardPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Host tool "${name}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      onAbort = () => reject(new Error(`Host tool "${name}" was aborted`));
      context.signal.addEventListener('abort', onAbort, { once: true });
    });

    try {
      const execPromise = (async () => {
        const rawRes = await tool.execute(args, {
          toolCallId: context.toolCallId,
          signal: context.signal,
        });

        if (typeof rawRes === 'string') {
          return {
            content: [{ type: 'text', text: rawRes }],
            details: {},
            isError: false,
          };
        }

        return {
          content: rawRes.content || [{ type: 'text', text: 'OK' }],
          details: rawRes.details || {},
          isError: false,
        };
      })();

      return await Promise.race([execPromise, guardPromise]);
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: err?.message || String(err) }],
        details: {},
        isError: true,
      };
    } finally {
      clearTimeout(timer);
      if (onAbort) context.signal.removeEventListener('abort', onAbort);
    }
  }

  // Đăng ký các tool mặc định của Desktop
  private registerBuiltinTools() {
    // 1. notify_user: Gửi notification macOS
    this.register({
      name: 'notify_user',
      label: 'Notify User',
      description: 'Gửi thông báo desktop (macOS notification) cho người dùng.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Tiêu đề thông báo' },
          message: { type: 'string', description: 'Nội dung thông báo cần gửi' },
        },
        required: ['message'],
      },
      execute: async (args: { title?: string; message: string }) => {
        const title = args.title || 'OMP Agent';
        const body = String(args.message || '');
        if (Notification.isSupported()) {
          const notif = new Notification({
            title,
            body,
          });
          notif.show();
        }
        return `Đã gửi thông báo đến người dùng: [${title}] ${body}`;
      },
    });

    // 2. open_in_browser: Mở URL trong trình duyệt mặc định
    this.register({
      name: 'open_in_browser',
      label: 'Open URL in Browser',
      description: 'Mở một liên kết web trong trình duyệt mặc định của hệ thống.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Đường dẫn URL hợp lệ cần mở (https://...)' },
        },
        required: ['url'],
      },
      execute: async (args: { url: string }) => {
        const targetUrl = String(args.url || '').trim();
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
          throw new Error('Chỉ chấp nhận mở các đường dẫn URL bắt đầu bằng http:// hoặc https://');
        }
        await shell.openExternal(targetUrl);
        return `Đã mở URL trong trình duyệt: ${targetUrl}`;
      },
    });

    // 3. reveal_file: Hiển thị file trong Finder
    this.register({
      name: 'reveal_file',
      label: 'Reveal in Finder',
      description: 'Hiển thị file hoặc thư mục chỉ định trong trình quản lý tệp Finder của macOS.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Đường dẫn file cần hiển thị' },
        },
        required: ['filePath'],
      },
      execute: async (args: { filePath: string }) => {
        const targetPath = String(args.filePath || '').trim();
        if (!targetPath) throw new Error('Đường dẫn filePath không được để trống');
        shell.showItemInFolder(targetPath);
        return `Đã mở Finder tại vị trí: ${targetPath}`;
      },
    });

    // 4. open_in_app: Mở file trong app
    this.register({
      name: 'open_in_app',
      label: 'Open in Desktop App',
      description: 'Yêu cầu Desktop hiển thị một file hoặc đường dẫn trong trình xem mã nguồn.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Đường dẫn file cần mở' },
          line: { type: 'number', description: 'Dòng cần trỏ tới (tuỳ chọn)' },
        },
        required: ['filePath'],
      },
      execute: async (args: { filePath: string; line?: number }) => {
        const p = String(args.filePath || '').trim();
        if (!p) throw new Error('Đường dẫn filePath không được để trống');
        if (!this.openInApp) throw new Error('Desktop chưa sẵn sàng nhận yêu cầu mở file');
        const line = typeof args.line === 'number' && args.line > 0 ? Math.floor(args.line) : undefined;
        this.openInApp({ kind: 'file', target: p, line });
        return `Đã gửi yêu cầu mở file tới Desktop: ${p}${line ? ` (dòng ${line})` : ''}`;
      },
    });

    // 5. pick_file: Mở native file picker dialog
    this.register({
      name: 'pick_file',
      label: 'Pick File Dialog',
      description: 'Mở hộp thoại chọn tệp của macOS để người dùng chọn một file hoặc thư mục.',
      timeoutMs: PICK_FILE_TIMEOUT_MS,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Tiêu đề hộp thoại' },
          defaultPath: { type: 'string', description: 'Đường dẫn mặc định ban đầu' },
        },
      },
      execute: async (args: { title?: string; defaultPath?: string }) => {
        const res = await dialog.showOpenDialog({
          title: args.title || 'Chọn tệp cho OMP Agent',
          defaultPath: args.defaultPath,
          properties: ['openFile', 'showHiddenFiles'],
        });
        if (res.canceled || res.filePaths.length === 0) {
          return 'Người dùng đã huỷ chọn tệp';
        }
        return `Người dùng đã chọn tệp: ${res.filePaths[0]}`;
      },
    });
  }
}

const HOST_URI_SCHEMES = ['ompapp', 'vscode', 'cursor'];
const MAX_URI_FILE_BYTES = 512 * 1024;

export interface HostUriRouterOptions extends HostIntegrationOptions {
  resolvePath?: (target: string) => string;
  notify?: (message: string) => void;
}

async function statOrNull(filePath: string): Promise<fs.Stats | null> {
  try {
    return await fs.promises.stat(filePath);
  } catch {
    return null;
  }
}

// Trả lời host_uri_request của engine cho các scheme Desktop đăng ký
export class HostUriRouter {
  private openInApp?: (request: HostOpenRequest) => void;
  private resolvePath: (target: string) => string;
  private notify: (message: string) => void;

  constructor(options: HostUriRouterOptions = {}) {
    this.openInApp = options.openInApp;
    this.resolvePath = options.resolvePath || ((target) => path.resolve(target));
    this.notify = options.notify || (() => {});
  }

  public getSchemes(): string[] {
    return [...HOST_URI_SCHEMES];
  }

  public async handle(
    operation: string,
    url: string,
    content?: string,
    signal?: AbortSignal
  ): Promise<HostUriResultPayload> {
    try {
      const scheme = url.split('://')[0]?.toLowerCase() || '';
      if (operation !== 'read') {
        return { isError: true, error: `Scheme ${scheme}:// chỉ hỗ trợ đọc, không hỗ trợ ${operation}` };
      }
      if (scheme === 'ompapp') return await this.handleOmpApp(url, signal);
      if (scheme === 'vscode' || scheme === 'cursor') return await this.handleEditorLink(scheme, url, signal);
      return { isError: true, error: `Desktop không hỗ trợ scheme ${scheme}://` };
    } catch (err: any) {
      return { isError: true, error: err?.message || String(err) };
    }
  }

  // Chỉ cho phép dạng vscode://file/<path> để tránh deep-link lạ (ssh-remote, extension...)
  private async handleEditorLink(scheme: string, url: string, signal?: AbortSignal): Promise<HostUriResultPayload> {
    if (!url.startsWith(`${scheme}://file/`)) {
      throw new Error(`Chỉ hỗ trợ dạng ${scheme}://file/<đường dẫn>`);
    }
    assertNotAborted(signal, url);
    this.notify(`Model yêu cầu mở ${url}`);
    await shell.openExternal(url);
    return { content: `Đã mở ${url} bằng ${scheme}`, contentType: 'text/plain', immutable: true };
  }

  private async handleOmpApp(url: string, signal?: AbortSignal): Promise<HostUriResultPayload> {
    const rest = url.slice('ompapp://'.length);
    const slash = rest.indexOf('/');
    const kind = slash === -1 ? rest : rest.slice(0, slash);
    const target = decodeURIComponent(slash === -1 ? '' : rest.slice(slash + 1));
    if (!target) throw new Error(`Thiếu đích trong ${url}`);

    if (kind === 'session') {
      assertNotAborted(signal, url);
      this.requireOpenInApp()({ kind: 'session', target });
      return { content: `Đã mở session ${target} trong Desktop`, contentType: 'text/plain', immutable: true };
    }

    if (kind === 'file') {
      const { filePart, line } = splitTrailingLine(target);
      const absolutePath = await this.locateFile(filePart);
      const stat = await statOrNull(absolutePath);
      if (!stat) throw new Error(`Không tìm thấy file ${filePart}`);
      if (!stat.isFile()) throw new Error(`${filePart} không phải là file`);
      if (stat.size > MAX_URI_FILE_BYTES) throw new Error(`${filePart} vượt quá ${MAX_URI_FILE_BYTES} bytes`);
      const buffer = await fs.promises.readFile(absolutePath);
      if (buffer.includes(0)) throw new Error(`${filePart} là file nhị phân, không đọc được dạng text`);
      assertNotAborted(signal, url);
      this.requireOpenInApp()({ kind: 'file', target: absolutePath, line });
      return {
        content: buffer.toString('utf-8'),
        contentType: 'text/plain',
        immutable: true,
        notes: [`Đã mở ${absolutePath} trong Desktop`],
      };
    }

    throw new Error(`ompapp://${kind} không được hỗ trợ (chỉ session/file)`);
  }

  // ompapp://file/Users/x/a.txt (một dấu /) vẫn là đường dẫn tuyệt đối nếu không có trong workspace
  private async locateFile(filePart: string): Promise<string> {
    const resolved = this.resolvePath(filePart);
    if (filePart.startsWith('/') || (await statOrNull(resolved))) return resolved;
    const rootCandidate = `/${filePart}`;
    return (await statOrNull(rootCandidate)) ? rootCandidate : resolved;
  }

  private requireOpenInApp(): (request: HostOpenRequest) => void {
    if (!this.openInApp) throw new Error('Desktop chưa sẵn sàng nhận yêu cầu mở');
    return this.openInApp;
  }
}

function assertNotAborted(signal: AbortSignal | undefined, url: string) {
  if (signal?.aborted) throw new Error(`Host URI read for ${url} was aborted`);
}

// Tách hậu tố :<số dòng> ở cuối, giữ nguyên dấu ':' nằm trong tên file
function splitTrailingLine(target: string): { filePart: string; line?: number } {
  const colon = target.lastIndexOf(':');
  if (colon === -1) return { filePart: target };
  const suffix = target.slice(colon + 1);
  if (!/^\d+$/.test(suffix)) return { filePart: target };
  return { filePart: target.slice(0, colon), line: Number(suffix) };
}
