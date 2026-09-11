import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { normalizeUrl, isSafeUrl } from '../src/utils/urlHelper.ts';
import * as os from 'node:os';
import { pathToFileURL } from 'node:url';
import {
  configureWebviewSecurity,
  isSafeFileUrl,
  isSafeFileUrlSync,
  clearCanonicalWsCache,
  installSessionSecurityFilters,
} from '../electron/webview-security.ts';
import { vi } from '../shared/i18n/vi.ts';
import { en } from '../shared/i18n/en.ts';

let passCount = 0;
async function test(name, fn) {
  await fn();
  passCount++;
  console.log(`✓ ${name}`);
}

console.log('=== Running verify-browser-panel.mjs ===');

// ----------------------------------------------------
// Test 1: URL Normalizer & Protocol Safety
// ----------------------------------------------------
await test('normalizeUrl correctly handles localhost, domains, queries, and schemes', () => {
  // Empty or whitespace
  assert.equal(normalizeUrl(''), 'about:blank');
  assert.equal(normalizeUrl('   '), 'about:blank');
  assert.equal(normalizeUrl('about:blank'), 'about:blank');

  // Localhost and loopback IPs
  assert.equal(normalizeUrl('localhost'), 'http://localhost');
  assert.equal(normalizeUrl('localhost:5173'), 'http://localhost:5173');
  assert.equal(normalizeUrl('localhost:3000/api/health'), 'http://localhost:3000/api/health');
  assert.equal(normalizeUrl('127.0.0.1'), 'http://127.0.0.1');
  assert.equal(normalizeUrl('127.0.0.1:8080'), 'http://127.0.0.1:8080');
  assert.equal(normalizeUrl('0.0.0.0:4000'), 'http://0.0.0.0:4000');
  assert.equal(normalizeUrl('[::1]:3000'), 'http://[::1]:3000');

  // Standard domains
  assert.equal(normalizeUrl('github.com'), 'https://github.com');
  assert.equal(normalizeUrl('google.com/search?q=test'), 'https://google.com/search?q=test');
  assert.equal(normalizeUrl('sub.domain.co.uk:8443/path'), 'https://sub.domain.co.uk:8443/path');

  // Preserved safe schemes
  assert.equal(normalizeUrl('https://vite.dev'), 'https://vite.dev');
  assert.equal(normalizeUrl('http://my-internal-server.local'), 'http://my-internal-server.local');

  // Search query fallback
  assert.equal(
    normalizeUrl('omp agent electron'),
    'https://www.google.com/search?q=omp%20agent%20electron'
  );
  assert.equal(
    normalizeUrl('singleword'),
    'https://www.google.com/search?q=singleword'
  );
  // Dangerous protocols sanitized to search query
  const jsResult = normalizeUrl('javascript:alert(1)');
  assert(jsResult.startsWith('https://www.google.com/search?q='), 'javascript: must be sanitized');
  const fileResult = normalizeUrl('file:///etc/passwd');
  assert(fileResult.startsWith('https://www.google.com/search?q='), 'file: must be sanitized');
  const dataResult = normalizeUrl('data:text/html,<h1>hacked</h1>');
  assert(dataResult.startsWith('https://www.google.com/search?q='), 'data: must be sanitized');
});

// ----------------------------------------------------
// Test 2: isSafeUrl Protocol Guard
// ----------------------------------------------------
await test('isSafeUrl accurately identifies safe and dangerous schemes', () => {
  assert.equal(isSafeUrl('http://localhost:5173'), true);
  assert.equal(isSafeUrl('https://github.com'), true);
  assert.equal(isSafeUrl('about:blank'), true);

  // Dangerous or invalid schemes
  assert.equal(isSafeUrl('javascript:alert(1)'), false);
  assert.equal(isSafeUrl('file:///etc/passwd'), false);
  assert.equal(isSafeUrl('data:text/plain,hello'), false);
  assert.equal(isSafeUrl('vbscript:msgbox(1)'), false);
  assert.equal(isSafeUrl('not a url'), false);
  assert.equal(isSafeUrl(''), false);
});

