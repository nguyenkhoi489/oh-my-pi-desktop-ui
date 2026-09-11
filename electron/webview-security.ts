
import type { App, WebContents, Session } from 'electron';
import electronPkg from 'electron';
import path from 'path';
import fs from 'fs';

interface ElectronWithSession {
  session?: {
    fromPartition?: (partition: string) => Session;
  };
}
const electron = (typeof electronPkg === 'object' && electronPkg !== null
  ? ('default' in electronPkg ? (electronPkg.default as ElectronWithSession) : (electronPkg as ElectronWithSession))
  : {}) as ElectronWithSession;
const electronSession = electron.session;

const canonicalWsCache = new Map<string, string>();

export function clearCanonicalWsCache(): void {
  canonicalWsCache.clear();
}

async function getCanonicalWs(wsPath: string): Promise<string> {
  const cached = canonicalWsCache.get(wsPath);
  if (cached) return cached;
  const real = await fs.promises.realpath(wsPath);
  if (canonicalWsCache.size >= 50) {
    canonicalWsCache.clear();
  }
  canonicalWsCache.set(wsPath, real);
  return real;
}

export function isSafeFileUrlSync(urlStr: string, workspacePath?: string | null): boolean {
  if (!workspacePath) return false;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'file:') return false;
    const pathname = decodeURIComponent(parsed.pathname).replace(/^\/([a-zA-Z]:)/, '$1');
    const resolvedPath = path.resolve(pathname);
    const resolvedWs = path.resolve(workspacePath);
    const relative = path.relative(resolvedWs, resolvedPath);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  } catch {
    return false;
  }
}

export async function isSafeFileUrl(urlStr: string, workspacePath?: string | null): Promise<boolean> {
  if (!isSafeFileUrlSync(urlStr, workspacePath)) {
    return false;
  }
  try {
    const parsed = new URL(urlStr);
    const pathname = decodeURIComponent(parsed.pathname).replace(/^\/([a-zA-Z]:)/, '$1');
    const resolvedPath = path.resolve(pathname);
    const resolvedWs = path.resolve(workspacePath!);

    const [canonicalWs, canonicalPath] = await Promise.all([
      getCanonicalWs(resolvedWs),
      fs.promises.realpath(resolvedPath),
    ]);

    const relative = path.relative(canonicalWs, canonicalPath);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  } catch {
    return false;
  }
}

function isAllowedWebviewNavigation(urlStr: string, getWorkspacePath?: () => string | null | undefined): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'about:') {
      return true;
    }
    if (parsed.protocol === 'file:') {
      return isSafeFileUrlSync(urlStr, getWorkspacePath?.());
    }
    return false;
  } catch {
    return false;
  }
}
export interface WebviewPreferences {
  preload?: string;
  partition?: string;
  sandbox?: boolean;
  nodeIntegration?: boolean;
  nodeIntegrationInSubFrames?: boolean;
  contextIsolation?: boolean;
  webSecurity?: boolean;
  allowRunningInsecureContent?: boolean;
  [key: string]: unknown;
}

export interface WebviewAttachParams {
  src?: string;
  partition?: string;
  allowpopups?: boolean;
  'data-role'?: string;
  [key: string]: unknown;
}

export interface WebContentsPreventableEvent {
  preventDefault(): void;
}

export interface GuestWebviewSession {
  setPermissionCheckHandler(
    handler: (
      webContents: unknown,
      permission: string,
      requestingOrigin: string,
      details: unknown
    ) => boolean
  ): void;
  setPermissionRequestHandler(
    handler: (
      webContents: unknown,
      permission: string,
      callback: (permissionGranted: boolean) => void,
      details: unknown
    ) => void
  ): void;
}

export interface GuestWebContents {
  getType(): string;
  session?: GuestWebviewSession;
  setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' | 'allow' }): void;
  on(event: 'will-navigate', listener: (event: WebContentsPreventableEvent, navigationUrl: string) => void): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

export interface HostWebContents {
  on(
    event: 'will-attach-webview',
    listener: (
      waEvent: WebContentsPreventableEvent,
      webPreferences: WebviewPreferences,
      params: WebviewAttachParams
    ) => void
  ): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

export interface ElectronAppWithEvents {
  on(
    event: string,
    listener: (event: unknown, ...args: unknown[]) => void
  ): unknown;
  isReady?(): boolean;
  whenReady?(): Promise<void>;
}
export class WebviewGuestRegistry {
  private static guestContents: WebContents | null = null;

  static setGuest(contents: unknown): void {
    this.guestContents = (contents && typeof contents === 'object' ? contents : null) as WebContents | null;
  }

  static getGuest(): WebContents | null {
    if (this.guestContents && typeof this.guestContents.isDestroyed === 'function' && this.guestContents.isDestroyed()) {
      this.guestContents = null;
    }
    return this.guestContents;
  }

