/**
 * Verification Script: Live Auth RPC & Login Providers (Phase 9)
 *
 * Verifies:
 * 1. Spawn live `omp --mode rpc --no-session`
 * 2. Receive `ready` frame and negotiate protocol version
 * 3. RPC command `get_login_providers` -> returns valid provider list with { id, name, available, authenticated }
 * 4. RPC command `login` with invalid provider -> returns expected error response
 * 5. RPC command `login` with interactive-only provider (e.g. github-copilot) -> returns interactive prompt notice
 * 6. (Optional) Real OAuth provider probe when OMP_PROBE_PROVIDER env var is set
 * 7. CLI command `auth-broker logout <provider>` runs cleanly
 * 8. Clean engine teardown
 */

import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NdjsonFramer } from '../electron/ndjson-framer.ts';

const execFileAsync = promisify(execFile);

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed++;
    console.error(`❌ FAIL: ${message}`);
  } else {
    passed++;
    console.log(`✅ PASS: ${message}`);
  }
}

function findOmpBinary() {
  const homedir = os.homedir();
  const candidates = [
    path.join(homedir, '.local/bin/omp'),
    '/opt/homebrew/bin/omp',
    '/usr/local/bin/omp',
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  return 'omp';
}

async function runAuthRpcLiveVerification() {
  console.log('=== Starting Phase 9: Live Auth RPC Verification Suite ===\n');

  const binaryPath = findOmpBinary();
  assert(Boolean(binaryPath), `Found OMP binary: ${binaryPath}`);

  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-auth-rpc-live-'));
  console.log(`[Setup] Scratch directory: ${scratchDir}`);

  const framer = new NdjsonFramer();
  const pendingMap = new Map();
  const receivedEvents = [];

  const ompProcess = spawn(binaryPath, ['--mode', 'rpc', '--no-session'], {
    cwd: scratchDir,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  assert(Boolean(ompProcess.pid), `Process spawned with PID: ${ompProcess.pid}`);

  let readyResolver;
  const readyPromise = new Promise((resolve) => {
    readyResolver = resolve;
  });

  ompProcess.stdout.on('data', (chunk) => {
    const text = chunk.toString('utf-8');
    const frames = framer.push(text);
    for (const frame of frames) {
      if (frame.type === 'ready') {
        readyResolver(frame);
      } else if (frame.type === 'response' && frame.id && pendingMap.has(frame.id)) {
        const resolver = pendingMap.get(frame.id);
        pendingMap.delete(frame.id);
        resolver(frame);
      } else {
        receivedEvents.push(frame);
      }
    }
  });

  ompProcess.stderr.on('data', (chunk) => {
    const errText = chunk.toString('utf-8').trim();
    if (errText) {
      // Ignore routine stderr
    }
  });

  function sendCommand(cmd, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const id = cmd.id || `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      cmd.id = id;

      const timer = setTimeout(() => {
        pendingMap.delete(id);
        reject(new Error(`Timeout waiting for response to ${cmd.type} (id: ${id})`));
      }, timeoutMs);

      pendingMap.set(id, (res) => {
        clearTimeout(timer);
        resolve(res);
      });

      ompProcess.stdin.write(framer.encode(cmd));
    });
  }

  try {
    // Step 1: Handshake
    console.log('\n[Section 1] Handshake & Protocol...');
    const readyFrame = await Promise.race([
      readyPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Ready timeout')), 5000)),
    ]);
    assert(readyFrame && readyFrame.type === 'ready', 'Received ready frame');

    const protoRes = await sendCommand({
      type: 'negotiate_protocol',
      protocolVersion: 2,
    });
    assert(protoRes.success === true, 'Negotiated protocol version 2');

    // Step 2: get_login_providers command
    console.log('\n[Section 2] get_login_providers command...');
    const provRes = await sendCommand({
      type: 'get_login_providers',
    });
    assert(provRes.success === true, 'get_login_providers returns success: true');
    assert(provRes.data && Array.isArray(provRes.data.providers), 'data.providers is an array');
    assert(provRes.data.providers.length > 0, `Returned ${provRes.data.providers.length} providers`);

    const sample = provRes.data.providers[0];
    assert(
      typeof sample.id === 'string' && typeof sample.name === 'string',
      'Provider item contains id and name'
    );
    assert(
      typeof sample.available === 'boolean' && typeof sample.authenticated === 'boolean',
      'Provider item contains available and authenticated boolean fields'
    );

    // Verify presence of common providers in list
    const providerIds = new Set(provRes.data.providers.map((p) => p.id));
    assert(providerIds.has('anthropic'), 'Contains "anthropic" provider');
    assert(providerIds.has('openai-codex'), 'Contains "openai-codex" provider');
    assert(providerIds.has('github-copilot'), 'Contains "github-copilot" provider');

    // Step 3: login command validation
    console.log('\n[Section 3] login command validation & error handling...');
    const invalidLoginRes = await sendCommand({
      type: 'login',
      providerId: 'nonexistent-provider-xyz',
    });
    assert(invalidLoginRes.success === false, 'login with invalid provider returns success: false');
    assert(
      invalidLoginRes.error?.includes('Unknown OAuth provider'),
      `Error specifies Unknown OAuth provider: "${invalidLoginRes.error}"`
    );

    const interactiveLoginRes = await sendCommand({
      type: 'login',
      providerId: 'github-copilot',
    });
    assert(interactiveLoginRes.success === false, 'login with interactive-only provider returns false');
    assert(
      interactiveLoginRes.error?.includes('requires interactive prompts'),
      `Error informs about interactive prompts: "${interactiveLoginRes.error}"`
    );

    // Step 4: Optional live probe
    console.log('\n[Section 4] Optional Live Probe (OMP_PROBE_PROVIDER)...');
    const probeProvider = process.env.OMP_PROBE_PROVIDER;
    if (probeProvider) {
      console.log(`Probing live provider: ${probeProvider}`);
      const probePromise = sendCommand({
        type: 'login',
        providerId: probeProvider,
      }, 5000).catch((err) => ({ timeout: true, error: err.message }));

      // Wait a short bit to collect any emitted extension_ui_request frames
      await new Promise((r) => setTimeout(r, 1500));
      const openUrlFrames = receivedEvents.filter(
        (f) => f.type === 'extension_ui_request' && f.method === 'open_url'
      );
      assert(openUrlFrames.length > 0, `Received open_url frame for ${probeProvider}`);
      if (openUrlFrames.length > 0) {
        console.log(`  [OAuth URL captured]: ${openUrlFrames[0].url?.slice(0, 60)}...`);
      }
    } else {
      console.log('Skipped live OAuth browser probe (OMP_PROBE_PROVIDER not set)');
    }

    // Step 5: CLI logout check
    console.log('\n[Section 5] CLI auth-broker logout...');
    const { stdout: logoutStdout } = await execFileAsync(binaryPath, [
      'auth-broker',
      'logout',
      'test-probe-provider-123',
      '--dry-run',
    ]);
    assert(logoutStdout.includes('Logged out of test-probe-provider-123'), 'CLI logout dry-run succeeded');

  } finally {
    console.log('\n[Teardown] Shutting down engine...');
    ompProcess.stdin.end();
    ompProcess.kill('SIGTERM');
    try {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    } catch {}
  }

  console.log(`\n=== Phase 9 Live Auth Verification Summary: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAuthRpcLiveVerification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
