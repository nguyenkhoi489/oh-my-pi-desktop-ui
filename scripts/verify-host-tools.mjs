import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { HostToolRegistry } from '../electron/host-tools.ts';
import { OmpBridge } from '../electron/omp-bridge.ts';

let passCount = 0;
async function test(name, fn) {
  await fn();
  passCount++;
  console.log(`✓ ${name}`);
}

console.log('=== Running verify-host-tools.mjs ===');

await test('HostToolRegistry initializes full suite of built-in tools', () => {
  const registry = new HostToolRegistry();
  const declarations = registry.getDeclarations();
  assert(declarations.length >= 5, 'Must have at least 5 built-in tools');
  assert(declarations.some((t) => t.name === 'notify_user'), 'Must contain notify_user');
  assert(declarations.some((t) => t.name === 'open_in_browser'), 'Must contain open_in_browser');
  assert(declarations.some((t) => t.name === 'reveal_file'), 'Must contain reveal_file');
  assert(declarations.some((t) => t.name === 'open_in_app'), 'Must contain open_in_app');
  assert(declarations.some((t) => t.name === 'pick_file'), 'Must contain pick_file');
});

await test('HostToolRegistry executes notify_user successfully', async () => {
  const registry = new HostToolRegistry();
  const controller = new AbortController();
  const res = await registry.executeTool('notify_user', { title: 'Test', message: 'Hello OMP' }, {
    toolCallId: 'call-1',
    signal: controller.signal,
  });

  assert(res.isError === false, 'notify_user should succeed');
  assert(Array.isArray(res.content), 'res.content should be array');
  assert(res.content[0].text.includes('Hello OMP'), 'Response text should contain message');
});

await test('HostToolRegistry executes open_in_app successfully', async () => {
  const registry = new HostToolRegistry();
  const controller = new AbortController();
  const res = await registry.executeTool('open_in_app', { filePath: 'src/main.ts', line: 42 }, {
    toolCallId: 'call-open-1',
    signal: controller.signal,
  });

  assert(res.isError === false, 'open_in_app should succeed');
  assert(res.content[0].text.includes('src/main.ts'), 'Response should mention file');
  assert(res.content[0].text.includes('42'), 'Response should mention line number');
});

await test('HostToolRegistry executes pick_file successfully', async () => {
  const registry = new HostToolRegistry();
  const controller = new AbortController();
  const res = await registry.executeTool('pick_file', { title: 'Select test file' }, {
    toolCallId: 'call-pick-1',
    signal: controller.signal,
  });

  assert(res.isError === false, 'pick_file should not throw error');
  assert(Array.isArray(res.content), 'res.content should be array');
});

await test('HostToolRegistry handles unregistered tool safely', async () => {
  const registry = new HostToolRegistry();
  const controller = new AbortController();
  const res = await registry.executeTool('non_existent_tool', {}, {
    toolCallId: 'call-2',
    signal: controller.signal,
  });

  assert(res.isError === true, 'Unregistered tool should return isError: true');
  assert(res.content[0].text.includes('not registered'), 'Should state not registered');
});

await test('HostToolRegistry enforces timeout guard', async () => {
  const registry = new HostToolRegistry();
  // Register a slow tool
  registry.register({
    name: 'slow_tool',
    description: 'A tool that hangs',
    parameters: { type: 'object' },
    execute: async (_args, ctx) => {
      await new Promise((r) => {
        const t = setTimeout(r, 200);
        ctx.signal.addEventListener('abort', () => {
          clearTimeout(t);
          r(null);
        });
      });
      return 'done';
    },
  });

  const controller = new AbortController();
  const res = await registry.executeTool('slow_tool', {}, {
    toolCallId: 'call-3',
    signal: controller.signal,
    timeoutMs: 100, // 100ms timeout
  });

  assert(res.isError === true, 'Hanging tool should time out');
  assert(res.content[0].text.includes('timed out'), 'Error should mention timed out');
});

await test('Preload and Main IPC contracts for host tools and URI schemes are properly wired', () => {
  const preloadSource = fs.readFileSync(path.resolve('electron/preload.ts'), 'utf-8');
  assert(preloadSource.includes('omp:register-host-tools'), 'preload.ts must invoke omp:register-host-tools');
  assert(preloadSource.includes('omp:set-host-uri-schemes'), 'preload.ts must invoke omp:set-host-uri-schemes');

  const mainSource = fs.readFileSync(path.resolve('electron/main.ts'), 'utf-8');
  assert(mainSource.includes('omp:register-host-tools'), 'main.ts must handle omp:register-host-tools');
  assert(mainSource.includes('omp:set-host-uri-schemes'), 'main.ts must handle omp:set-host-uri-schemes');
});

console.log(`\nAll ${passCount} tests passed successfully!`);
