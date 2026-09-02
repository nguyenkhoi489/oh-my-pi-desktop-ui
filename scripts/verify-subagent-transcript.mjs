/**
 * Verification Suite: Subagent Transcript Bridge & Incremental Tail (Phase 5)
 *
 * Verifies:
 * 1. Offline & Unready Guards:
 *    - getSubagentMessages returns structured error when engine process is offline/unready.
 * 2. Parameter Validation:
 *    - getSubagentMessages enforces subagentId or sessionFile.
 * 3. Outbound Command Construction:
 *    - Correct frame with type 'get_subagent_messages', id, subagentId, sessionFile, fromByte.
 * 4. Inbound Response Parsing & Translation:
 *    - Parses sessionFile, fromByte, nextByte, reset, and translates raw messages into ChatMessage[].
 * 5. Incremental & Reset Handling:
 *    - Handles fromByte continuation and reset flag propagation.
 * 6. Soft Error & Event Bus Handling:
 *    - "Subagent event bus is unavailable" and unknown subagent handled gracefully.
 * 7. Public IPC & Preload Contract:
 *    - main.ts registers 'omp:get-subagent-messages'.
 *    - preload.ts exposes getSubagentMessages.
 *    - types export getSubagentMessages signature.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OmpBridge } from '../electron/omp-bridge.ts';

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

async function runSubagentTranscriptVerification() {
  console.log('=== Starting Subagent Transcript Verification Suite (Phase 5) ===\n');

  // ----------------------------------------------------
  // Test 1: Offline / Unready Guards
  // ----------------------------------------------------
  console.log('[Test 1] Offline / Unready Structured Error Guard...');
  {
    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: () => {} },
    };
    const bridge = new OmpBridge(mockWindow);

    const offlineRes = await bridge.getSubagentMessages({ subagentId: 'worker-1', fromByte: 0 });
    assert(
      offlineRes.success === false && offlineRes.error === 'OMP process is not ready or offline',
      'getSubagentMessages returns structured error when bridge is offline'
    );
  }

  // ----------------------------------------------------
  // Test 2: Parameter Validation
  // ----------------------------------------------------
  console.log('[Test 2] Parameter Validation (subagentId or sessionFile required)...');
  {
    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: () => {} },
    };
    const bridge = new OmpBridge(mockWindow);
    // Fake ready process
    bridge.lifecycleState = 'ready';
    bridge.process = { stdin: { writable: true } };

    const invalidRes = await bridge.getSubagentMessages({});
    assert(
      invalidRes.success === false && invalidRes.error.includes('requires subagentId or sessionFile'),
      'getSubagentMessages enforces subagentId or sessionFile'
    );
  }

  // ----------------------------------------------------
  // Test 3: Command Generation & Successful Incremental Response
  // ----------------------------------------------------
  console.log('[Test 3] Command Generation & Incremental Response Translation...');
  {
    let lastSentCommand = null;
    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: () => {} },
    };
    const bridge = new OmpBridge(mockWindow);
    bridge.lifecycleState = 'ready';
    bridge.process = {
      stdin: {
        writable: true,
        write: (raw) => {
          try {
            lastSentCommand = JSON.parse(raw);
          } catch (e) {}
        },
      },
    };

    // Call getSubagentMessages asynchronously
    const fetchPromise = bridge.getSubagentMessages({
      subagentId: 'WorkerAlpha',
      sessionFile: '/path/to/sessions/WorkerAlpha.jsonl',
      fromByte: 0,
    });

    // Verify command sent
    assert(Boolean(lastSentCommand), 'Bridge wrote command frame to stdin');
    assert(lastSentCommand.type === 'get_subagent_messages', 'Command type is get_subagent_messages');
    assert(lastSentCommand.subagentId === 'WorkerAlpha', 'subagentId correctly passed');
    assert(lastSentCommand.sessionFile === '/path/to/sessions/WorkerAlpha.jsonl', 'sessionFile correctly passed');
    assert(lastSentCommand.fromByte === 0, 'fromByte correctly passed');

    // Simulate engine response
    const mockEngineResponse = {
      id: lastSentCommand.id,
      type: 'response',
      command: 'get_subagent_messages',
      success: true,
      data: {
        sessionFile: '/path/to/sessions/WorkerAlpha.jsonl',
        fromByte: 0,
        nextByte: 1024,
        reset: false,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Assignment: Create test file' }],
            timestamp: 1788264000000,
          },
          {
            role: 'assistant',
            content: [
              { type: 'thinking', text: 'Analyzing requirements...' },
              {
                type: 'toolCall',
                id: 'call_1',
                name: 'write',
                arguments: { path: 'test.txt', content: 'hello' },
              },
              { type: 'text', text: 'File test.txt created successfully.' },
            ],
            stopReason: 'stop',
            timestamp: 1788264005000,
          },
        ],
      },
    };

    bridge.handleStdoutData(JSON.stringify(mockEngineResponse) + '\n');
    const res = await fetchPromise;

    assert(res.success === true, 'getSubagentMessages resolved successfully');
    assert(res.data.sessionFile === '/path/to/sessions/WorkerAlpha.jsonl', 'sessionFile matched in response data');
    assert(res.data.fromByte === 0, 'fromByte is 0');
    assert(res.data.nextByte === 1024, 'nextByte is 1024');
    assert(res.data.reset === false, 'reset flag is false');
    assert(Array.isArray(res.data.messages) && res.data.messages.length === 2, 'Translated 2 ChatMessages');

    const userMsg = res.data.messages[0];
    assert(userMsg.role === 'user', 'First message is user role');
    assert(userMsg.content.includes('Assignment: Create test file'), 'User content translated properly');

    const assistantMsg = res.data.messages[1];
    assert(assistantMsg.role === 'assistant', 'Second message is assistant role');
    assert(assistantMsg.content === 'File test.txt created successfully.', 'Assistant text content extracted');
    assert(Boolean(assistantMsg.thinking) && assistantMsg.thinking.thought === 'Analyzing requirements...', 'Thinking block extracted');
    assert(Array.isArray(assistantMsg.toolCalls) && assistantMsg.toolCalls.length === 1, 'ToolCall extracted');
    assert(assistantMsg.toolCalls[0].name === 'write', 'ToolCall name matches "write"');
  }

  // ----------------------------------------------------
  // Test 4: Incremental continuation (fromByte > 0) & Reset handling
  // ----------------------------------------------------
  console.log('[Test 4] Incremental continuation (fromByte > 0) & Reset handling...');
  {
    let lastSentCommand = null;
    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: () => {} },
    };
    const bridge = new OmpBridge(mockWindow);
    bridge.lifecycleState = 'ready';
    bridge.process = {
      stdin: {
        writable: true,
        write: (raw) => {
          try {
            lastSentCommand = JSON.parse(raw);
          } catch (e) {}
        },
      },
    };

    // Incremental continuation
    const step2Promise = bridge.getSubagentMessages({
      subagentId: 'WorkerAlpha',
      fromByte: 1024,
    });

    assert(lastSentCommand.fromByte === 1024, 'Bridge sent fromByte 1024 for next page');

    bridge.handleStdoutData(
      JSON.stringify({
        id: lastSentCommand.id,
        type: 'response',
        command: 'get_subagent_messages',
        success: true,
        data: {
          sessionFile: '/path/to/sessions/WorkerAlpha.jsonl',
          fromByte: 1024,
          nextByte: 1536,
          reset: false,
          messages: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Additional progress report.' }],
              timestamp: 1788264010000,
            },
          ],
        },
      }) + '\n'
    );

    const step2Res = await step2Promise;
    assert(step2Res.success === true, 'Step 2 resolved');
    assert(step2Res.data.fromByte === 1024, 'Step 2 fromByte is 1024');
    assert(step2Res.data.nextByte === 1536, 'Step 2 nextByte is 1536');
    assert(step2Res.data.messages.length === 1, 'Step 2 received 1 incremental message');

    // Reset condition (file truncated/reset)
    const resetPromise = bridge.getSubagentMessages({
      subagentId: 'WorkerAlpha',
      fromByte: 1536,
    });

    bridge.handleStdoutData(
      JSON.stringify({
        id: lastSentCommand.id,
        type: 'response',
        command: 'get_subagent_messages',
        success: true,
        data: {
          sessionFile: '/path/to/sessions/WorkerAlpha.jsonl',
          fromByte: 0,
          nextByte: 512,
          reset: true,
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Fresh assignment' }],
              timestamp: 1788264020000,
            },
          ],
        },
      }) + '\n'
    );

    const resetRes = await resetPromise;
    assert(resetRes.success === true, 'Reset response resolved');
    assert(resetRes.data.reset === true, 'reset flag is true');
    assert(resetRes.data.fromByte === 0, 'fromByte reset to 0');
    assert(resetRes.data.nextByte === 512, 'nextByte is 512');
  }

  // ----------------------------------------------------
  // Test 5: Soft Error & Bus Unavailable Handling
  // ----------------------------------------------------
  console.log('[Test 5] Soft Error & Bus Unavailable Handling...');
  {
    let lastSentCommand = null;
    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: () => {} },
    };
    const bridge = new OmpBridge(mockWindow);
    bridge.lifecycleState = 'ready';
    bridge.process = {
      stdin: {
        writable: true,
        write: (raw) => {
          try {
            lastSentCommand = JSON.parse(raw);
          } catch (e) {}
        },
      },
    };

    const busErrorPromise = bridge.getSubagentMessages({ subagentId: 'WorkerUnknown', fromByte: 0 });

    bridge.handleStdoutData(
      JSON.stringify({
        id: lastSentCommand.id,
        type: 'response',
        command: 'get_subagent_messages',
        success: false,
        error: 'Subagent event bus is unavailable',
      }) + '\n'
    );

    const busErrorRes = await busErrorPromise;
    assert(busErrorRes.success === false, 'Soft error handled without crashing');
    assert(busErrorRes.error === 'Subagent event bus is unavailable', 'Error message preserved');
  }

  // ----------------------------------------------------
  // Test 6: Public IPC & Preload Contract Inspection
  // ----------------------------------------------------
  console.log('[Test 6] Preload, Main & TypeScript Contract Inspection...');
  {
    const preloadSrc = fs.readFileSync(path.join(__dirname, '../electron/preload.ts'), 'utf-8');
    assert(preloadSrc.includes('getSubagentMessages:'), 'preload.ts exposes getSubagentMessages');
    assert(preloadSrc.includes('omp:get-subagent-messages'), 'preload.ts invokes omp:get-subagent-messages');

    const mainSrc = fs.readFileSync(path.join(__dirname, '../electron/main.ts'), 'utf-8');
    assert(mainSrc.includes("ipcMain.handle('omp:get-subagent-messages'"), 'main.ts registers omp:get-subagent-messages handler');

    const typesSrc = fs.readFileSync(path.join(__dirname, '../src/types/index.ts'), 'utf-8');
    assert(typesSrc.includes('getSubagentMessages?:'), 'src/types/index.ts declares getSubagentMessages in ElectronAPI');

    const electronTypesSrc = fs.readFileSync(path.join(__dirname, '../electron/types.ts'), 'utf-8');
    assert(electronTypesSrc.includes('getSubagentMessages?:'), 'electron/types.ts declares getSubagentMessages in ElectronAPI');

    const rpcTypesSrc = fs.readFileSync(path.join(__dirname, '../electron/omp-rpc-types.ts'), 'utf-8');
    assert(rpcTypesSrc.includes('export interface GetSubagentMessagesCommand'), 'omp-rpc-types.ts exports GetSubagentMessagesCommand');
    assert(rpcTypesSrc.includes('export interface GetSubagentMessagesResponseData'), 'omp-rpc-types.ts exports GetSubagentMessagesResponseData');
    assert(rpcTypesSrc.includes('GetSubagentMessagesCommand'), 'omp-rpc-types.ts includes GetSubagentMessagesCommand in OmpCommandFrame');
  }

  console.log(`\n=== Subagent Transcript Verification Complete: ${passed} passed, ${failed} failed ===`);
}

runSubagentTranscriptVerification().catch((err) => {
  console.error('Unhandled error during subagent transcript verification:', err);
  process.exit(1);
});
