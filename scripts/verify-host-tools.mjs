import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { HostToolRegistry, HostUriRouter } from '../electron/host-tools.ts';
import { OmpBridge } from '../electron/omp-bridge.ts';

const mockWindow = {
  isDestroyed: () => false,
  webContents: { send: () => {} },
};

function readyBridge(sent) {
  const written = [];
  const bridge = new OmpBridge({
    isDestroyed: () => false,
    webContents: { send: (channel, payload) => sent?.push({ channel, payload }) },
  });
  bridge.lifecycleState = 'ready';
  bridge.process = {
    stdin: { writable: true, write: (data) => written.push(JSON.parse(data.toString().trim())) },
    killed: false,
    kill: () => {},
  };
  return { bridge, written };
}

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

await test('HostToolRegistry open_in_app forwards request to the Desktop handler', async () => {
  const received = [];
  const registry = new HostToolRegistry({ openInApp: (req) => received.push(req) });
  const controller = new AbortController();
  const res = await registry.executeTool('open_in_app', { filePath: 'src/main.ts', line: 42 }, {
    toolCallId: 'call-open-1',
    signal: controller.signal,
  });

  assert(res.isError === false, 'open_in_app should succeed');
  assert(res.content[0].text.includes('src/main.ts'), 'Response should mention file');
  assert(res.content[0].text.includes('42'), 'Response should mention line number');
  assert.deepStrictEqual(received, [{ kind: 'file', target: 'src/main.ts', line: 42 }], 'Handler receives file open request');

  const orphan = new HostToolRegistry();
  const orphanRes = await orphan.executeTool('open_in_app', { filePath: 'src/main.ts' }, {
    toolCallId: 'call-open-2',
    signal: controller.signal,
  });
  assert(orphanRes.isError === true, 'open_in_app without a Desktop handler must report an error, not fake success');
});

await test('HostToolRegistry pick_file declares a long per-tool timeout', () => {
  const registry = new HostToolRegistry();
  const pickFile = registry.getTool('pick_file');
  assert(pickFile && pickFile.timeoutMs >= 60_000, 'pick_file timeoutMs must exceed the 15s default');
});

await test('HostToolRegistry honors per-tool timeoutMs', async () => {
  const registry = new HostToolRegistry();
  registry.register({
    name: 'slow_by_default',
    description: 'hangs',
    parameters: { type: 'object' },
    timeoutMs: 50,
    execute: () => new Promise((r) => setTimeout(() => r('late'), 400)),
  });
  const started = Date.now();
  const res = await registry.executeTool('slow_by_default', {}, {
    toolCallId: 'call-slow',
    signal: new AbortController().signal,
  });
  assert(res.isError === true && res.content[0].text.includes('timed out'), 'Tool-level timeoutMs applies');
  assert(Date.now() - started < 300, 'Timeout fired from tool-level value, not the 15s default');
});

await test('HostToolRegistry rejects an already-aborted signal without running the tool', async () => {
  const registry = new HostToolRegistry();
  let ran = false;
  registry.register({
    name: 'never_runs',
    description: 'x',
    parameters: { type: 'object' },
    execute: async () => { ran = true; return 'ran'; },
  });
  const controller = new AbortController();
  controller.abort();
  const res = await registry.executeTool('never_runs', {}, { toolCallId: 'c', signal: controller.signal });
  assert(res.isError === true && res.content[0].text.includes('aborted'), 'Pre-aborted signal yields abort error');
  assert(ran === false, 'Tool body never executes on a pre-aborted signal');
});