// ----------------------------------------------------
// Test 3: Electron Main Webview Security Lockdown
// ----------------------------------------------------
await test('configureWebviewSecurity enforces webview sandbox and blocks unsafe navigation', () => {
  const listeners = {};
  const mockApp = {
    on: (event, handler) => {
      listeners[event] = handler;
    },
  };

  configureWebviewSecurity(mockApp);
  assert(typeof listeners['web-contents-created'] === 'function', 'Must attach web-contents-created listener');

  // Test will-attach-webview security lockdown
  const webviewContentsListeners = {};
  const mockContents = {
    on: (event, handler) => {
      webviewContentsListeners[event] = handler;
    },
    getType: () => 'webview',
    session: {
      setPermissionRequestHandler: (handler) => {
        mockContents._permissionRequestHandler = handler;
      },
      setPermissionCheckHandler: (handler) => {
        mockContents._permissionCheckHandler = handler;
      },
    },
    setWindowOpenHandler: (handler) => {
      mockContents._windowOpenHandler = handler;
    },
  };

  listeners['web-contents-created']({}, mockContents);

  // 1. Verify will-attach-webview removes preload and sets sandboxed webPreferences
  assert(typeof webviewContentsListeners['will-attach-webview'] === 'function', 'Must attach will-attach-webview');
  const mockPrefs = {
    preload: '/malicious/preload.js',
    nodeIntegration: true,
    nodeIntegrationInSubFrames: true,
    contextIsolation: false,
    webSecurity: false,
    allowRunningInsecureContent: true,
  };
  let attachPrevented = false;
  const mockWaEvent = {
    preventDefault: () => {
      attachPrevented = true;
    },
  };

  const mockParams = { src: 'https://safe.example.com', allowpopups: true };
  webviewContentsListeners['will-attach-webview'](mockWaEvent, mockPrefs, mockParams);
  assert.equal(mockPrefs.preload, undefined, 'Preload must be deleted from guest webview');
  assert.equal(mockPrefs.sandbox, true, 'sandbox must be enabled');
  assert.equal(mockPrefs.nodeIntegration, false, 'nodeIntegration must be disabled');
  assert.equal(mockPrefs.nodeIntegrationInSubFrames, false, 'nodeIntegrationInSubFrames must be disabled');
  assert.equal(mockPrefs.contextIsolation, true, 'contextIsolation must be enabled');
  assert.equal(mockPrefs.webSecurity, true, 'webSecurity must be enabled');
  assert.equal(mockPrefs.allowRunningInsecureContent, false, 'allowRunningInsecureContent must be disabled');
  assert.equal(mockPrefs.partition, 'persist:omp-agent-browser', 'webPreferences partition must be set');
  assert.equal(mockParams.partition, 'persist:omp-agent-browser', 'params partition must be set');
  assert.equal(mockParams.allowpopups, false, 'allowpopups must be unconditionally forced to false');
  assert.equal(attachPrevented, false, 'Safe URL must not be prevented');

  // Verify permission request and check handlers are installed and deny everything
  assert(typeof mockContents._permissionRequestHandler === 'function', 'setPermissionRequestHandler must be installed');
  let granted = null;
  mockContents._permissionRequestHandler({}, 'geolocation', (result) => {
    granted = result;
  }, {});
  assert.equal(granted, false, 'Permission requests must be denied unconditionally');

  assert(typeof mockContents._permissionCheckHandler === 'function', 'setPermissionCheckHandler must be installed');
  const checkResult = mockContents._permissionCheckHandler({}, 'camera', 'https://example.com', {});
  assert.equal(checkResult, false, 'Permission checks must return false unconditionally');
  // 2. Verify dangerous initial src is blocked
  attachPrevented = false;
  webviewContentsListeners['will-attach-webview'](mockWaEvent, mockPrefs, { src: 'file:///etc/hosts' });
  assert.equal(attachPrevented, true, 'file: protocol must prevent attachment');

  attachPrevented = false;
  webviewContentsListeners['will-attach-webview'](mockWaEvent, mockPrefs, { src: 'javascript:alert(1)' });
  assert.equal(attachPrevented, true, 'javascript: protocol must prevent attachment');

  // 3. Verify will-navigate blocks dangerous schemes
  assert(typeof webviewContentsListeners['will-navigate'] === 'function', 'Must attach will-navigate');
  let navPrevented = false;
  const mockNavEvent = {
    preventDefault: () => {
      navPrevented = true;
    },
  };

  webviewContentsListeners['will-navigate'](mockNavEvent, 'file:///secret.txt');
  assert.equal(navPrevented, true, 'Navigation to file:// must be prevented');

  navPrevented = false;
  webviewContentsListeners['will-navigate'](mockNavEvent, 'javascript:doEvil()');
  assert.equal(navPrevented, true, 'Navigation to javascript: must be prevented');

  navPrevented = false;
  webviewContentsListeners['will-navigate'](mockNavEvent, 'http://localhost:5173');
  assert.equal(navPrevented, false, 'Navigation to http://localhost must be allowed');

  navPrevented = false;
  webviewContentsListeners['will-navigate'](mockNavEvent, 'https://github.com');
  assert.equal(navPrevented, false, 'Navigation to https:// must be allowed');

  // 4. Verify setWindowOpenHandler denies new webview windows and validates protocols
  assert(typeof mockContents._windowOpenHandler === 'function', 'setWindowOpenHandler must be configured');
  let openedExternalUrl = null;
  configureWebviewSecurity(mockApp, (url) => {
    openedExternalUrl = url;
  });
  // Re-trigger attach to register with openExternalFn
  listeners['web-contents-created']({}, mockContents);

  // Safe HTTP/HTTPS url gets opened externally
  const safeOpenRes = mockContents._windowOpenHandler({ url: 'https://external.site' });
  assert.equal(safeOpenRes.action, 'deny', 'New window opening in webview must be denied');
  assert.equal(openedExternalUrl, 'https://external.site', 'Safe URL must be forwarded to openExternal');

  // Dangerous scheme is NOT forwarded to openExternal
  openedExternalUrl = null;
  const dangerousOpenRes = mockContents._windowOpenHandler({ url: 'file:///etc/passwd' });
  assert.equal(dangerousOpenRes.action, 'deny', 'Dangerous window opening must be denied');
  assert.equal(openedExternalUrl, null, 'Dangerous URL must never be forwarded to openExternal');
});

