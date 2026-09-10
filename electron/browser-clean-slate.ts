/**
 * Browser clean slate: storage, cache, auth, and DNS reset for guest webview partition.
 * Ensures complete task isolation between sessions without breaking partition contracts.
 */

import electronPkg from 'electron';
import type { WebContents } from 'electron';
import { WebviewGuestRegistry } from './webview-security.ts';

const electron = typeof electronPkg === 'object' && electronPkg !== null ? ((electronPkg as { default?: unknown }).default || electronPkg) as typeof electronPkg : {} as typeof electronPkg;
const session = electron.session;

export const BROWSER_PARTITION = 'persist:omp-agent-browser';

/**
 * Clears cookies, local/session storage, indexedDB, serviceWorkers,
 * HTTP cache, auth cache, and host resolver (DNS) cache.
 * Guarantees a clean slate for the browser partition between tasks or session switches.
 */
export async function cleanBrowserSessionStorage(
  partition: string = BROWSER_PARTITION
): Promise<void> {
  try {
    const ses = typeof session?.fromPartition === 'function' ? session.fromPartition(partition) : null;
    if (!ses) return;

    const tasks: Promise<unknown>[] = [];

    if (typeof ses.clearStorageData === 'function') {
      tasks.push(ses.clearStorageData());
    }
    if (typeof ses.clearCache === 'function') {
      tasks.push(ses.clearCache());
    }
    if (typeof ses.clearAuthCache === 'function') {
      tasks.push(ses.clearAuthCache());
    }
    if (typeof ses.clearHostResolverCache === 'function') {
      tasks.push(ses.clearHostResolverCache());
    }

    // Await with 5s timeout guard to prevent main process blocking (AGENTS.md Hard rule 2)
    await Promise.race([
      Promise.all(tasks),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);
  } catch {
    // Non-fatal, graceful degrade
  }
}

/**
 * Resets the guest webview to about:blank to tear down active scripts, DOM, and workers.
 */
export async function resetWebviewToBlank(webContents?: WebContents | null): Promise<void> {
  const target = webContents || WebviewGuestRegistry.getGuest();
  if (target && typeof target.isDestroyed === 'function' && !target.isDestroyed()) {
    if (typeof target.loadURL === 'function') {
      try {
        await target.loadURL('about:blank');
      } catch {
        // ignore navigation errors during teardown
      }
    }
  }
}
