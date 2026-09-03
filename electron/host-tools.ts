import { tm } from '../shared/i18n/index.ts';
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

  // Register tool
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

  // Execute tool with timeout and signal protection
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

  // Register default tools of Desktop
  private registerBuiltinTools() {
    // 1. notify_user: Send macOS notification
    this.register({
      name: 'notify_user',
      label: 'Notify User',
      description: tm('electron.hostTools.notifyUser.desc'),
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: tm('electron.hostTools.notifyUser.titleDesc') },
          message: { type: 'string', description: tm('electron.hostTools.notifyUser.messageDesc') },
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
        return tm('electron.hostTools.notifyUser.sent', { title, body });
      },
    });

    // 2. open_in_browser: Open URL in default browser
    this.register({
      name: 'open_in_browser',
      label: 'Open URL in Browser',
      description: tm('electron.hostTools.openInBrowser.desc'),
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: tm('electron.hostTools.openInBrowser.urlDesc') },
        },
        required: ['url'],
      },
      execute: async (args: { url: string }) => {
        const targetUrl = String(args.url || '').trim();
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
          throw new Error(tm('electron.hostTools.openInBrowser.invalidProtocol'));
        }
        await shell.openExternal(targetUrl);
        return tm('electron.hostTools.openInBrowser.opened', { url: targetUrl });
      },
    });

    // 3. reveal_file: Show file in Finder
    this.register({
      name: 'reveal_file',
      label: 'Reveal in Finder',
      description: tm('electron.hostTools.revealFile.desc'),
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: tm('electron.hostTools.revealFile.filePathDesc') },
        },
        required: ['filePath'],
      },
      execute: async (args: { filePath: string }) => {
        const targetPath = String(args.filePath || '').trim();
        if (!targetPath) throw new Error(tm('electron.hostTools.revealFile.emptyPath'));
        shell.showItemInFolder(targetPath);
        return tm('electron.hostTools.revealFile.opened', { path: targetPath });
      },
    });

    // 4. open_in_app: Open file in app
    this.register({
      name: 'open_in_app',
      label: 'Open in Desktop App',
      description: tm('electron.hostTools.openInApp.desc'),
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: tm('electron.hostTools.openInApp.filePathDesc') },
          line: { type: 'number', description: tm('electron.hostTools.openInApp.lineDesc') },
        },
        required: ['filePath'],
      },
      execute: async (args: { filePath: string; line?: number }) => {
        const p = String(args.filePath || '').trim();
        if (!p) throw new Error(tm('electron.hostTools.openInApp.emptyPath'));
        if (!this.openInApp) throw new Error(tm('electron.hostTools.openInApp.notReady'));
        const line = typeof args.line === 'number' && args.line > 0 ? Math.floor(args.line) : undefined;
        this.openInApp({ kind: 'file', target: p, line });
        return line
          ? tm('electron.hostTools.openInApp.openedWithLine', { path: p, line: String(line) })
          : tm('electron.hostTools.openInApp.opened', { path: p });
      },
    });

    // 5. pick_file: Open native file picker dialog
    this.register({
      name: 'pick_file',
      label: 'Pick File Dialog',
      description: tm('electron.hostTools.pickFile.desc'),
      timeoutMs: PICK_FILE_TIMEOUT_MS,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: tm('electron.hostTools.pickFile.titleDesc') },
          defaultPath: { type: 'string', description: tm('electron.hostTools.pickFile.defaultPathDesc') },
        },
      },
      execute: async (args: { title?: string; defaultPath?: string }) => {
        const res = await dialog.showOpenDialog({
          title: args.title || tm('electron.hostTools.pickFile.defaultTitle'),
          defaultPath: args.defaultPath,
          properties: ['openFile', 'showHiddenFiles'],
        });
        if (res.canceled || res.filePaths.length === 0) {
          return tm('electron.hostTools.pickFile.canceled');
        }
        return tm('electron.hostTools.pickFile.selected', { path: res.filePaths[0] });
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

// Reply to host_uri_request of engine for registered Desktop schemes
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
        return { isError: true, error: tm('electron.hostTools.uri.readOnlyScheme', { scheme, op: operation }) };
      }
      if (scheme === 'ompapp') return await this.handleOmpApp(url, signal);
      if (scheme === 'vscode' || scheme === 'cursor') return await this.handleEditorLink(scheme, url, signal);
      return { isError: true, error: tm('electron.hostTools.uri.unsupportedScheme', { scheme }) };
    } catch (err: any) {
      return { isError: true, error: err?.message || String(err) };
    }
  }

  // Only allow vscode://file/<path> format to prevent deep-link issues
  private async handleEditorLink(scheme: string, url: string, signal?: AbortSignal): Promise<HostUriResultPayload> {
    if (!url.startsWith(`${scheme}://file/`)) {
      throw new Error(tm('electron.hostTools.uri.editorLinkFormat', { scheme }));
    }
    assertNotAborted(signal, url);
    this.notify(tm('electron.hostTools.uri.modelRequestedOpen', { url }));
    await shell.openExternal(url);
    return { content: tm('electron.hostTools.uri.openedWithEditor', { url, scheme }), contentType: 'text/plain', immutable: true };
  }

  private async handleOmpApp(url: string, signal?: AbortSignal): Promise<HostUriResultPayload> {
    const rest = url.slice('ompapp://'.length);
    const slash = rest.indexOf('/');
    const kind = slash === -1 ? rest : rest.slice(0, slash);
    const target = decodeURIComponent(slash === -1 ? '' : rest.slice(slash + 1));
    if (!target) throw new Error(tm('electron.hostTools.uri.missingDestination', { url }));

    if (kind === 'session') {
      assertNotAborted(signal, url);
      this.requireOpenInApp()({ kind: 'session', target });
      return { content: tm('electron.hostTools.uri.openedSession', { target }), contentType: 'text/plain', immutable: true };
    }

    if (kind === 'file') {
      const { filePart, line } = splitTrailingLine(target);
      const absolutePath = await this.locateFile(filePart);
      const stat = await statOrNull(absolutePath);
      if (!stat) throw new Error(tm('electron.hostTools.uri.fileNotFound', { path: filePart }));
      if (!stat.isFile()) throw new Error(tm('electron.hostTools.uri.notAFile', { path: filePart }));
      if (stat.size > MAX_URI_FILE_BYTES) throw new Error(tm('electron.hostTools.uri.fileTooLarge', { path: filePart, maxBytes: String(MAX_URI_FILE_BYTES) }));
      const buffer = await fs.promises.readFile(absolutePath);
      if (buffer.includes(0)) throw new Error(tm('electron.hostTools.uri.binaryFileError', { path: filePart }));
      assertNotAborted(signal, url);
      this.requireOpenInApp()({ kind: 'file', target: absolutePath, line });
      return {
        content: buffer.toString('utf-8'),
        contentType: 'text/plain',
        immutable: true,
        notes: [tm('electron.hostTools.uri.openedInDesktop', { path: absolutePath })],
      };
    }

    throw new Error(tm('electron.hostTools.uri.unsupportedKind', { kind }));
  }

  // ompapp://file/Users/x/a.txt is absolute path if not in workspace
  private async locateFile(filePart: string): Promise<string> {
    const resolved = this.resolvePath(filePart);
    if (filePart.startsWith('/') || (await statOrNull(resolved))) return resolved;
    const rootCandidate = `/${filePart}`;
    return (await statOrNull(rootCandidate)) ? rootCandidate : resolved;
  }

  private requireOpenInApp(): (request: HostOpenRequest) => void {
    if (!this.openInApp) throw new Error(tm('electron.hostTools.uri.notReady'));
    return this.openInApp;
  }
}

function assertNotAborted(signal: AbortSignal | undefined, url: string) {
  if (signal?.aborted) throw new Error(`Host URI read for ${url} was aborted`);
}

// Extract trailing :<line number>, preserving ':' in file names
function splitTrailingLine(target: string): { filePart: string; line?: number } {
  const colon = target.lastIndexOf(':');
  if (colon === -1) return { filePart: target };
  const suffix = target.slice(colon + 1);
  if (!/^\d+$/.test(suffix)) return { filePart: target };
  return { filePart: target.slice(0, colon), line: Number(suffix) };
}
