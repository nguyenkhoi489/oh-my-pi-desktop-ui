import assert from 'node:assert';
import { OmpBridge } from '../electron/omp-bridge.ts';

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passCount++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

console.log('=== Running verify-terminal.mjs ===');

// Test 1: runBash when offline returns friendly error
await asyncTest('runBash returns error when bridge is offline', async () => {
  const bridge = new OmpBridge();
  const res = await bridge.runBash('ls -la');
  assert.strictEqual(res.success, false);
  assert(res.error.includes('offline') || res.error.includes('chưa sẵn sàng'));
});

// Test 2: abortBash when offline returns friendly error
await asyncTest('abortBash returns error when bridge is offline', async () => {
  const bridge = new OmpBridge();
  const res = await bridge.abortBash();
  assert.strictEqual(res.success, false);
  assert(res.error.includes('offline') || res.error.includes('chưa sẵn sàng'));
});

// Test 3: runBash executes command and receives structured response + stream
await asyncTest('runBash executes command successfully and receives output stream', async () => {
  const emittedOutputs = [];
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, data) => {
        if (channel === 'omp:bash-output') {
          emittedOutputs.push(data);
        }
      },
    },
  };
  const bridge = new OmpBridge(mockWindow);
  const writtenFrames = [];
  bridge.lifecycleState = 'ready';
  bridge.process = {
    stdin: {
      writable: true,
      write: (data) => {
        writtenFrames.push(data);
        const frame = JSON.parse(data.trim());
        // Stream command_output event first
        bridge.dispatchInboundFrame({
          type: 'command_output',
          id: frame.id,
          text: 'running command...\n',
        });
        // Then respond
        bridge.dispatchInboundFrame({
          type: 'response',
          id: frame.id,
          command: 'bash',
          success: true,
          data: {
            exitCode: 0,
            output: 'hello from bash\n',
            outputBytes: 16,
            totalLines: 1,
            truncated: false,
          },
        });
        return true;
      },
    },
  };

  const res = await bridge.runBash('echo "hello from bash"');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.data.exitCode, 0);
  assert.strictEqual(res.data.output, 'hello from bash\n');
  assert.strictEqual(res.data.truncated, false);

  assert(emittedOutputs.length >= 1, 'Should have received streamed command_output');
  assert(emittedOutputs[0].text.includes('running command...'));
});

// Test 4: runBash truncates massive output to prevent renderer flood
await asyncTest('runBash truncates massive output exceeding limit', async () => {
  const bridge = new OmpBridge();
  bridge.lifecycleState = 'ready';
  bridge.process = {
    stdin: {
      writable: true,
      write: (data) => {
        const frame = JSON.parse(data.trim());
        const massive = 'X'.repeat(250_000);
        bridge.dispatchInboundFrame({
          type: 'response',
          id: frame.id,
          command: 'bash',
          success: true,
          data: {
            exitCode: 0,
            output: massive,
            outputBytes: 250_000,
            totalLines: 1,
            truncated: false,
          },
        });
        return true;
      },
    },
  };

  const res = await bridge.runBash('huge-output');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.data.truncated, true);
  assert(res.data.output.includes('Output truncated'));
  assert(res.data.output.length <= 210_000);
});

// Test 5: runBash handles command failure
await asyncTest('runBash handles command failure gracefully', async () => {
  const bridge = new OmpBridge();
  bridge.lifecycleState = 'ready';
  bridge.process = {
    stdin: {
      writable: true,
      write: (data) => {
        const frame = JSON.parse(data.trim());
        bridge.dispatchInboundFrame({
          type: 'response',
          id: frame.id,
          command: 'bash',
          success: false,
          error: 'Command failed with exit code 127',
        });
        return true;
      },
    },
  };

  const res = await bridge.runBash('error-cmd');
  assert.strictEqual(res.success, false);
  assert(res.error.includes('Command failed with exit code 127'));
});

// Test 6: abortBash sends abort_bash frame and receives success
await asyncTest('abortBash sends abort_bash command successfully', async () => {
  const bridge = new OmpBridge();
  bridge.lifecycleState = 'ready';
  bridge.process = {
    stdin: {
      writable: true,
      write: (data) => {
        const frame = JSON.parse(data.trim());
        assert.strictEqual(frame.type, 'abort_bash');
        bridge.dispatchInboundFrame({
          type: 'response',
          id: frame.id,
          command: 'abort_bash',
          success: true,
        });
        return true;
      },
    },
  };

  const res = await bridge.abortBash();
  assert.strictEqual(res.success, true);
});

console.log(`\nAll ${passCount} tests passed successfully!`);
