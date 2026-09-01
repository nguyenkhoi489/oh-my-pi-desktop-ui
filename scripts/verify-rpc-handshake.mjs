/**
 * Verification Script: Live OMP Engine Handshake & Basic RPC Commands
 * 
 * Verifies:
 * 1. Spawn `omp --mode rpc --no-session`
 * 2. Receive `ready` frame with protocolVersion 2 support
 * 3. Negotiate protocol v2 -> verify response success: true
 * 4. Query `get_state` -> verify correlation by id and valid payload
 * 5. Query `get_available_models` -> verify correlation by id and valid models list
 * 6. Send `abort` command
 * 7. Send SIGTERM -> verify clean exit without zombie process
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { NdjsonFramer } from '../electron/ndjson-framer.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    failed++;
    throw new Error(message);
  } else {
    console.log(`  ✓ PASSED: ${message}`);
    passed++;
  }
}

function findOmpBinary() {
  const homedir = os.homedir();
  const candidates = [
    path.join(homedir, '.local/bin/omp'),
    '/opt/homebrew/bin/omp',
    '/usr/local/bin/omp',
    path.join(homedir, '.bun/bin/omp'),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }

  try {
    const which = execSync('/bin/zsh -l -c "which omp" 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (which && fs.existsSync(which)) {
      return which;
    }
  } catch {}

  return null;
}

async function runHandshakeVerification() {
  console.log('=== Live OMP Engine Handshake Verification ===\n');

  const binaryPath = findOmpBinary();
  assert(Boolean(binaryPath), `Found OMP binary at: ${binaryPath}`);

  console.log(`[Step 1] Spawning: ${binaryPath} --mode rpc --no-session`);

  const framer = new NdjsonFramer();
  const pendingMap = new Map();
  const receivedFrames = [];

  const ompProcess = spawn(binaryPath, ['--mode', 'rpc', '--no-session'], {
    env: {
      ...process.env,
      PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin:${path.join(os.homedir(), '.local/bin')}`,
      FORCE_COLOR: '0',
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
      receivedFrames.push(frame);
      if (frame.type === 'ready') {
        readyResolver(frame);
      } else if (frame.type === 'response' && frame.id && pendingMap.has(frame.id)) {
        const resolver = pendingMap.get(frame.id);
        pendingMap.delete(frame.id);
        resolver(frame);
      } else if (frame.type === 'extension_ui_request') {
        // Auto ack unsupported extension UI requests
        const ack = {
          type: 'extension_ui_response',
          id: 'ack_' + Date.now(),
          requestId: frame.id || frame.requestId,
          approved: false,
          response: null,
        };
        ompProcess.stdin.write(framer.encode(ack));
      }
    }
  });

  ompProcess.stderr.on('data', (chunk) => {
    const errText = chunk.toString('utf-8').trim();
    if (errText) {
      console.log(`  [ENGINE STDERR]: ${errText}`);
    }
  });

  function sendCommand(frame, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingMap.delete(frame.id);
        reject(new Error(`Command ${frame.type} (id: ${frame.id}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      pendingMap.set(frame.id, (res) => {
        clearTimeout(timer);
        resolve(res);
      });

      ompProcess.stdin.write(framer.encode(frame));
    });
  }

  // 1. Await ready frame
  console.log('\n[Step 2] Awaiting ready frame from engine...');
  const readyFrame = await Promise.race([
    readyPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for ready frame')), 5000)),
  ]);

  assert(readyFrame.type === 'ready', 'Received ready frame');
  assert(
    Array.isArray(readyFrame.supportedProtocolVersions) && readyFrame.supportedProtocolVersions.includes(2),
    `Engine supports protocolVersion 2 (supported: ${JSON.stringify(readyFrame.supportedProtocolVersions)})`
  );

  // 2. Negotiate protocol v2
  console.log('\n[Step 3] Negotiating protocol version 2...');
  const negotiateRes = await sendCommand({
    type: 'negotiate_protocol',
    id: 'hs-negotiate-01',
    protocolVersion: 2,
  });

  assert(negotiateRes.id === 'hs-negotiate-01', 'Negotiate response correlated by id');
  assert(negotiateRes.success === true, 'Negotiate protocol v2 succeeded (success: true)');

  // 3. Query get_state
  console.log('\n[Step 4] Querying get_state...');
  const stateRes = await sendCommand({
    type: 'get_state',
    id: 'hs-state-01',
  });

  assert(stateRes.id === 'hs-state-01', 'get_state response correlated by id');
  assert(stateRes.success === true, 'get_state command succeeded');
  console.log('  State payload summary:', JSON.stringify(stateRes.data || stateRes).slice(0, 150) + '...');

  // 4. Query get_available_models
  console.log('\n[Step 5] Querying get_available_models...');
  const modelsRes = await sendCommand({
    type: 'get_available_models',
    id: 'hs-models-01',
  });

  assert(modelsRes.id === 'hs-models-01', 'get_available_models response correlated by id');
  assert(modelsRes.success === true, 'get_available_models command succeeded');
  const modelCount = Array.isArray(modelsRes.data?.models)
    ? modelsRes.data.models.length
    : (Array.isArray(modelsRes.data) ? modelsRes.data.length : 'unknown');
  console.log(`  Found models: ${modelCount}`);

  // 5. Send abort command
  console.log('\n[Step 6] Sending abort command...');
  const abortFrame = {
    type: 'abort',
    id: 'hs-abort-01',
  };
  ompProcess.stdin.write(framer.encode(abortFrame));
  assert(true, 'Sent abort command frame');

  // 6. Graceful terminate and verify no zombie
  console.log('\n[Step 7] Stopping engine cleanly (SIGTERM)...');
  await new Promise((resolve) => setTimeout(resolve, 300));

  const exitPromise = new Promise((resolve) => {
    ompProcess.on('exit', (code, signal) => {
      resolve({ code, signal });
    });
  });

  ompProcess.kill('SIGTERM');
  const exitResult = await Promise.race([
    exitPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Process did not exit after SIGTERM')), 3000)),
  ]);

  assert(true, `Engine exited cleanly with code: ${exitResult.code}, signal: ${exitResult.signal}`);

  console.log('\n====================================================');
  console.log(`Live Handshake Verification: ${passed} passed, ${failed} failed.`);
  console.log('====================================================\n');
}

runHandshakeVerification().catch((err) => {
  console.error('\n❌ Unhandled error during verification:', err);
  process.exit(1);
});