await test('HostUriRouter parses colon paths, absolute single-slash paths, binary files and aborted reads', async () => {
  const opened = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-uri-edge-'));
  const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-uri-outside-'));
  fs.writeFileSync(path.join(dir, 'a:b.txt'), 'colon file');
  fs.writeFileSync(path.join(otherDir, 'outside.txt'), 'outside');
  fs.writeFileSync(path.join(dir, 'blob.bin'), Buffer.from([0x89, 0x50, 0x00, 0x47]));
  const router = new HostUriRouter({
    openInApp: (req) => opened.push(req),
    resolvePath: (target) => path.resolve(dir, target),
  });

  const colon = await router.handle('read', 'ompapp://file/a:b.txt:3');
  assert(!colon.isError && colon.content === 'colon file', 'Colon inside file name is preserved');
  assert(opened[0].line === 3 && opened[0].target === path.join(dir, 'a:b.txt'), 'Trailing :line still parsed');

  const noLine = await router.handle('read', 'ompapp://file/a:b.txt');
  assert(!noLine.isError && opened[1].line === undefined, 'Non-numeric suffix is not treated as a line');

  const absolute = await router.handle('read', `ompapp://file${otherDir}/outside.txt`);
  assert(!absolute.isError && absolute.content === 'outside', 'Single-slash absolute path outside workspace resolves');

  const binary = await router.handle('read', 'ompapp://file/blob.bin');
  assert(binary.isError === true && /nhị phân/.test(binary.error), 'Binary file is rejected instead of returned as mojibake');

  const controller = new AbortController();
  controller.abort();
  const before = opened.length;
  const aborted = await router.handle('read', 'ompapp://file/a:b.txt', undefined, controller.signal);
  assert(aborted.isError === true && opened.length === before, 'Aborted read performs no open side effect');

  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(otherDir, { recursive: true, force: true });
});

await test('HostUriRouter restricts editor links to file form and notifies the user', async () => {
  const notes = [];
  const router = new HostUriRouter({ notify: (m) => notes.push(m) });
  const remote = await router.handle('read', 'vscode://vscode-remote/ssh-remote+host/etc');
  assert(remote.isError === true && notes.length === 0, 'Non-file vscode authority is rejected silently');
  const file = await router.handle('read', 'cursor://file/Users/x/a.ts:10');
  assert(!file.isError && notes.length === 1 && /Model yêu cầu mở/.test(notes[0]), 'file form opens and notifies');
});

await test('OmpBridge.followUp surfaces engine rejection', async () => {
  const { bridge, written } = readyBridge();
  const pending = bridge.followUp('queued while idle');
  bridge.dispatchInboundFrame({ type: 'response', id: written[0].id, command: 'follow_up', success: false, error: 'no active turn' });
  const res = await pending;
  assert(res.success === false && res.error === 'no active turn', 'followUp returns the engine error instead of unconditional success');
});

await test('OmpBridge drops in-flight host URI replies when the process is cleaned up', async () => {
  const { bridge, written } = readyBridge();
  bridge.hostUriRouter.handle = () => new Promise((r) => setTimeout(() => r({ content: 'late' }), 30));
  bridge.dispatchInboundFrame({ type: 'host_uri_request', id: 'stale-1', operation: 'read', url: 'ompapp://session/x' });
  const staleProcess = bridge.process;
  bridge.cleanupProcess();
  bridge.process = staleProcess;
  bridge.lifecycleState = 'ready';
  await new Promise((r) => setTimeout(r, 60));
  assert(!written.some((f) => f.type === 'host_uri_result' && f.id === 'stale-1'), 'No host_uri_result is written to the restarted process');
});

await test('HostUriRouter serves ompapp:// session and file reads', async () => {
  const opened = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-uri-'));
  const filePath = path.join(dir, 'note.txt');
  fs.writeFileSync(filePath, 'hello uri');
  const router = new HostUriRouter({
    openInApp: (req) => opened.push(req),
    resolvePath: (target) => path.resolve(dir, target),
  });

  const session = await router.handle('read', 'ompapp://session/abc-123');
  assert(!session.isError && session.content.includes('abc-123'), 'Session read returns confirmation content');

  const file = await router.handle('read', 'ompapp://file/note.txt:7');
  assert(!file.isError && file.content === 'hello uri', 'File read returns file content');
  assert.deepStrictEqual(opened, [
    { kind: 'session', target: 'abc-123' },
    { kind: 'file', target: filePath, line: 7 },
  ], 'Router forwards open requests with parsed line');

  const write = await router.handle('write', 'ompapp://file/note.txt', 'x');
  assert(write.isError === true, 'Write is rejected');
  const unknownKind = await router.handle('read', 'ompapp://widget/1');
  assert(unknownKind.isError === true, 'Unknown ompapp kind is rejected');
  const unknownScheme = await router.handle('read', 'ftp://x');
  assert(unknownScheme.isError === true, 'Unknown scheme is rejected');
  const missing = await router.handle('read', 'ompapp://file/missing.txt');
  assert(missing.isError === true && typeof missing.error === 'string', 'Missing file surfaces as error payload');
  fs.rmSync(dir, { recursive: true, force: true });
});

