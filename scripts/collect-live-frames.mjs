/**
 * Script: Collect Live RPC Frames from 1 Turn Prompt
 * 
 * Sets up a clean temporary workspace, runs a real prompt against the local model,
 * approves any tool permissions, captures full NDJSON frame trace,
 * and analyzes tool_execution_end & message payload schema.
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { NdjsonFramer } from '../electron/ndjson-framer.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findOmpBinary() {
  const homedir = os.homedir();
  const candidates = [
    path.join(homedir, '.local/bin/omp'),
    '/opt/homebrew/bin/omp',
    '/usr/local/bin/omp',
    path.join(homedir, '.bun/bin/omp'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'omp';
}

async function runCollectLiveFrames() {
  console.log('=== Collecting Live RPC Frames from OMP Engine ===\n');

  // 1. Setup temporary workspace
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-live-verify-'));
  const testFile = path.join(tempDir, 'example.txt');
  fs.writeFileSync(testFile, 'console.log("Hello, world!");\n', 'utf-8');
  console.log(`[Workspace] Created temp workspace at: ${tempDir}`);
  console.log(`[Workspace] Created test file: example.txt (content: 'console.log("Hello, world!");')`);

  const binaryPath = findOmpBinary();
  console.log(`[Engine] Using binary: ${binaryPath}`);

  const framer = new NdjsonFramer();
  const allFrames = [];
  const logFilePath = path.join(tempDir, 'captured-rpc-frames.ndjson');
  const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

  const pendingMap = new Map();

  const ompProcess = spawn(binaryPath, ['--mode', 'rpc', '--cwd', tempDir], {
    cwd: tempDir,
    env: {
      ...process.env,
      PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin:${path.join(os.homedir(), '.local/bin')}`,
      FORCE_COLOR: '0',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  console.log(`[Engine] Spawned PID: ${ompProcess.pid}`);

  let readyResolver;
  const readyPromise = new Promise((resolve) => {
    readyResolver = resolve;
  });

  let agentEndResolver;
  const agentEndPromise = new Promise((resolve) => {
    agentEndResolver = resolve;
  });

  function writeOutbound(frame) {
    const entry = { dir: 'out', timestamp: new Date().toISOString(), frame };
    allFrames.push(entry);
    logStream.write(JSON.stringify(entry) + '\n');
    console.log(`[OUT] ${frame.type} (id: ${frame.id || 'none'})`);
    ompProcess.stdin.write(framer.encode(frame));
  }

  function sendCommand(frame, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (!frame.id) {
        frame.id = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      }
      const timer = setTimeout(() => {
        pendingMap.delete(frame.id);
        reject(new Error(`Command ${frame.type} (${frame.id}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      pendingMap.set(frame.id, (res) => {
        clearTimeout(timer);
        resolve(res);
      });

      writeOutbound(frame);
    });
  }

  ompProcess.stdout.on('data', (chunk) => {
    const text = chunk.toString('utf-8');
    const frames = framer.push(text);
    for (const frame of frames) {
      const entry = { dir: 'in', timestamp: new Date().toISOString(), frame };
      allFrames.push(entry);
      logStream.write(JSON.stringify(entry) + '\n');
      console.log(`[IN] ${frame.type} ${frame.id ? `(id: ${frame.id})` : ''} - Full Frame: ${JSON.stringify(frame)}`);

      if (frame.type === 'ready') {
        readyResolver(frame);
      } else if (frame.type === 'response' && frame.id && pendingMap.has(frame.id)) {
        const resolver = pendingMap.get(frame.id);
        pendingMap.delete(frame.id);
        resolver(frame);
      } else if (frame.type === 'extension_ui_request') {
        const reqId = frame.id || frame.requestId;
        const method = frame.method;
        console.log(`  -> Extension UI Request received: method=${method}, reqId=${reqId}`);

        // Auto approve permission or ack widgets
        const isPermission = method === 'permission_request' || method === 'request_permission';
        const reply = {
          type: 'extension_ui_response',
          id: `reply_${Date.now()}`,
          requestId: reqId,
          approved: isPermission ? true : false,
          response: isPermission ? { approved: true } : null,
        };
        writeOutbound(reply);
      } else if (frame.type === 'agent_end') {
        agentEndResolver(frame);
      }
    }
  });

  ompProcess.stderr.on('data', (chunk) => {
    console.error(`[STDERR] ${chunk.toString('utf-8').trim()}`);
  });

  // 1. Handshake
  console.log('\n--- 1. Handshake ---');
  await readyPromise;
  console.log('✓ Ready frame received');

  const negotiateRes = await sendCommand({
    type: 'negotiate_protocol',
    id: 'live-neg-1',
    protocolVersion: 2,
  });
  console.log('✓ Negotiate v2 succeeded:', negotiateRes.success);

  // 2. Set model to prod endpoint
  const modelRes = await sendCommand({
    type: 'set_model',
    id: 'live-set-model-1',
    modelId: 'gemini-3.7-flash-tiered',
    provider: 'nguyenkhoi-lmstudio-prod',
  });
  console.log('✓ set_model succeeded:', modelRes.success);

  // 2b. Check current state and model
  const stateRes = await sendCommand({
    type: 'get_state',
    id: 'live-state-1',
  });
  console.log('✓ Current State Model:', JSON.stringify(stateRes.data?.model?.provider || stateRes.data || {}));

  // 3. Send real prompt to edit example.txt
  console.log('\n--- 2. Sending Prompt Turn ---');
  const prompt = 'Sửa file example.txt: thay thế "Hello, world!" thành "Hello, OMP Agent!". Hãy dùng tool edit để sửa file ngay lập tức.';
  console.log(`Prompt: "${prompt}"`);

  writeOutbound({
    type: 'prompt',
    id: 'live-prompt-1',
    message: prompt,
  });

  // 4. Wait for agent_end (up to 90s)
  console.log('\n--- 3. Streaming Response & Executing Tools ---');
  await Promise.race([
    agentEndPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Prompt agent run timed out after 90s')), 90000)),
  ]);

  console.log('\n✓ Agent task completed!');

  // 5. Check if file was modified
  const updatedContent = fs.readFileSync(testFile, 'utf-8');
  console.log(`\n--- 4. Workspace Verification ---`);
  console.log(`File content on disk after turn:`);
  console.log(`"${updatedContent.trim()}"`);

  // 6. Stop engine cleanly
  console.log('\n--- 5. Clean Shutdown ---');
  writeOutbound({ type: 'abort', id: 'live-abort-1' });
  await new Promise((r) => setTimeout(r, 400));
  ompProcess.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 600));

  // 7. Schema Analysis Report
  console.log('\n--- 6. Event Schema Analysis ---');
  const frameTypes = [...new Set(allFrames.filter((e) => e.dir === 'in').map((e) => e.frame.type))];
  console.log('Captured inbound event types:', frameTypes);

  // Find tool_execution_end frames
  const toolEndFrames = allFrames
    .filter((e) => e.dir === 'in' && e.frame.type === 'tool_execution_end')
    .map((e) => e.frame);

  console.log(`\nCaptured tool_execution_end frames (${toolEndFrames.length}):`);
  for (const f of toolEndFrames) {
    console.log(JSON.stringify(f, null, 2));
  }

  // Find message frames
  const messageStarts = allFrames.filter((e) => e.dir === 'in' && e.frame.type === 'message_start').map((e) => e.frame);
  const messageUpdates = allFrames.filter((e) => e.dir === 'in' && e.frame.type === 'message_update').map((e) => e.frame);
  const messageEnds = allFrames.filter((e) => e.dir === 'in' && e.frame.type === 'message_end').map((e) => e.frame);

  console.log(`\nCaptured message frames: starts=${messageStarts.length}, updates=${messageUpdates.length}, ends=${messageEnds.length}`);
  if (messageUpdates.length > 0) {
    console.log('Sample message_update frame:');
    console.log(JSON.stringify(messageUpdates[0], null, 2));
  }
  if (messageEnds.length > 0) {
    console.log('Sample message_end frame:');
    console.log(JSON.stringify(messageEnds[0], null, 2));
  }

  // Copy captured-rpc-frames.ndjson to permanent location if needed
  const permanentReportDir = path.join(__dirname, '../plans/260901-1333-ndjson-rpc-protocol-layer/reports');
  if (!fs.existsSync(permanentReportDir)) {
    fs.mkdirSync(permanentReportDir, { recursive: true });
  }
  const permanentLogPath = path.join(permanentReportDir, 'rpc-frames-live-sample.ndjson');
  fs.copyFileSync(logFilePath, permanentLogPath);
  console.log(`\nSaved raw NDJSON log to: ${permanentLogPath}`);

  // Cleanup temp dir
  fs.rmSync(tempDir, { recursive: true, force: true });
}

runCollectLiveFrames().catch((err) => {
  console.error('\n❌ Error during live frame collection:', err);
  process.exit(1);
});
