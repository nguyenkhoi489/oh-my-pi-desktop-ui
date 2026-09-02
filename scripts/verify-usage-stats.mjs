/**
 * Verification Suite: Global Usage & Stats (omp usage / omp stats)
 *
 * Kiểm tra:
 * 1. extractJsonSubstring & parseUsageJson / parseStatsJson với fixture thực tế
 * 2. Xử lý log/banner đồng bộ trước JSON (Syncing session files...)
 * 3. Cơ chế cache 60s & forceRefresh bypass
 * 4. Xử lý lỗi mềm (timeout, binary thiếu, CLI trả về lỗi)
 * 5. Khảo sát hợp đồng IPC Main & Preload
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  extractJsonSubstring,
  parseUsageJson,
  parseStatsJson,
  fetchGlobalUsage,
  fetchGlobalStats,
  clearUsageStatsCache,
  getUsageStatsCacheInfo,
} from '../electron/usage-stats.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ PASSED: ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAILED: ${message}`);
  }
}

console.log('=== Starting Global Usage & Stats Verification Suite ===\n');

// ----------------------------------------------------
// Fixtures
// ----------------------------------------------------
const FIXTURE_USAGE_JSON = JSON.stringify({
  generatedAt: 1788334698318,
  reports: [
    {
      provider: 'openai-codex',
      fetchedAt: 1788334620579,
      limits: [
        {
          id: 'openai-codex:primary',
          label: '5 hours',
          scope: { provider: 'openai-codex', windowId: '5h', shared: true },
          window: { id: '5h', label: '5 hours', durationMs: 18000000, resetsAt: 1788338793000 },
          amount: { used: 23, limit: 100, remaining: 77, usedFraction: 0.23, remainingFraction: 0.77, unit: 'percent' },
          status: 'ok',
        },
        {
          id: 'openai-codex:secondary',
          label: '7 days',
          scope: { provider: 'openai-codex', windowId: '7d', shared: true },
          window: { id: '7d', label: '7 days', durationMs: 604800000, resetsAt: 1788762388000 },
          amount: { used: 85, limit: 100, remaining: 15, usedFraction: 0.85, remainingFraction: 0.15, unit: 'percent' },
          status: 'ok',
        },
      ],
      metadata: {
        planType: 'plus',
        allowed: true,
        limitReached: false,
        email: 'user@example.com',
      },
    },
  ],
  capacity: {
    'openai-codex': [
      { window: '5h', durationMs: 18000000, meter: 'chat', accounts: 1, usedAccounts: 0.23, remainingAccounts: 0.77 },
    ],
  },
});

const FIXTURE_STATS_WITH_BANNER = `Syncing session files...
Synced 2 new entries from 1 files (5512 total)

{
  "overall": {
    "totalRequests": 1850,
    "successfulRequests": 1837,
    "failedRequests": 13,
    "errorRate": 0.007,
    "totalInputTokens": 157481589,
    "totalOutputTokens": 229990,
    "totalCacheReadTokens": 4656128,
    "totalCacheWriteTokens": 0,
    "cacheRate": 0.0287,
    "cacheSavings": 0.868,
    "totalCost": 3.591,
    "unpricedRequests": 0,
    "totalPremiumRequests": 0,
    "avgDuration": 3924.9,
    "avgTtft": 3374.0,
    "avgTokensPerSecond": 24.5
  },
  "byModel": [
    {
      "model": "gemini-3.7-flash-tiered",
      "provider": "nguyenkhoi-lmstudio-prod",
      "totalRequests": 1785,
      "successfulRequests": 1785,
      "failedRequests": 0,
      "errorRate": 0,
      "totalInputTokens": 157310486,
      "totalOutputTokens": 216396,
      "totalCacheReadTokens": 0,
      "totalCacheWriteTokens": 0,
      "cacheRate": 0,
      "cacheSavings": 0,
      "totalCost": 0
    }
  ],
  "byFolder": [
    {
      "folder": "-Data-MacAPP-OMP-Agent",
      "totalRequests": 1112,
      "successfulRequests": 1112,
      "failedRequests": 0,
      "errorRate": 0,
      "totalInputTokens": 131982651,
      "totalOutputTokens": 184418,
      "totalCost": 3.591
    }
  ]
}`;

// ----------------------------------------------------
// Test 1: extractJsonSubstring & JSON Parsing
// ----------------------------------------------------
console.log('[Test 1] extractJsonSubstring & JSON Parsing');
{
  const clean = extractJsonSubstring('{"foo": "bar"}');
  assert(clean === '{"foo": "bar"}', 'Clean JSON string extracted verbatim');

  const withBanner = extractJsonSubstring(FIXTURE_STATS_WITH_BANNER);
  assert(withBanner != null && withBanner.startsWith('{') && withBanner.endsWith('}'), 'JSON with prepended banner correctly extracted');

  const nonJson = extractJsonSubstring('No JSON payload here');
  assert(nonJson === null, 'Non-JSON string returns null');

  const empty = extractJsonSubstring('');
  assert(empty === null, 'Empty string returns null');

  // parseUsageJson
  const parsedUsage = parseUsageJson(FIXTURE_USAGE_JSON);
  assert(parsedUsage.data != null, 'parseUsageJson parsed valid fixture');
  assert(parsedUsage.data.reports?.length === 1, 'Reports count is 1');
  assert(parsedUsage.data.reports[0].provider === 'openai-codex', 'Provider is openai-codex');
  assert(parsedUsage.data.reports[0].limits?.length === 2, 'Limits count is 2');
  assert(parsedUsage.data.reports[0].metadata?.planType === 'plus', 'Plan type is plus');

  // parseStatsJson with prepended sync banner
  const parsedStats = parseStatsJson(FIXTURE_STATS_WITH_BANNER);
  assert(parsedStats.data != null, 'parseStatsJson parsed fixture with banner');
  assert(parsedStats.data.overall?.totalRequests === 1850, 'Overall totalRequests is 1850');
  assert(parsedStats.data.overall?.totalCost === 3.591, 'Overall totalCost is 3.591');
  assert(parsedStats.data.byModel?.length === 1, 'byModel count is 1');
  assert(parsedStats.data.byModel[0].model === 'gemini-3.7-flash-tiered', 'byModel item model matches');
  assert(parsedStats.data.byFolder?.length === 1, 'byFolder count is 1');

  // Broken JSON handling
  const brokenUsage = parseUsageJson('Syncing...\n{ broken json: true ');
  assert(brokenUsage.data === undefined, 'Broken JSON returns undefined data');
  assert(typeof brokenUsage.error === 'string', 'Broken JSON returns error message');
  assert(typeof brokenUsage.raw === 'string', 'Broken JSON retains raw string for UI degrade');
}

// ----------------------------------------------------
// Test 2: Stub CLI Execution, Cache & Timeout
// ----------------------------------------------------
console.log('\n[Test 2] Stub CLI Execution, Cache & Timeout');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-usage-stats-test-'));

// Stub CLI script ghi nhận các flag và trả về fixture JSON tương ứng
const stubScriptPath = path.join(tempDir, 'stub-omp.sh');
fs.writeFileSync(
  stubScriptPath,
  `#!/bin/bash
if [ "$1" = "usage" ] && [ "$2" = "--json" ]; then
  cat << 'EOF'
${FIXTURE_USAGE_JSON}
EOF
  exit 0
elif [ "$1" = "stats" ] && [ "$2" = "--json" ]; then
  cat << 'EOF'
${FIXTURE_STATS_WITH_BANNER}
EOF
  exit 0
elif [ "$1" = "slow" ]; then
  sleep 2
  echo '{"slow": true}'
  exit 0
elif [ "$1" = "fail" ]; then
  echo "Error: Network unavailable" >&2
  exit 1
fi
echo "Unknown command" >&2
exit 1
`,
  { mode: 0o755 }
);

async function runCliTests() {
  clearUsageStatsCache();

  // 1. Initial usage fetch
  const resUsage1 = await fetchGlobalUsage(stubScriptPath);
  assert(resUsage1.success === true, 'fetchGlobalUsage succeeded on stub CLI');
  assert(resUsage1.data?.reports?.length === 1, 'Returned usage reports');

  const cacheInfo1 = getUsageStatsCacheInfo();
  assert(cacheInfo1.usageCached === true, 'Usage data is now cached');

  // 2. Cache hit verification (using dummy missing path to prove it uses cache)
  const resUsageCached = await fetchGlobalUsage('/nonexistent/path');
  assert(resUsageCached.success === true, 'Cached usage returned without calling binaryPath');
  assert(resUsageCached.data?.reports?.[0].provider === 'openai-codex', 'Cached data matches original');

  // 3. Force refresh bypasses cache
  const resUsageForce = await fetchGlobalUsage(stubScriptPath, { forceRefresh: true });
  assert(resUsageForce.success === true, 'forceRefresh fetchGlobalUsage succeeded');

  // 4. Initial stats fetch
  const resStats1 = await fetchGlobalStats(stubScriptPath);
  assert(resStats1.success === true, 'fetchGlobalStats succeeded on stub CLI');
  assert(resStats1.data?.overall?.totalRequests === 1850, 'Returned overall stats');

  const cacheInfo2 = getUsageStatsCacheInfo();
  assert(cacheInfo2.statsCached === true, 'Stats data is now cached');

  // 5. Cached stats
  const resStatsCached = await fetchGlobalStats('/nonexistent/path');
  assert(resStatsCached.success === true, 'Cached stats returned without calling binaryPath');

  // 6. Missing binaryPath when cache is clear
  clearUsageStatsCache();
  const resNoBinary = await fetchGlobalUsage(undefined);
  assert(resNoBinary.success === false, 'fetchGlobalUsage fails gracefully without binaryPath');
  assert(resNoBinary.error?.includes('Không tìm thấy file nhị phân'), 'Error message identifies missing binary');

  // 7. Timeout handling
  const stubSlowPath = path.join(tempDir, 'stub-slow.sh');
  fs.writeFileSync(
    stubSlowPath,
    `#!/bin/bash
sleep 2
echo '{"status": "ok"}'
`,
    { mode: 0o755 }
  );

  const resTimeout = await fetchGlobalUsage(stubSlowPath, { timeoutMs: 150 });
  assert(resTimeout.success === false, 'Slow CLI execution triggered timeout');
  assert(typeof resTimeout.error === 'string' && resTimeout.error.includes('Quá thời gian'), 'Timeout error message returned');

  // 8. Error exit code handling
  const stubFailPath = path.join(tempDir, 'stub-fail.sh');
  fs.writeFileSync(
    stubFailPath,
    `#!/bin/bash
echo "Unauthorized provider" >&2
exit 1
`,
    { mode: 0o755 }
  );

  const resFail = await fetchGlobalUsage(stubFailPath);
  assert(resFail.success === false, 'Failing CLI execution returns success: false');
  assert(resFail.raw?.includes('Unauthorized provider'), 'Retains stderr in raw output for debugging');
}

// ----------------------------------------------------
// Test 3: Contract & Preload Inspection
// ----------------------------------------------------
console.log('\n[Test 3] Contract & Preload Inspection');
{
  const mainTs = fs.readFileSync(path.join(__dirname, '../electron/main.ts'), 'utf-8');
  assert(mainTs.includes("ipcMain.handle('omp:global-usage'"), "main.ts handles 'omp:global-usage'");
  assert(mainTs.includes("ipcMain.handle('omp:global-stats'"), "main.ts handles 'omp:global-stats'");

  const preloadTs = fs.readFileSync(path.join(__dirname, '../electron/preload.ts'), 'utf-8');
  assert(preloadTs.includes('getGlobalUsage:'), 'preload.ts exposes getGlobalUsage');
  assert(preloadTs.includes('getGlobalStats:'), 'preload.ts exposes getGlobalStats');

  const electronTypesTs = fs.readFileSync(path.join(__dirname, '../electron/types.ts'), 'utf-8');
  assert(electronTypesTs.includes('export interface OmpGlobalUsageData'), 'electron/types.ts defines OmpGlobalUsageData');
  assert(electronTypesTs.includes('export interface OmpGlobalStatsData'), 'electron/types.ts defines OmpGlobalStatsData');

  const srcTypesTs = fs.readFileSync(path.join(__dirname, '../src/types/index.ts'), 'utf-8');
  assert(srcTypesTs.includes('export interface OmpGlobalUsageData'), 'src/types/index.ts defines OmpGlobalUsageData');
  assert(srcTypesTs.includes('export interface OmpGlobalStatsData'), 'src/types/index.ts defines OmpGlobalStatsData');

  const sessionStatsPanelTs = fs.readFileSync(path.join(__dirname, '../src/components/HeaderBar/SessionStatsPanel.tsx'), 'utf-8');
  assert(sessionStatsPanelTs.includes("activeTab === 'session'"), 'SessionStatsPanel contains session tab');
  assert(sessionStatsPanelTs.includes("activeTab === 'usage'"), 'SessionStatsPanel contains usage limits tab');
  assert(sessionStatsPanelTs.includes("activeTab === 'stats'"), 'SessionStatsPanel contains global stats tab');
}

// Chạy các bài kiểm tra bất đồng bộ và dọn dẹp
runCliTests()
  .then(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}

    console.log(`\n====================================================`);
    console.log(`Usage Stats Verification Complete: ${passed} passed, ${failed} failed.`);
    console.log(`====================================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