// ----------------------------------------------------
// Test 4: Inspector & Browser Structural Invariants
// ----------------------------------------------------
await test('BrowserPanel and InspectorPanel enforce persistent DOM mounting and security partition', async () => {
  const browserPanelSrc = await fs.readFile(
    path.resolve('src/components/Inspector/BrowserPanel.tsx'),
    'utf-8'
  );
  const inspectorPanelSrc = await fs.readFile(
    path.resolve('src/components/Inspector/InspectorPanel.tsx'),
    'utf-8'
  );
  const summaryPanelSrc = await fs.readFile(
    path.resolve('src/components/Inspector/SummaryPanel.tsx'),
    'utf-8'
  );

  // BrowserPanel checks
  assert(
    browserPanelSrc.includes("partition = 'persist:omp-agent-browser'"),
    'BrowserPanel must default to persist:omp-agent-browser partition'
  );
  assert(
    browserPanelSrc.includes('partition={partition}'),
    'BrowserPanel must apply partition prop to webview'
  );
  assert(
    browserPanelSrc.includes('allowpopups={false}'),
    'BrowserPanel must disable popups'
  );
  assert(
    browserPanelSrc.includes('memo(function BrowserPanel'),
    'BrowserPanel must be wrapped in React.memo'
  );
  assert(
    browserPanelSrc.includes('render-process-gone'),
    'BrowserPanel must handle render-process-gone crash events'
  );

  // InspectorPanel checks
  assert(
    inspectorPanelSrc.includes('memo(function InspectorPanel'),
    'InspectorPanel must be wrapped in React.memo'
  );
  assert(
    inspectorPanelSrc.includes("key.toLowerCase() === 'b'"),
    'InspectorPanel must handle Cmd+Shift+B shortcut'
  );
  // Verify tabs are preserved via 'hidden' rather than conditional unmount
  assert(
    inspectorPanelSrc.includes("currentTab === 'browser' ? 'block' : 'hidden'"),
    'Browser tab must remain mounted in DOM to preserve webview session across tab switches'
  );
  assert(
    inspectorPanelSrc.includes("currentTab === 'changes' ? 'block' : 'hidden'"),
    'Changes tab must remain mounted in DOM'
  );

  // SummaryPanel checks
  assert(
    summaryPanelSrc.includes('memo(function SummaryPanel'),
    'SummaryPanel must be wrapped in React.memo'
  );
  assert(
    browserPanelSrc.includes("'unresponsive'"),
    'BrowserPanel must listen for unresponsive events'
  );
  assert(
    browserPanelSrc.includes('handleRecoverReload'),
    'BrowserPanel must provide a recovery reload handler'
  );

  // App.tsx mounting checks
  const appSrc = await fs.readFile(path.resolve('src/App.tsx'), 'utf-8');
  assert(
    appSrc.includes('<InspectorPanel'),
    'App.tsx must mount InspectorPanel'
  );
  assert(
    appSrc.includes("setInspectorTab('browser')"),
    'App.tsx must handle Cmd+Shift+B shortcut to open browser tab'
  );
});

