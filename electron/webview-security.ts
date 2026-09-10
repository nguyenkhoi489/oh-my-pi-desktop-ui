/**
 * Webview security hardening for Electron guest webcontents.
 */

import type { App, WebContents } from 'electron';

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


/**
 * Attaches security lockdown handlers for all webviews created in the Electron application.
 */
export function configureWebviewSecurity(
  appInstance: App | ElectronAppWithEvents,
  openExternalFn?: (url: string) => void | Promise<unknown>
): void {
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

      // Force dedicated persistent partition
      webPreferences.partition = 'persist:omp-agent-browser';
      params.partition = 'persist:omp-agent-browser';

      // Unconditionally deny popup window creation
      params.allowpopups = false;

      // Block dangerous schemes on initial attachment
      if (params.src) {
        try {
          const parsed = new URL(params.src);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'about:') {
            waEvent.preventDefault();
          }
        } catch {
          waEvent.preventDefault();
        }
      }
    });

    if (typeof contents.getType === 'function' && contents.getType() === 'webview') {
      WebviewGuestRegistry.setGuest(contents);
      if (typeof contents.on === 'function') {
        contents.on('destroyed', () => {
          WebviewGuestRegistry.clearGuest(contents);
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
        try {
          const parsed = new URL(navigationUrl);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'about:') {
            navEvent.preventDefault();
          }
        } catch {
          navEvent.preventDefault();
        }
      });
    }
  });
}
