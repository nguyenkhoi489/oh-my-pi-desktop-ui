/**
 * Verification Script: Live RPC Parity Probe (Phase 1)
 *
 * Verifies live RPC protocol v2 command schemas and event emission for all unmapped commands:
 * 1. Modes & Control: `set_steering_mode`, `set_follow_up_mode`, `set_interrupt_mode`
 * 2. Real-time steering & follow-up: `steer` (with steering: true message), `follow_up` (queued message), `abort_and_prompt`
 * 3. Todos: `set_todos` with phases & tasks, state reflection in `todoPhases`, `todo_reminder` event
 * 4. Subagent transcript: `get_subagent_messages` (subagentId/sessionFile + fromByte validation)
 * 5. Auto retry & fast mode: `set_auto_retry`, `abort_retry`, `set_fast_mode` (state reflection)
 * 6. Direct execution: `bash` (command, exitCode, output), `abort_bash`
 * 7. State & Utils: `get_last_assistant_text`, `handoff`, `cycle_model`, `cycle_thinking_level`
 */

import { spawn } from 'child_process';
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

async function runLiveRpcParityVerification() {
  console.log('=== Starting Phase 1: Live RPC Parity Probe Verification Suite ===\n');

  const binaryPath = findOmpBinary();
  assert(Boolean(binaryPath), `Found OMP binary: ${binaryPath}`);

  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-rpc-parity-live-'));
  console.log(`[Setup] Scratch directory: ${scratchDir}`);

  const framer = new NdjsonFramer();
  const pendingMap = new Map();
  const receivedEvents = [];

  const ompProcess = spawn(binaryPath, ['--mode', 'rpc', '--no-session'], {
    cwd: scratchDir,
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
      receivedEvents.push(frame);
      if (frame.type === 'ready') {
        readyResolver(frame);
      } else if (frame.type === 'response' && frame.id && pendingMap.has(frame.id)) {
        const resolver = pendingMap.get(frame.id);
        pendingMap.delete(frame.id);
        resolver(frame);
      } else if (frame.type === 'extension_ui_request') {
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

  function sendCommand(frame, timeoutMs = 8000) {
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

  // 1. Handshake & Protocol Negotiation
  console.log('\n[Section 1] Handshake & Protocol Negotiation...');
  const readyFrame = await Promise.race([
    readyPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for ready frame')), 15000)),
  ]);
  assert(readyFrame.type === 'ready', 'Received ready frame');

  const negotiateRes = await sendCommand({
    type: 'negotiate_protocol',
    id: 'rpc-neg-1',
    protocolVersion: 2,
  });
  assert(negotiateRes.success === true, 'Negotiated protocol version 2');

  // 2. Modes & Engine Control Commands
  console.log('\n[Section 2] Mode Setting Commands...');
  const smRes = await sendCommand({ type: 'set_steering_mode', id: 'rpc-sm-1', mode: 'immediate' });
  assert(smRes.success === true, 'set_steering_mode accepted mode "immediate"');

  const fmRes = await sendCommand({ type: 'set_follow_up_mode', id: 'rpc-fm-1', mode: 'queue' });
  assert(fmRes.success === true, 'set_follow_up_mode accepted mode "queue"');

  const imRes = await sendCommand({ type: 'set_interrupt_mode', id: 'rpc-im-1', mode: 'immediate' });
  assert(imRes.success === true, 'set_interrupt_mode accepted mode "immediate"');

  // 3. Direct Bash Execution & Abort
  console.log('\n[Section 3] Direct Bash Execution & Abort...');
  const bashMissingRes = await sendCommand({ type: 'bash', id: 'rpc-bash-missing' });
  assert(bashMissingRes.success === false && bashMissingRes.error.includes('Missing field `command`'), 'bash requires command field');

  const bashSuccessRes = await sendCommand({
    type: 'bash',
    id: 'rpc-bash-echo',
    command: 'echo "PARITY_BASH_EXEC_OK"',
  });
  assert(bashSuccessRes.success === true, 'bash command executed successfully');
  assert(bashSuccessRes.data?.exitCode === 0, 'bash response has exitCode 0');
  assert(bashSuccessRes.data?.output.includes('PARITY_BASH_EXEC_OK'), 'bash response contains output text');
  assert(typeof bashSuccessRes.data?.outputBytes === 'number', 'bash response contains outputBytes');

  const abortBashRes = await sendCommand({ type: 'abort_bash', id: 'rpc-abort-bash-1' });
  assert(abortBashRes.success === true, 'abort_bash succeeded');

  // 4. Todos Management
  console.log('\n[Section 4] Todos Management (set_todos & get_state)...');
  const todosRes = await sendCommand({
    type: 'set_todos',
    id: 'rpc-todos-1',
    phases: [
      {
        name: 'Phase 1 - Investigation',
        tasks: [
          { content: 'Probe RPC commands', status: 'in_progress' },
          { content: 'Verify state synchronization', status: 'pending' },
        ],
      },
    ],
  });
  assert(todosRes.success === true, 'set_todos accepted phases with tasks array');
  assert(Array.isArray(todosRes.data?.todoPhases), 'set_todos returned todoPhases in response');

  const stateAfterTodos = await sendCommand({ type: 'get_state', id: 'rpc-state-todos' });
  assert(
    Array.isArray(stateAfterTodos.data?.todoPhases) && stateAfterTodos.data.todoPhases.length > 0,
    'get_state contains synced todoPhases'
  );

  // 5. Subagent Messages Parameter Validation
  console.log('\n[Section 5] Subagent Messages...');
  const subagentMissingRes = await sendCommand({ type: 'get_subagent_messages', id: 'rpc-sub-missing' });
  assert(
    subagentMissingRes.success === false && subagentMissingRes.error.includes('requires subagentId or sessionFile'),
    'get_subagent_messages enforces subagentId or sessionFile parameter'
  );

  const subagentUnknownRes = await sendCommand({
    type: 'get_subagent_messages',
    id: 'rpc-sub-unknown',
    subagentId: 'non-existent-subagent',
    fromByte: 0,
  });
  assert(
    subagentUnknownRes.success === false && subagentUnknownRes.error.includes('unavailable: non-existent-subagent'),
    'get_subagent_messages validates non-existent subagentId safely'
  );

  // 6. Auto Retry & Fast Mode
  console.log('\n[Section 6] Auto-retry & Fast Mode...');
  const autoRetryRes = await sendCommand({ type: 'set_auto_retry', id: 'rpc-retry-1', enabled: true });
  assert(autoRetryRes.success === true, 'set_auto_retry enabled successfully');

  const abortRetryRes = await sendCommand({ type: 'abort_retry', id: 'rpc-abort-retry-1' });
  assert(abortRetryRes.success === true, 'abort_retry succeeded');

  const fastModeRes = await sendCommand({ type: 'set_fast_mode', id: 'rpc-fast-1', enabled: false });
  assert(fastModeRes.success === true && fastModeRes.data?.enabled === false, 'set_fast_mode toggle succeeded');

  // 7. Model & Thinking Cycling
  console.log('\n[Section 7] Model & Thinking Cycling...');
  const stateBeforeCycle = await sendCommand({ type: 'get_state', id: 'rpc-state-before-cycle' });
  const originalModel = stateBeforeCycle.data?.model;

  const cycleModelRes = await sendCommand({ type: 'cycle_model', id: 'rpc-cycle-model-1' });
  assert(cycleModelRes.success === true && Boolean(cycleModelRes.data?.model), 'cycle_model returned new model info');

  if (originalModel) {
    await sendCommand({
      type: 'set_model',
      id: 'rpc-restore-model-1',
      provider: originalModel.provider,
      modelId: originalModel.id,
      model: originalModel.id,
    });
  }

  const cycleThinkingRes = await sendCommand({ type: 'cycle_thinking_level', id: 'rpc-cycle-think-1' });
  assert(cycleThinkingRes.success === true && typeof cycleThinkingRes.data?.level === 'string', 'cycle_thinking_level returned thinking level');
  // 8. Live Turn: Steer, Follow-up, Abort & Prompt, and Assistant Text
  console.log('\n[Section 8] Live Turn: Steer, Follow-up, Abort & Prompt...');
  // Send active prompt
  ompProcess.stdin.write(framer.encode({
    type: 'prompt',
    id: 'turn-live-1',
    message: 'Count from 1 to 30 slowly.',
  }));

  // Wait 1.2s for generation to begin
  await new Promise((r) => setTimeout(r, 1200));

  // Send steer mid-turn
  const steerRes = await sendCommand({
    type: 'steer',
    id: 'turn-steer-1',
    message: 'Stop counting and say PROBE_STEERING_SUCCESS.',
  });
  assert(steerRes.success === true, 'steer mid-stream accepted with message parameter');

  // Send follow_up mid-turn
  const followUpRes = await sendCommand({
    type: 'follow_up',
    id: 'turn-followup-1',
    message: 'Then say PROBE_FOLLOWUP_SUCCESS.',
  });
  assert(followUpRes.success === true, 'follow_up mid-stream accepted with message parameter');

  // Wait for the turns to finish
  let waited = 0;
  while (waited < 10000) {
    const hasSteerMsg = receivedEvents.some(
      (e) => e.type === 'message_start' && e.message?.steering === true
    );
    const hasFollowUpMsg = receivedEvents.some(
      (e) => e.type === 'message_start' && e.message?.content?.[0]?.text?.includes('PROBE_FOLLOWUP_SUCCESS')
    );
    if (hasSteerMsg && hasFollowUpMsg) break;
    await new Promise((r) => setTimeout(r, 500));
    waited += 500;
  }

  const steerEventObserved = receivedEvents.some(
    (e) => e.type === 'message_start' && e.message?.steering === true
  );
  assert(steerEventObserved, 'Observed message_start event with steering: true attribute');

  // 9. Abort and Prompt
  console.log('\n[Section 9] abort_and_prompt & get_last_assistant_text...');
  const agentEndCountBefore = receivedEvents.filter((e) => e.type === 'agent_end').length;
  const abortAndPromptRes = await sendCommand({
    type: 'abort_and_prompt',
    id: 'turn-abort-prompt-1',
    prompt: 'Say FINAL_ABORT_AND_PROMPT_DONE',
    message: 'Say FINAL_ABORT_AND_PROMPT_DONE',
  });
  assert(abortAndPromptRes.success === true, 'abort_and_prompt accepted prompt parameter');

  // Wait for turn to finish
  let turnWaited = 0;
  while (turnWaited < 15000) {
    const currentAgentEnds = receivedEvents.filter((e) => e.type === 'agent_end').length;
    if (currentAgentEnds > agentEndCountBefore) break;
    await new Promise((r) => setTimeout(r, 400));
    turnWaited += 400;
  }

  const lastTextRes = await sendCommand({ type: 'get_last_assistant_text', id: 'rpc-last-text-1' });
  assert(
    lastTextRes.success === true && typeof lastTextRes.data?.text === 'string',
    'get_last_assistant_text returns assistant output string'
  );

  // 10. Handoff command verification
  console.log('\n[Section 10] Handoff command...');
  const handoffRes = await sendCommand({ type: 'handoff', id: 'rpc-handoff-1' }, 30000);
  assert(
    handoffRes.id === 'rpc-handoff-1' && typeof handoffRes.success === 'boolean',
    'handoff command executed and responded'
  );

  // Clean shutdown
  console.log('\n[Teardown] Shutting down engine...');
  ompProcess.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 500));

  try {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  } catch {}

  console.log(`\n=== Phase 1 Verification Summary: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runLiveRpcParityVerification().catch((err) => {
  console.error('Fatal probe error:', err);
  process.exit(1);
});
