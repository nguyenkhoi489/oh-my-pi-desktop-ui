import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { RuntimeManager } from '../electron/runtime-manager.ts';
import { ProjectsStore } from '../electron/projects-store.ts';
import { OmpBridge } from '../electron/omp-bridge.ts';

let passCount = 0;
async function test(name, fn) {
  await fn();
  passCount++;
  console.log(`✓ ${name}`);
}

console.log('=== Running verify-runtime-manager.mjs ===');

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omp-runtime-verify-'));

try {
  // Test 1: ProjectsStore async operations
  await test('ProjectsStore handles async add, list, pin, and touch correctly', async () => {
    const storePath = path.join(tempDir, 'projects.json');
    const store = new ProjectsStore(storePath);

    const proj1 = await store.addProject(path.join(tempDir, 'p1'), 'Project 1');
    const proj2 = await store.addProject(path.join(tempDir, 'p2'), 'Project 2');

    let list = await store.getProjects();
    assert.equal(list.length, 2, 'Should have 2 projects');
    assert.equal(list[0].id, proj1.id, 'Project 1 must be first initially');
    assert.equal(list[1].id, proj2.id, 'Project 2 must be second initially');

    // Selecting/touching project 2 must NOT alter sidebar order
    await store.addProject(path.join(tempDir, 'p2'));
    await store.touchProject(proj2.id);
    list = await store.getProjects();
    assert.equal(list[0].id, proj1.id, 'Project 1 must remain first after touching Project 2');
    assert.equal(list[1].id, proj2.id, 'Project 2 must remain second after touching Project 2');

    // Pin project 2 -> pinned projects float to top
    const pinRes = await store.togglePin(proj2.id);
    assert.equal(pinRes, true, 'Pin should succeed');

    list = await store.getProjects();
    assert.equal(list[0].id, proj2.id, 'Pinned project should be first');
    assert.equal(list[1].id, proj1.id, 'Unpinned project should follow pinned project');

    // Unpin project 2 -> returns to original stable creation order
    await store.togglePin(proj2.id);
    list = await store.getProjects();
    assert.equal(list[0].id, proj1.id, 'Project 1 returns to first position after unpin');
    assert.equal(list[1].id, proj2.id, 'Project 2 returns to second position after unpin');

    // Remove project
    const remRes = await store.removeProject(proj1.id);
    assert.equal(remRes, true, 'Remove should succeed');
    list = await store.getProjects();
    assert.equal(list.length, 1, 'Should have 1 project remaining');

    // Concurrency test: Multiple simultaneous mutations serialize correctly
    await Promise.all([
      store.addProject(path.join(tempDir, 'c1'), 'Concurrent 1'),
      store.addProject(path.join(tempDir, 'c2'), 'Concurrent 2'),
      store.addProject(path.join(tempDir, 'c3'), 'Concurrent 3'),
    ]);
    const finalList = await store.getProjects();
    assert.equal(finalList.length, 4, 'All concurrent additions must be persisted without loss');
  });

  // Test 1b: Legacy migration without createdAt
  await test('ProjectsStore migrates legacy projects without createdAt and auto-persists stable order', async () => {
    const legacyPath = path.join(tempDir, 'legacy-projects.json');
    const legacyData = [
      { id: 'leg-1', name: 'cooling', path: path.join(tempDir, 'cooling'), pinned: false, lastOpenedAt: 100 },
      { id: 'leg-2', name: 'CLIProxy-API', path: path.join(tempDir, 'CLIProxy-API'), pinned: false, lastOpenedAt: 500 },
    ];
    await fs.writeFile(legacyPath, JSON.stringify(legacyData, null, 2), 'utf-8');

    const legacyStore = new ProjectsStore(legacyPath);
    let list = await legacyStore.getProjects();
    assert.equal(list[0].name, 'cooling', 'Legacy cooling project remains first');
    assert.equal(list[1].name, 'CLIProxy-API', 'Legacy CLIProxy-API remains second');

    // Touching CLIProxy-API (even though it had a newer lastOpenedAt) does NOT invert order
    await legacyStore.touchProject('leg-2');
    list = await legacyStore.getProjects();
    assert.equal(list[0].name, 'cooling', 'cooling remains first after touching CLIProxy-API');
    assert.equal(list[1].name, 'CLIProxy-API', 'CLIProxy-API remains second');

    // Verify auto-persisted createdAt on disk
    const savedContent = JSON.parse(await fs.readFile(legacyPath, 'utf-8'));
    assert(typeof savedContent[0].createdAt === 'number', 'createdAt is saved to disk for project 1');
    assert(typeof savedContent[1].createdAt === 'number', 'createdAt is saved to disk for project 2');
    assert(savedContent[0].createdAt < savedContent[1].createdAt, 'Project 1 has lower createdAt than project 2');
  });

  // Test 2: OmpBridge typed eventSink
  await test('OmpBridge passes events to eventSink without window', async () => {
    const emittedEvents = [];
    const bridge = new OmpBridge(null, null, (channel, payload) => {
      emittedEvents.push({ channel, payload });
    });

    bridge.setStatus('thinking');
    assert.equal(emittedEvents[0].channel, 'omp:status-change');
    assert.equal(emittedEvents[0].payload, 'thinking');

    bridge.emitNotification('Test notification', 'info');
    assert.equal(emittedEvents.length, 2);
    assert.equal(emittedEvents[1].channel, 'omp:notification');
    assert.equal(emittedEvents[1].payload.message, 'Test notification');
  });

  // Test 3: RuntimeManager admission and multi-runtime management
  await test('RuntimeManager admits and manages independent runtimes', async () => {
    const mockWindow = {
      isDestroyed: () => false,
      webContents: {
        send: () => {},
      },
    };

    const rm = new RuntimeManager(mockWindow);

    const resA = await rm.admitRuntime('proj-a', path.join(tempDir, 'pA'));
    assert.equal(resA.success, true);
    assert.equal(resA.isNew, true);
    const rtA = resA.runtime;
    assert.ok(rtA && rtA.runtimeId);

    const resB = await rm.admitRuntime('proj-b', path.join(tempDir, 'pB'));
    assert.equal(resB.success, true);
    assert.equal(resB.isNew, true);
    const rtB = resB.runtime;
    assert.ok(rtB && rtB.runtimeId);
    assert.notEqual(rtA.runtimeId, rtB.runtimeId, 'Each project must have distinct runtimeId');

    const runtimes = rm.listRuntimes();
    assert.equal(runtimes.length, 2, 'Should list 2 runtimes');

    // Re-admitting same project/cwd reuses existing runtime
    const resA2 = await rm.admitRuntime('proj-a', path.join(tempDir, 'pA'));
    assert.equal(resA2.success, true);
    assert.equal(resA2.isNew, false);
    assert.equal(resA2.runtime.runtimeId, rtA.runtimeId, 'Should reuse runtimeId for same project');
  });

  // Test 4: Envelope packaging and dual emission
  await test('Packages events into OmpEventEnvelope and dual-emits for active runtime only', async () => {
    const sentEvents = [];
    const mockWindow = {
      isDestroyed: () => false,
      webContents: {
        send: (channel, payload) => {
          sentEvents.push({ channel, payload });
        },
      },
    };

    const rm = new RuntimeManager(mockWindow);
    const resA = await rm.admitRuntime('proj-a', path.join(tempDir, 'pA'));
    const resB = await rm.admitRuntime('proj-b', path.join(tempDir, 'pB'));

    // By default, last admitted runtime is active: B
    assert.equal(rm.getActiveRuntimeId(), resB.runtime.runtimeId);

    sentEvents.length = 0;

    // Emit event on runtime B (ACTIVE)
    const bridgeB = rm.getBridge(resB.runtime.runtimeId);
    bridgeB.setStatus('thinking');

    // Should receive BOTH envelope on omp:event AND flat omp:status-change
    const envelopeB = sentEvents.find((e) => e.channel === 'omp:event');
    assert.ok(envelopeB, 'Must emit omp:event envelope');
    assert.equal(envelopeB.payload.runtimeId, resB.runtime.runtimeId);
    assert.equal(envelopeB.payload.channel, 'omp:status-change');
    assert.equal(envelopeB.payload.payload, 'thinking');

    const flatB = sentEvents.find((e) => e.channel === 'omp:status-change');
    assert.ok(flatB, 'Active runtime must also emit flat event');
    assert.equal(flatB.payload, 'thinking');

    // Clear sent events and test inactive runtime A
    sentEvents.length = 0;
    const bridgeA = rm.getBridge(resA.runtime.runtimeId);
    bridgeA.setStatus('streaming');

    const envelopeA = sentEvents.find((e) => e.channel === 'omp:event');
    assert.ok(envelopeA, 'Inactive runtime must emit envelope');
    assert.equal(envelopeA.payload.runtimeId, resA.runtime.runtimeId);
    assert.equal(envelopeA.payload.payload, 'streaming');

    const flatA = sentEvents.find((e) => e.channel === 'omp:status-change');
    assert.equal(flatA, undefined, 'Inactive runtime MUST NOT emit flat event to active tab');

    // Test session path sync in envelope
    sentEvents.length = 0;
    bridgeA.setSessionInfo('/path/to/projectA/sess.jsonl', 'sess-A-1');
    bridgeA.setStatus('idle');
    const envSync = sentEvents.find((e) => e.channel === 'omp:event');
    assert.ok(envSync, 'Must emit envelope on status change');
    assert.equal(envSync.payload.sessionPath, '/path/to/projectA/sess.jsonl', 'Envelope must synchronize sessionPath from bridge');
  });

  // Test 5: Admission control (max 4 concurrent runtimes with LRU idle retire)
  await test('Enforces admission control limit of 4 runtimes and retires idle runtime', async () => {
    const rm = new RuntimeManager(null);

    const r1 = await rm.admitRuntime('p1', path.join(tempDir, 'r1'));
    const r2 = await rm.admitRuntime('p2', path.join(tempDir, 'r2'));
    const r3 = await rm.admitRuntime('p3', path.join(tempDir, 'r3'));
    const r4 = await rm.admitRuntime('p4', path.join(tempDir, 'r4'));

    assert.equal(rm.listRuntimes().length, 4, 'Should reach max 4 runtimes');

    // Make r1 least recently active
    rm.getRuntime(r1.runtime.runtimeId).lastActiveAt = 1000;
    rm.getRuntime(r2.runtime.runtimeId).lastActiveAt = 2000;
    rm.getRuntime(r3.runtime.runtimeId).lastActiveAt = 3000;
    rm.getRuntime(r4.runtime.runtimeId).lastActiveAt = 4000;

    // Admit 5th runtime -> should retire r1
    const r5 = await rm.admitRuntime('p5', path.join(tempDir, 'r5'));
    assert.equal(r5.success, true);
    const remaining = rm.listRuntimes().map((r) => r.runtimeId);
    assert(!remaining.includes(r1.runtime.runtimeId), 'r1 should have been retired');
    assert.equal(remaining.length, 4);

    // If r2 is in awaiting_ready lifecycle, it must NOT be retired even if oldest
    rm.getBridge(r2.runtime.runtimeId).lifecycleState = 'awaiting_ready';
    rm.getRuntime(r2.runtime.runtimeId).lastActiveAt = 500;
    rm.getRuntime(r3.runtime.runtimeId).lastActiveAt = 600;

    // Admit 6th runtime -> should retire r3 instead of r2
    const r6 = await rm.admitRuntime('p6', path.join(tempDir, 'r6'));
    assert.equal(r6.success, true);
    const remainingWithLifecycle = rm.listRuntimes().map((r) => r.runtimeId);
    assert(remainingWithLifecycle.includes(r2.runtime.runtimeId), 'r2 in awaiting_ready must NOT be retired');
    assert(!remainingWithLifecycle.includes(r3.runtime.runtimeId), 'r3 (idle) should be retired instead');
  });

  // Test 6: Runtime switching and stopping
  await test('Switches active runtime and stops all runtimes cleanly', async () => {
    const rm = new RuntimeManager(null);
    const rA = await rm.admitRuntime('pA', path.join(tempDir, 'sA'));
    const rB = await rm.admitRuntime('pB', path.join(tempDir, 'sB'));

    const switched = rm.setActiveRuntime(rA.runtime.runtimeId);
    assert.equal(switched, true, 'Switch should succeed');
    assert.equal(rm.getActiveRuntimeId(), rA.runtime.runtimeId, 'Active runtime should now be A');

    const stoppedA = await rm.stopRuntime(rA.runtime.runtimeId);
    assert.equal(stoppedA, true, 'Stop runtime should succeed');
    assert.equal(rm.listRuntimes().length, 1);
    assert.equal(rm.getActiveRuntimeId(), rB.runtime.runtimeId, 'Active runtime should fallback to B');

    await rm.stopAll();
    assert.equal(rm.listRuntimes().length, 0, 'stopAll should clear all runtimes');
    assert.equal(rm.getActiveRuntimeId(), null);
  });

} finally {
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
}

console.log(`\nAll ${passCount} runtime manager tests passed successfully!`);