await test('OmpBridge.setHostUriSchemes frames schemes as objects', async () => {
  const { bridge, written } = readyBridge();
  const pending = bridge.setHostUriSchemes(bridge.hostUriRouter.getSchemes());
  assert(written.length === 1 && written[0].type === 'set_host_uri_schemes', 'One set_host_uri_schemes frame written');
  assert.deepStrictEqual(
    written[0].schemes.map((s) => s.scheme),
    ['ompapp', 'vscode', 'cursor'],
    'Schemes are {scheme} objects in registration order'
  );
  assert(written[0].schemes.every((s) => typeof s === 'object' && s.immutable === true), 'Each scheme entry is an immutable object');
  bridge.dispatchInboundFrame({ type: 'response', id: written[0].id, command: 'set_host_uri_schemes', success: true });
  const res = await pending;
  assert(res.success === true, 'setHostUriSchemes resolves on response');
});

await test('OmpBridge answers host_uri_request with host_uri_result and forwards open request', async () => {
  const sent = [];
  const { bridge, written } = readyBridge(sent);
  bridge.dispatchInboundFrame({ type: 'host_uri_request', id: 'uri-1', operation: 'read', url: 'ompapp://session/s-9' });
  await new Promise((r) => setTimeout(r, 20));
  const reply = written.find((f) => f.type === 'host_uri_result');
  assert(reply && reply.id === 'uri-1', 'host_uri_result echoes request id');
  assert(!reply.isError && reply.content.includes('s-9'), 'Result carries content');
  assert(sent.some((e) => e.channel === 'omp:host-open-request' && e.payload.kind === 'session' && e.payload.target === 's-9'), 'Renderer receives omp:host-open-request');
  assert(sent.some((e) => e.channel === 'omp:notification' && /Model yêu cầu/.test(e.payload.message)), 'User is told the model requested it');

  bridge.dispatchInboundFrame({ type: 'host_uri_request', id: 'uri-2', operation: 'read', url: 'ompapp://file/missing-file.txt' });
  bridge.dispatchInboundFrame({ type: 'host_uri_cancel', id: 'c-1', targetId: 'uri-2' });
  await new Promise((r) => setTimeout(r, 20));
  assert(!written.some((f) => f.type === 'host_uri_result' && f.id === 'uri-2'), 'Cancelled request writes no result');
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

  assert(preloadSource.includes('omp:host-open-request'), 'preload.ts must expose omp:host-open-request listener');

  const mainSource = fs.readFileSync(path.resolve('electron/main.ts'), 'utf-8');
  assert(mainSource.includes('omp:register-host-tools'), 'main.ts must handle omp:register-host-tools');
  assert(mainSource.includes('omp:set-host-uri-schemes'), 'main.ts must handle omp:set-host-uri-schemes');

  const appSource = fs.readFileSync(path.resolve('src/App.tsx'), 'utf-8');
  assert(appSource.includes('onHostOpenRequest'), 'App.tsx must subscribe to host open requests');
});

await test('Main window close disposes maintenance CLI processes', () => {
  const mainSource = fs.readFileSync(path.resolve('electron/main.ts'), 'utf-8');
  const closedStart = mainSource.indexOf("mainWindow.on('closed'");
  assert(closedStart !== -1, "main.ts has a 'closed' handler");
  const closedEnd = mainSource.indexOf('});', closedStart);
  const handler = mainSource.slice(closedStart, closedEnd);
  assert(handler.includes('disposeAll()'), "'closed' handler delegates to disposeAll()");
  const disposeStart = mainSource.indexOf('function disposeAll()');
  assert(disposeStart !== -1, 'main.ts defines disposeAll()');
  const disposeBody = mainSource.slice(disposeStart, mainSource.indexOf('\n}\n', disposeStart));
  assert(disposeBody.includes('engineMaintenanceManager.dispose()'), 'disposeAll disposes engineMaintenanceManager');
  assert(disposeBody.includes('authLoginManager.dispose()'), 'disposeAll still disposes authLoginManager');
});

console.log(`\nAll ${passCount} tests passed successfully!`);