  static clearGuest(contents?: unknown): void {
    if (!contents || this.guestContents === contents) {
      this.guestContents = null;
    }
  }
}


export function installSessionSecurityFilters(
  sessionProvider?: { fromPartition?: (partition: string) => Session | unknown },
  getWorkspacePath?: () => string | null | undefined
): void {
  const sessionApi = (sessionProvider || electronSession) as {
    fromPartition?: (partition: string) => {
      webRequest?: {
        onBeforeRequest?: (
          filter: { urls: string[] },
          listener: (details: { url: string }, callback: (response: { cancel: boolean }) => void) => void
        ) => void;
      };
    };
  };

  if (!sessionApi?.fromPartition) return;

  for (const partition of ['persist:omp-agent-browser', 'persist:omp-agent-preview']) {
    try {
      const s = sessionApi.fromPartition(partition);
      if (s?.webRequest?.onBeforeRequest) {
        s.webRequest.onBeforeRequest({ urls: ['file://*/*'] }, (details, callback) => {
          void isSafeFileUrl(details.url, getWorkspacePath?.())
            .then((allowed) => {
              callback({ cancel: !allowed });
            })
            .catch(() => {
              callback({ cancel: true });
            });
        });
      }
    } catch (err) {
      console.error('[WebviewSecurity] Failed to attach onBeforeRequest for', partition, err);
    }
  }
}

export function configureWebviewSecurity(
  appInstance: App | ElectronAppWithEvents,
  openExternalFn?: (url: string) => void | Promise<unknown>,
  getWorkspacePath?: () => string | null | undefined,
  sessionProvider?: { fromPartition?: (partition: string) => Session | unknown }
): void {
  // Defer session-level partition filter installation until the Electron app is ready
  const appWithReady = appInstance as { isReady?: () => boolean; whenReady?: () => Promise<void> };
  const setupFilters = () => installSessionSecurityFilters(sessionProvider, getWorkspacePath);

  if (typeof appWithReady.isReady === 'function' && appWithReady.isReady()) {
    setupFilters();
  } else if (typeof appWithReady.whenReady === 'function') {
    void appWithReady.whenReady().then(setupFilters).catch((err) => {
      console.error('[WebviewSecurity] Failed waiting for app.whenReady', err);
    });
  } else {
    setupFilters();
  }
  // Cast to standard event-emitter interface for uniform registration
  const emitter = appInstance as ElectronAppWithEvents;
  emitter.on('web-contents-created', (_event: unknown, rawContents: unknown) => {
    const contents = rawContents as HostWebContents & Partial<GuestWebContents>;
    if (!contents || typeof contents.on !== 'function') return;

    contents.on('will-attach-webview', (waEvent, webPreferences, params) => {
      // Strip any custom preload script from guest webviews
      delete webPreferences.preload;

      // Enforce strict security isolation and sandbox
      webPreferences.sandbox = true;
      webPreferences.nodeIntegration = false;
      webPreferences.nodeIntegrationInSubFrames = false;
      webPreferences.contextIsolation = true;
      webPreferences.webSecurity = true;
      webPreferences.allowRunningInsecureContent = false;

      // Force dedicated persistent partition (preserving preview partition for canvas preview)
      const isPreview = params.partition === 'persist:omp-agent-preview' || params['data-role'] === 'preview';
      const targetPartition = isPreview ? 'persist:omp-agent-preview' : 'persist:omp-agent-browser';
      webPreferences.partition = targetPartition;
      params.partition = targetPartition;

      // Unconditionally deny popup window creation
      params.allowpopups = false;

      // Block dangerous schemes on initial attachment
      if (params.src && !isAllowedWebviewNavigation(params.src, getWorkspacePath)) {
        waEvent.preventDefault();
      }
    });

    if (typeof contents.getType === 'function' && contents.getType() === 'webview') {
      const isPreview = Boolean(
        electronSession?.fromPartition &&
        contents.session &&
        contents.session === electronSession.fromPartition('persist:omp-agent-preview')
      );
      if (!isPreview) {
        WebviewGuestRegistry.setGuest(contents);
      }
      if (typeof contents.on === 'function') {
        contents.on('destroyed', () => {
          if (!isPreview) {
            WebviewGuestRegistry.clearGuest(contents);
          }
        });
      }
      // Deny all permission requests and permission checks for guest webview sessions
      if (contents.session) {
        if (typeof contents.session.setPermissionRequestHandler === 'function') {
          contents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
            callback(false);
          });
        }
        if (typeof contents.session.setPermissionCheckHandler === 'function') {
          contents.session.setPermissionCheckHandler(() => false);
        }
      }

      if (typeof contents.setWindowOpenHandler === 'function') {
        contents.setWindowOpenHandler(({ url }) => {
          try {
            const parsed = new URL(url);
            if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && openExternalFn) {
              openExternalFn(url);
            }
          } catch {
            // Drop invalid URLs or dangerous protocols
          }
          return { action: 'deny' };
        });
      }

      contents.on('will-navigate', (navEvent, navigationUrl) => {
        if (!isAllowedWebviewNavigation(navigationUrl, getWorkspacePath)) {
          navEvent.preventDefault();
        }
      });
    }
  });
}