// ----------------------------------------------------
// Test 5: i18n Keys Parity for Inspector & Browser
// ----------------------------------------------------
await test('All required Inspector, Browser, and Summary i18n keys are registered in vi and en', () => {
  const requiredKeys = [
    'inspector.title',
    'inspector.tabs.summary',
    'inspector.tabs.changes',
    'inspector.tabs.browser',
    'inspector.tabs.files',
    'inspector.expandToCanvas',
    'inspector.collapse',
    'inspector.close',
    'inspector.shortcut',
    'browser.addressPlaceholder',
    'browser.back',
    'browser.forward',
    'browser.reload',
    'browser.stop',
    'browser.openExternal',
    'browser.sendToChat',
    'browser.toggleDevTools',
    'browser.loading',
    'browser.crashTitle',
    'browser.crashDesc',
    'browser.crashReload',
    'browser.loadErrorTitle',
    'browser.loadErrorDesc',
    'browser.mockNotice',
    'summary.title',
    'summary.contextUsage',
    'summary.tokensUsed',
    'summary.contextWindow',
    'summary.tokensPerSecond',
    'summary.speedUnit',
    'summary.activeModel',
    'summary.workspace',
    'summary.messagesCount',
    'summary.refreshStats',
    'summary.status',
    'summary.noActiveSession',
  ];

  for (const key of requiredKeys) {
    assert(Boolean(vi[key]), `Key "${key}" must exist in vi.ts`);
    assert(Boolean(en[key]), `Key "${key}" must exist in en.ts`);
    assert.notEqual(vi[key], '', `Key "${key}" in vi.ts must not be empty`);
    assert.notEqual(en[key], '', `Key "${key}" in en.ts must not be empty`);
  }
});

