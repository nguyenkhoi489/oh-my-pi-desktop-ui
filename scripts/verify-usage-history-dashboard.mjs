/**
 * Verification Suite: Usage History, Clients, Invalidation & Stats Dashboard (Phase 8)
 *
 * Kiểm tra:
 * 1. Parse JSON fixture từ `omp usage --history` và `omp usage clients`.
 * 2. Stub CLI tests cho fetchUsageHistory, fetchUsageClients, invalidateUsage, fetchGlobalUsage (với provider/redact).
 * 3. StatsDashboardManager vòng đời start/stop/status với stub server.
 * 4. Contract inspection: IPC handlers trong main.ts, electron/types.ts, preload.ts, src/types/index.ts.
 * 5. URL Security validation cho shell:open-external.
 * 6. Live verification nếu binary omp có sẵn.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  extractJsonSubstring,
  parseUsageJson,
  parseUsageHistoryJson,
  parseUsageClientsJson,
  fetchGlobalUsage,
  fetchUsageHistory,
  fetchUsageClients,
  invalidateUsage,
  clearUsageStatsCache,
  getUsageStatsCacheInfo,
} from '../electron/usage-stats.ts';
import { StatsDashboardManager } from '../electron/stats-dashboard.ts';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`❌ FAILED: ${message}`);
  }
}

console.log('=== Starting Usage History & Stats Dashboard Verification Suite ===\n');

// ----------------------------------------------------
// Fixtures
// ----------------------------------------------------
const FIXTURE_USAGE_HISTORY_JSON = JSON.stringify({
  generatedAt: 1788409911357,
  sinceMs: 1788323511357,
  entries: [
    {
      recordedAt: 1788328568079,
      provider: 'openai-codex',
      accountKey: 'oauth|account:e30ace4d|email:user@example.com',
      email: 'user@example.com',
      accountId: 'e30ace4d',
      limitId: 'openai-codex:primary',
      label: '5 hours',
      windowLabel: '5 hours',
      usedFraction: 0.25,
      status: 'ok',
      resetsAt: 1788338793000,
    },
    {
      recordedAt: 1788338568079,
      provider: 'openai-codex',
      accountKey: 'oauth|account:e30ace4d|email:user@example.com',
      email: 'user@example.com',
      accountId: 'e30ace4d',
      limitId: 'openai-codex:secondary',
      label: '7 days',
      windowLabel: '7 days',
      usedFraction: 0.65,
      status: 'ok',
      resetsAt: 1788762388000,
    },
  ],
});

const FIXTURE_USAGE_CLIENTS_JSON = JSON.stringify({
  generatedAt: 1788409913930,
  sinceMs: 1787805113930,
  clients: [
    {
      client: 'omp-desktop-mac',
      name: 'MacBook Pro M1',
      id: 'client-1',
      tokens: 154000,
      inputTokens: 120000,
      outputTokens: 34000,
      cost: 0.42,
      sessions: 12,
      lastActiveAt: 1788409900000,
    },
  ],
});

// ----------------------------------------------------
// Test 1: Parser Functions
// ----------------------------------------------------
console.log('[Test 1] Parser Functions & Validation');
{
  const historyParsed = parseUsageHistoryJson(FIXTURE_USAGE_HISTORY_JSON);
  assert(historyParsed.data != null, 'parseUsageHistoryJson parses valid fixture');
  assert(historyParsed.data?.entries.length === 2, 'parseUsageHistoryJson captures 2 entries');
  assert(historyParsed.data?.entries[0].provider === 'openai-codex', 'entry[0] provider is openai-codex');
  assert(historyParsed.data?.entries[1].usedFraction === 0.65, 'entry[1] usedFraction is 0.65');

  const historyWithLogs = `Syncing history...\n${FIXTURE_USAGE_HISTORY_JSON}\nDone.`;
  const historyParsedWithLogs = parseUsageHistoryJson(historyWithLogs);
  assert(historyParsedWithLogs.data != null, 'parseUsageHistoryJson handles logs around JSON');
  assert(historyParsedWithLogs.data?.entries.length === 2, 'parsed entries count with logs is 2');

  const clientsParsed = parseUsageClientsJson(FIXTURE_USAGE_CLIENTS_JSON);
  assert(clientsParsed.data != null, 'parseUsageClientsJson parses valid fixture');
  assert(clientsParsed.data?.clients.length === 1, 'parseUsageClientsJson captures 1 client');
  assert(clientsParsed.data?.clients[0].client === 'omp-desktop-mac', 'client name is omp-desktop-mac');

  const invalidHistory = parseUsageHistoryJson('Not a JSON string');
  assert(invalidHistory.error != null, 'parseUsageHistoryJson returns error for invalid string');

  const invalidClients = parseUsageClientsJson('{ "invalid": true }');
  assert(invalidClients.error != null, 'parseUsageClientsJson returns error when clients array is missing');
}

// ----------------------------------------------------
// Test 2: Stub CLI Execution, Flags & Cache Invalidation
// ----------------------------------------------------
console.log('\n[Test 2] Stub CLI Execution, Flags & Cache Invalidation');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-usage-history-test-'));

const stubScriptPath = path.join(tempDir, 'stub-omp.sh');
fs.writeFileSync(
  stubScriptPath,
  `#!/bin/bash
ARGS="$*"

if [[ "$ARGS" == *"usage"*"--history"* ]]; then
  echo '${FIXTURE_USAGE_HISTORY_JSON}'
  exit 0
fi

if [[ "$ARGS" == *"usage"*"clients"* ]]; then
  echo '${FIXTURE_USAGE_CLIENTS_JSON}'
  exit 0
fi

if [[ "$ARGS" == *"usage"*"invalidate"* ]]; then
  echo "Invalidated cached usage reports for all providers."
  exit 0
fi

if [[ "$ARGS" == *"usage"*"--redact"* ]]; then
  echo '{"generatedAt":1788409911357,"reports":[{"provider":"anthropic","metadata":{"email":"u***@..."}}]}'
  exit 0
fi

if [[ "$ARGS" == *"usage"*"--provider anthropic"* ]]; then
  echo '{"generatedAt":1788409911357,"reports":[{"provider":"anthropic"}]}'
  exit 0
fi

if [[ "$ARGS" == *"usage"* ]]; then
  echo '{"generatedAt":1788409911357,"reports":[]}'
  exit 0
fi

echo "Unknown command: $ARGS" >&2
exit 1
`,
  { mode: 0o755 }
);

async function runCliTests() {
  clearUsageStatsCache();

  // 1. Fetch History
  const histRes = await fetchUsageHistory(stubScriptPath, { days: 7, provider: 'openai-codex' });
  assert(histRes.success === true, 'fetchUsageHistory succeeds with stub CLI');
  assert(histRes.data?.entries.length === 2, 'fetchUsageHistory returns 2 entries');

  const cacheInfo1 = getUsageStatsCacheInfo();
  assert(cacheInfo1.historyCachedCount > 0, 'history is cached in memory');

  // Cached read
  const histCached = await fetchUsageHistory(stubScriptPath, { days: 7, provider: 'openai-codex' });
  assert(histCached.success === true, 'fetchUsageHistory reads from cache');

  // 2. Fetch Clients
  const clientsRes = await fetchUsageClients(stubScriptPath, { days: 7 });
  assert(clientsRes.success === true, 'fetchUsageClients succeeds with stub CLI');
  assert(clientsRes.data?.clients[0].client === 'omp-desktop-mac', 'client is omp-desktop-mac');

  const cacheInfo2 = getUsageStatsCacheInfo();
  assert(cacheInfo2.clientsCachedCount > 0, 'clients are cached in memory');

  // 3. Invalidate Usage
  const invalidateRes = await invalidateUsage(stubScriptPath);
  assert(invalidateRes.success === true, 'invalidateUsage succeeds with stub CLI');
  assert(invalidateRes.message?.includes('Invalidated cached usage reports'), 'invalidateUsage returns confirmation message');

  const cacheInfo3 = getUsageStatsCacheInfo();
  assert(cacheInfo3.historyCachedCount === 0, 'invalidateUsage clears historyCache');
  assert(cacheInfo3.clientsCachedCount === 0, 'invalidateUsage clears clientsCache');

  // 4. Fetch Global Usage with redact & provider
  const redactRes = await fetchGlobalUsage(stubScriptPath, { redact: true });
  assert(redactRes.success === true, 'fetchGlobalUsage with redact succeeds');
  assert(redactRes.data?.reports?.[0].metadata?.email === 'u***@...', 'redacted email returned');

  const providerRes = await fetchGlobalUsage(stubScriptPath, { provider: 'anthropic' });
  assert(providerRes.success === true, 'fetchGlobalUsage with provider succeeds');
  assert(providerRes.data?.reports?.[0].provider === 'anthropic', 'provider-specific usage returned');
}

// ----------------------------------------------------
// Test 3: StatsDashboardManager Lifecycle
// ----------------------------------------------------
console.log('\n[Test 3] StatsDashboardManager Lifecycle');
async function runDashboardManagerTests() {
  const manager = new StatsDashboardManager();
  const initialStatus = manager.status();
  assert(initialStatus.running === false, 'initial dashboard status is not running');
  assert(initialStatus.status === 'stopped', 'initial dashboard status is stopped');

  // Tạo stub server script giả lập `omp stats -p <port>`
  const testPort = 34589;
  const stubServerScript = path.join(tempDir, 'stub-stats-server.js');
  fs.writeFileSync(
    stubServerScript,
    `
const http = require('http');
const pIdx = process.argv.indexOf('-p');
const port = pIdx !== -1 ? Number(process.argv[pIdx + 1]) : 34589;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OMP Stats Dashboard');
});
server.listen(port, '127.0.0.1', () => {
  console.log('Dashboard available at: http://127.0.0.1:' + port);
});
`
  );

  const stubNodeBinary = process.execPath;
  // Wrapper script để gọi `node stub-stats-server.js stats -p <port>`
  const serverLauncher = path.join(tempDir, 'launcher.sh');
  fs.writeFileSync(
    serverLauncher,
    `#!/bin/bash
exec "${stubNodeBinary}" "${stubServerScript}" "$@"
`,
    { mode: 0o755 }
  );

  // Khởi động server qua manager
  const startRes = await manager.start(serverLauncher, { port: testPort, timeoutMs: 5000 });
  assert(startRes.success === true, 'manager.start succeeds');
  assert(startRes.status.running === true, 'manager.status.running is true');
  assert(startRes.status.port === testPort, `manager.status.port is ${testPort}`);
  assert(startRes.status.url === `http://127.0.0.1:${testPort}`, 'manager.status.url matches');

  // Gọi start lần 2 khi đã chạy -> trả về trạng thái hiện tại
  const secondStart = await manager.start(serverLauncher, { port: testPort });
  assert(secondStart.success === true, 'second manager.start returns success');

  // Dừng server
  const stopRes = await manager.stop();
  assert(stopRes.success === true, 'manager.stop succeeds');
  assert(stopRes.status.running === false, 'manager.status.running is false after stop');
  assert(stopRes.status.status === 'stopped', 'manager.status.status is stopped after stop');

  // Dispose
  manager.dispose();
  assert(manager.status().running === false, 'status after dispose is stopped');
}

// ----------------------------------------------------
// Test 4: URL Security Validation for shell:open-external
// ----------------------------------------------------
console.log('\n[Test 4] URL Security Validation');
const { validateExternalUrl } = await import('../electron/external-url.ts');

{
  assert(validateExternalUrl('http://127.0.0.1:3457').valid === true, 'accepts http localhost');
  assert(validateExternalUrl('https://omp.dev/stats').valid === true, 'accepts https url');
  assert(validateExternalUrl('chrome://extensions').valid === true, 'accepts chrome://extensions for relay guide');
  assert(validateExternalUrl('  http://127.0.0.1:3457  ').url === 'http://127.0.0.1:3457', 'returns trimmed url');
  assert(validateExternalUrl('file:///etc/passwd').valid === false, 'rejects file:// protocol');
  assert(validateExternalUrl('javascript:alert(1)').valid === false, 'rejects javascript: protocol');
  assert(validateExternalUrl('data:text/html,<h1>hi</h1>').valid === false, 'rejects data: protocol');
  assert(validateExternalUrl('not-a-url').valid === false, 'rejects invalid url string');
  assert(validateExternalUrl('').valid === false, 'rejects empty string');
}

// ----------------------------------------------------
// Test 5: Contract & Preload Inspection
// ----------------------------------------------------
console.log('\n[Test 5] Contract & Preload Inspection');
{
  const mainTs = fs.readFileSync(path.join(__dirname, '../electron/main.ts'), 'utf-8');
  assert(mainTs.includes("ipcMain.handle('omp:usage-history'"), "main.ts handles 'omp:usage-history'");
  assert(mainTs.includes("ipcMain.handle('omp:usage-clients'"), "main.ts handles 'omp:usage-clients'");
  assert(mainTs.includes("ipcMain.handle('omp:usage-invalidate'"), "main.ts handles 'omp:usage-invalidate'");
  assert(mainTs.includes("ipcMain.handle('omp:stats-dashboard-start'"), "main.ts handles 'omp:stats-dashboard-start'");
  assert(mainTs.includes("ipcMain.handle('omp:stats-dashboard-stop'"), "main.ts handles 'omp:stats-dashboard-stop'");
  assert(mainTs.includes("ipcMain.handle('omp:stats-dashboard-status'"), "main.ts handles 'omp:stats-dashboard-status'");
  assert(mainTs.includes("ipcMain.handle('shell:open-external'"), "main.ts handles 'shell:open-external'");

  const preloadTs = fs.readFileSync(path.join(__dirname, '../electron/preload.ts'), 'utf-8');
  assert(preloadTs.includes('getUsageHistory:'), 'preload.ts exposes getUsageHistory');
  assert(preloadTs.includes('getUsageClients:'), 'preload.ts exposes getUsageClients');
  assert(preloadTs.includes('invalidateUsage:'), 'preload.ts exposes invalidateUsage');
  assert(preloadTs.includes('startStatsDashboard:'), 'preload.ts exposes startStatsDashboard');
  assert(preloadTs.includes('stopStatsDashboard:'), 'preload.ts exposes stopStatsDashboard');
  assert(preloadTs.includes('getStatsDashboardStatus:'), 'preload.ts exposes getStatsDashboardStatus');
  assert(preloadTs.includes('openExternal:'), 'preload.ts exposes openExternal');

  const electronTypesTs = fs.readFileSync(path.join(__dirname, '../electron/types.ts'), 'utf-8');
  assert(electronTypesTs.includes('export interface OmpUsageHistoryData'), 'electron/types.ts defines OmpUsageHistoryData');
  assert(electronTypesTs.includes('export interface OmpUsageClientsData'), 'electron/types.ts defines OmpUsageClientsData');
  assert(electronTypesTs.includes('export interface StatsDashboardStatus'), 'electron/types.ts defines StatsDashboardStatus');
  assert(electronTypesTs.includes('statsDashboardPort?: number'), 'electron/types.ts includes statsDashboardPort');

  const srcTypesTs = fs.readFileSync(path.join(__dirname, '../src/types/index.ts'), 'utf-8');
  assert(srcTypesTs.includes('export interface OmpUsageHistoryData'), 'src/types/index.ts defines OmpUsageHistoryData');
  assert(srcTypesTs.includes('export interface OmpUsageClientsData'), 'src/types/index.ts defines OmpUsageClientsData');
  assert(srcTypesTs.includes('export interface StatsDashboardStatus'), 'src/types/index.ts defines StatsDashboardStatus');

  const settingsStoreTs = fs.readFileSync(path.join(__dirname, '../electron/settings-store.ts'), 'utf-8');
  assert(settingsStoreTs.includes('statsDashboardPort?: number'), 'settings-store.ts includes statsDashboardPort in AppSettings');

  const sessionStatsPanelTs = fs.readFileSync(path.join(__dirname, '../src/components/HeaderBar/SessionStatsPanel.tsx'), 'utf-8');
  assert(sessionStatsPanelTs.includes("usageSubTab === 'live'"), 'SessionStatsPanel contains live limits view');
  assert(sessionStatsPanelTs.includes("usageSubTab === 'history'"), 'SessionStatsPanel contains history view');
  assert(sessionStatsPanelTs.includes("usageSubTab === 'clients'"), 'SessionStatsPanel contains clients view');
  assert(sessionStatsPanelTs.includes('handleOpenDashboard'), 'SessionStatsPanel contains dashboard opening action');
  assert(sessionStatsPanelTs.includes('handleTraceSession'), 'SessionStatsPanel contains trace session action');
}

// ----------------------------------------------------
// Test 6: Live CLI Tests (if binary is available)
// ----------------------------------------------------
console.log('\n[Test 6] Live CLI Tests');
async function runLiveTests() {
  try {
    const { stdout } = await execFileAsync('omp', ['--version']);
    console.log(`Live omp binary detected: ${stdout.trim()}`);

    const liveHistory = await fetchUsageHistory('omp', { days: 1 });
    assert(liveHistory.success === true, 'live fetchUsageHistory succeeds');

    const liveClients = await fetchUsageClients('omp', { days: 1 });
    assert(liveClients.success === true, 'live fetchUsageClients succeeds');
  } catch (err) {
    console.log(`Live CLI tests skipped (omp not found or returned error: ${err.message})`);
  }
}

// Chạy các bài kiểm tra bất đồng bộ và dọn dẹp
runCliTests()
  .then(() => runDashboardManagerTests())
  .then(() => runLiveTests())
  .then(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log('\n====================================================');
    console.log(`Usage History & Dashboard Verification Complete: ${passed} passed, ${failed} failed.`);
    console.log('====================================================');
    if (failed > 0) {
      process.exit(1);
    }
  })
  .catch((err) => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.error('Fatal test error:', err);
    process.exit(1);
  });