// ----------------------------------------------------
// Test 6: In-App Browser Link Routing & Session Synchronization
// ----------------------------------------------------
await test('BrowserPanel and InspectorPanel support external URL navigation and event routing', async () => {
  const browserPanelSrc = await fs.readFile(path.resolve('src/components/Inspector/BrowserPanel.tsx'), 'utf-8');
  const inspectorPanelSrc = await fs.readFile(path.resolve('src/components/Inspector/InspectorPanel.tsx'), 'utf-8');
  const appSrc = await fs.readFile(path.resolve('src/App.tsx'), 'utf-8');
  const mainSrc = await fs.readFile(path.resolve('electron/main.ts'), 'utf-8');

  assert(browserPanelSrc.includes('urlNonce'), 'BrowserPanel supports urlNonce prop for external re-navigation');
  assert(inspectorPanelSrc.includes('hasVisitedBrowser'), 'InspectorPanel preserves browser tab visibility once visited');
  assert(inspectorPanelSrc.includes('browserUrlNonce'), 'InspectorPanel forwards browserUrlNonce to BrowserPanel');
  assert(appSrc.includes('handleOpenBrowser'), 'App.tsx defines handleOpenBrowser callback');
  assert(appSrc.includes('omp:open-in-app-browser'), 'App.tsx listens for omp:open-in-app-browser event');
  assert(appSrc.includes('onOpenBrowser={handleOpenBrowser}'), 'App.tsx passes onOpenBrowser to AgentPanel');
  assert(mainSrc.includes('mainWindow.webContents.setWindowOpenHandler'), 'electron/main.ts intercepts window open to route to in-app browser');
});

// ----------------------------------------------------
// Test 7: Canonical Workspace Boundary, Symlink Escape Guard & Deferred Session Filters
// ----------------------------------------------------
await test('isSafeFileUrl prevents symlink escapes and configureWebviewSecurity defers session filters until whenReady', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omp-sec-ws-'));
  const secretDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omp-sec-ext-'));

  try {
    clearCanonicalWsCache();

    const safeFile = path.join(tempDir, 'safe.html');
    await fs.writeFile(safeFile, '<h1>Safe Workspace Content</h1>', 'utf-8');
    const secretFile = path.join(secretDir, 'credentials.env');
    await fs.writeFile(secretFile, 'API_KEY=secret_leaked', 'utf-8');
    const symlinkEscapeFile = path.join(tempDir, 'escape.html');
    await fs.symlink(secretFile, symlinkEscapeFile);
    const subDir = path.join(tempDir, 'components');
    await fs.mkdir(subDir);
    const symlinkSafeFile = path.join(subDir, 'safe-link.html');
    await fs.symlink(safeFile, symlinkSafeFile);
    const safeUrl = pathToFileURL(safeFile).href;
    const secretUrl = pathToFileURL(secretFile).href;
    const symlinkEscapeUrl = pathToFileURL(symlinkEscapeFile).href;
    const symlinkSafeUrl = pathToFileURL(symlinkSafeFile).href;

    assert.equal(isSafeFileUrlSync(symlinkEscapeUrl, tempDir), true, 'Lexical check cannot detect symlink escape');

    const isEscapeAllowed = await isSafeFileUrl(symlinkEscapeUrl, tempDir);
    assert.equal(isEscapeAllowed, false, 'isSafeFileUrl must resolve realpath and block symlink escape');

    const isSafeAllowed = await isSafeFileUrl(safeUrl, tempDir);
    assert.equal(isSafeAllowed, true, 'isSafeFileUrl must allow direct file inside workspace');

    const isSafeSymlinkAllowed = await isSafeFileUrl(symlinkSafeUrl, tempDir);
    assert.equal(isSafeSymlinkAllowed, true, 'isSafeFileUrl must allow symlink pointing within workspace');

    const isSecretAllowed = await isSafeFileUrl(secretUrl, tempDir);
    assert.equal(isSecretAllowed, false, 'isSafeFileUrl must block direct file outside workspace');

    assert.equal(await isSafeFileUrl('http://localhost:5173', tempDir), false, 'HTTP URL must return false in isSafeFileUrl');
    assert.equal(await isSafeFileUrl('javascript:alert(1)', tempDir), false, 'javascript URL must return false in isSafeFileUrl');
    assert.equal(await isSafeFileUrl(safeUrl, null), false, 'Null workspace must return false');
    assert.equal(await isSafeFileUrl(safeUrl, undefined), false, 'Undefined workspace must return false');

    const installedPartitions = {};
    const mockSessionProvider = {
      fromPartition: (partition) => {
        const sessionMock = {
          webRequest: {
            onBeforeRequest: (filter, listener) => {
              installedPartitions[partition] = { filter, listener };
            },
          },
        };
        return sessionMock;
      },
    };

    let whenReadyResolved = false;
    let resolveWhenReady = null;
    const whenReadyPromise = new Promise((resolve) => {
      resolveWhenReady = () => {
        whenReadyResolved = true;
        resolve();
      };
    });

    const mockAppWithWhenReady = {
      on: () => {},
      isReady: () => whenReadyResolved,
      whenReady: () => whenReadyPromise,
    };

    // Configure before app is ready
    configureWebviewSecurity(
      mockAppWithWhenReady,
      () => {},
      () => tempDir,
      mockSessionProvider
    );

    // Before whenReady resolves, filters must NOT be installed yet
    assert.equal(Object.keys(installedPartitions).length, 0, 'Filters must not install before whenReady resolves');

    // Resolve whenReady
    resolveWhenReady();
    await whenReadyPromise;
    // Allow microtask tick for .then callback
    await new Promise((resolve) => setImmediate(resolve));

    // Filters must now be installed on both partitions
    assert(Boolean(installedPartitions['persist:omp-agent-browser']), 'Browser partition filter must be installed');
    assert(Boolean(installedPartitions['persist:omp-agent-preview']), 'Preview partition filter must be installed');

    const browserFilter = installedPartitions['persist:omp-agent-browser'];
    assert.deepEqual(browserFilter.filter, { urls: ['file://*/*'] }, 'Filter pattern must target file://*/*');

    const checkUrlCancel = (url) =>
      new Promise((resolve) => {
        browserFilter.listener({ url }, (response) => {
          resolve(response.cancel);
        });
      });

    const cancelSafe = await checkUrlCancel(safeUrl);
    const cancelSafeSymlink = await checkUrlCancel(symlinkSafeUrl);
    const cancelSymlinkEscape = await checkUrlCancel(symlinkEscapeUrl);
    const cancelSecret = await checkUrlCancel(secretUrl);

    assert.equal(cancelSafe, false, 'onBeforeRequest must NOT cancel safe workspace file');
    assert.equal(cancelSafeSymlink, false, 'onBeforeRequest must NOT cancel safe symlink within workspace');
    assert.equal(cancelSymlinkEscape, true, 'onBeforeRequest MUST cancel symlink escaping workspace');
    assert.equal(cancelSecret, true, 'onBeforeRequest MUST cancel direct external file');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(secretDir, { recursive: true, force: true }).catch(() => {});
    clearCanonicalWsCache();
  }
});

// ----------------------------------------------------
// Test 8: Webview Navigation Loop Defense & ERR_ABORTED Mitigation
// ----------------------------------------------------
await test('BrowserPanel protects against in-page anchor loops and double-navigation aborts', async () => {
  const browserPanelSrc = await fs.readFile(path.resolve('src/components/Inspector/BrowserPanel.tsx'), 'utf-8');

  // Verify webview uses static initialSrcRef rather than dynamic reactive src={url}
  assert(
    browserPanelSrc.includes('src={initialSrcRef.current}'),
    'BrowserPanel must use initialSrcRef to prevent React re-renders from re-triggering top-level navigations'
  );

  // Verify loadURL Promise catches and suppresses ERR_ABORTED (-3)
  assert(
    browserPanelSrc.includes("errObj?.code === 'ERR_ABORTED'") || browserPanelSrc.includes('ERR_ABORTED'),
    'BrowserPanel must catch and suppress ERR_ABORTED (-3) on loadURL'
  );

  // Verify in-page navigation does not trigger loadURL loop
  assert(
    browserPanelSrc.includes('currentWvUrl === normalized'),
    'BrowserPanel must deduplicate navigations when webview is already at the target URL'
  );
});

console.log(`\nAll ${passCount} browser-panel verify tests passed successfully!`);
