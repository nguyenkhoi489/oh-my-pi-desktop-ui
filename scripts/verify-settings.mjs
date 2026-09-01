/**
 * Verification Suite: Settings & Persistence (Phase 7)
 *
 * Requirements:
 * 1. Settings store load/save/merge partial.
 * 2. Damaged/corrupted or missing settings.json -> returns defaults without crash.
 * 3. IPC simulation (settings:get, settings:set partial merge + sync).
 * 4. startProcess reads settings -> spawn args contain --provider, --model, --approval-mode.
 * 5. Explicit startProcess options override settings defaults.
 * 6. Custom binary path in settings applied to detection.
 * 7. Post-handshake settings application (thinking level, auto-compaction).
 * 8. Runtime updates (setModel, setThinkingLevel, setApprovalMode, setAutoCompaction) sync back to store.
 * 9. Theme persistence & toggle logic verification.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SettingsStore, DEFAULT_SETTINGS } from '../electron/settings-store.ts';
import { OmpBridge } from '../electron/omp-bridge.ts';

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

console.log('=== Starting Settings & Persistence Verification Suite (Phase 7) ===\n');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-settings-test-'));
const testSettingsPath = path.join(tempDir, 'settings.json');

try {
  // ----------------------------------------------------
  // Test 1: Store load/save/merge partial
  // ----------------------------------------------------
  console.log('[Test 1] Store load/save/merge partial');
  {
    const store = new SettingsStore(testSettingsPath);
    const initial = store.get();
    assert(initial.theme === 'light', 'Default theme is light');
    assert(initial.approvalMode === 'always-ask', 'Default approvalMode is always-ask');
    assert(initial.defaultThinkingLevel === 'off', 'Default thinkingLevel is off');
    assert(initial.autoCompaction === false, 'Default autoCompaction is false');

    // Save partial
    const updated1 = store.set({ theme: 'dark', customBinaryPath: '/usr/local/bin/omp' });
    assert(updated1.theme === 'dark', 'Theme updated to dark');
    assert(updated1.customBinaryPath === '/usr/local/bin/omp', 'Custom path updated');
    assert(updated1.approvalMode === 'always-ask', 'Approval mode preserved');

    // Verify file on disk
    assert(fs.existsSync(testSettingsPath), 'settings.json written to disk');
    const rawOnDisk = JSON.parse(fs.readFileSync(testSettingsPath, 'utf-8'));
    assert(rawOnDisk.theme === 'dark', 'Disk file has theme dark');
    assert(rawOnDisk.customBinaryPath === '/usr/local/bin/omp', 'Disk file has custom path');

    // Partial merge with second instance
    const store2 = new SettingsStore(testSettingsPath);
    assert(store2.get().theme === 'dark', 'New store instance reads saved dark theme');
    assert(store2.get().customBinaryPath === '/usr/local/bin/omp', 'New store reads saved custom path');

    store2.set({ defaultProvider: 'anthropic', defaultModel: 'claude-3-7-sonnet' });
    const finalState = store2.get();
    assert(finalState.theme === 'dark', 'Partial set preserves existing theme');
    assert(finalState.customBinaryPath === '/usr/local/bin/omp', 'Partial set preserves custom binary path');
    assert(finalState.defaultProvider === 'anthropic', 'defaultProvider updated');
    assert(finalState.defaultModel === 'claude-3-7-sonnet', 'defaultModel updated');
  }

  // ----------------------------------------------------
  // Test 2: Damaged / missing file fallback
  // ----------------------------------------------------
  console.log('\n[Test 2] Damaged / missing settings.json fallback to defaults');
  {
    const corruptPath = path.join(tempDir, 'corrupt-settings.json');
    fs.writeFileSync(corruptPath, '{ INVALID JSON CORRUPTED DATA !!!', 'utf-8');

    const corruptStore = new SettingsStore(corruptPath);
    const loaded = corruptStore.get();
    assert(loaded.theme === 'light', 'Corrupted file falls back to default theme light');
    assert(loaded.approvalMode === 'always-ask', 'Corrupted file falls back to default approval mode');

    // Saving recovers the file
    corruptStore.set({ theme: 'dark' });
    const recovered = JSON.parse(fs.readFileSync(corruptPath, 'utf-8'));
    assert(recovered.theme === 'dark', 'Corrupted file recovered on next save');

    // Non-existent file
    const missingPath = path.join(tempDir, 'non-existent-settings.json');
    const missingStore = new SettingsStore(missingPath);
    assert(missingStore.get().theme === 'light', 'Non-existent file returns default settings');
  }

  // ----------------------------------------------------
  // Test 3: IPC handler simulation (settings:get & settings:set)
  // ----------------------------------------------------
  console.log('\n[Test 3] IPC handler simulation (settings:get, settings:set)');
  {
    const ipcSettingsPath = path.join(tempDir, 'ipc-settings.json');
    const store = new SettingsStore(ipcSettingsPath);

    // Simulate IPC get handler
    const handleGet = () => store.get();
    const handleSet = (partial) => store.set(partial);

    const initial = handleGet();
    assert(initial.theme === 'light', 'IPC get returns initial theme');

    const updated = handleSet({ theme: 'dark', approvalMode: 'write' });
    assert(updated.theme === 'dark', 'IPC set returns updated theme');
    assert(updated.approvalMode === 'write', 'IPC set returns updated approvalMode');

    const retrieved = handleGet();
    assert(retrieved.theme === 'dark', 'IPC get confirms persisted theme');
    assert(retrieved.approvalMode === 'write', 'IPC get confirms persisted approvalMode');
  }

  // ----------------------------------------------------
  // Test 4: OmpBridge uses settings for spawn args (live mock binary)
  // ----------------------------------------------------
  console.log('\n[Test 4] OmpBridge reads settings for spawn args');
  {
    const bridgeSettingsPath = path.join(tempDir, 'bridge-settings.json');
    const store = new SettingsStore(bridgeSettingsPath);
    store.set({
      defaultProvider: 'anthropic',
      defaultModel: 'claude-3-7-sonnet',
      approvalMode: 'write',
    });

    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: () => {} },
    };

    // Create a mock executable script that records its argv and emits ready frame
    const argsLogFile = path.join(tempDir, 'spawn-args.log');
    const dummyBin = path.join(tempDir, 'mock-omp-spawn.sh');
    fs.writeFileSync(
      dummyBin,
      `#!/bin/sh\necho "$@" > "${argsLogFile}"\nexit 0\n`,
      'utf-8'
    );
    fs.chmodSync(dummyBin, 0o755);

    const bridge = new OmpBridge(mockWindow, store);
    bridge.setCustomBinaryPath(dummyBin);

    // 1. startProcess with no explicit args -> uses settings defaults
    await bridge.startProcess(tempDir);

    assert(fs.existsSync(argsLogFile), 'Mock script was spawned and recorded args');
    const recordedArgs = fs.readFileSync(argsLogFile, 'utf-8').trim();
    assert(recordedArgs.includes('--provider anthropic'), 'Spawn args include --provider from settings');
    assert(recordedArgs.includes('--model claude-3-7-sonnet'), 'Spawn args include --model from settings');
    assert(recordedArgs.includes('--approval-mode write'), 'Spawn args include --approval-mode from settings');

    bridge.stopProcess();

    // 2. startProcess with explicit overrides -> explicit options win
    fs.unlinkSync(argsLogFile);
    await bridge.startProcess(tempDir, 'gpt-4o', { provider: 'openai', approvalMode: 'yolo' });

    assert(fs.existsSync(argsLogFile), 'Mock script recorded overridden args');
    const overriddenArgs = fs.readFileSync(argsLogFile, 'utf-8').trim();
    assert(overriddenArgs.includes('--provider openai'), 'Explicit provider overrides settings');
    assert(overriddenArgs.includes('--model gpt-4o'), 'Explicit model overrides settings');
    assert(overriddenArgs.includes('--approval-mode yolo'), 'Explicit approvalMode overrides settings');

    bridge.stopProcess();
  }

  // ----------------------------------------------------
  // Test 5: Custom binary path from settings applied to detection
  // ----------------------------------------------------
  console.log('\n[Test 5] Custom binary path from settings applied to detection');
  {
    const dummyBin = path.join(tempDir, 'custom-omp-bin');
    fs.writeFileSync(dummyBin, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

    const storePath = path.join(tempDir, 'custom-bin-settings.json');
    const store = new SettingsStore(storePath);
    store.set({ customBinaryPath: dummyBin });

    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: () => {} },
    };

    const bridge = new OmpBridge(mockWindow, store);
    const detected = bridge.detectBinaryPath();
    assert(detected === dummyBin, 'detectBinaryPath resolves custom binary path from settings');
  }

  // ----------------------------------------------------
  // Test 6: Post-handshake settings application
  // ----------------------------------------------------
  console.log('\n[Test 6] Post-handshake settings applied (thinking level, auto-compaction)');
  {
    const storePath = path.join(tempDir, 'handshake-settings.json');
    const store = new SettingsStore(storePath);
    store.set({
      defaultThinkingLevel: 'high',
      autoCompaction: true,
    });

    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: () => {} },
    };

    const bridge = new OmpBridge(mockWindow, store);
    bridge.lifecycleState = 'awaiting_ready';

    const writtenFrames = [];
    bridge.process = {
      pid: 12345,
      stdin: {
        writable: true,
        write: (data) => writtenFrames.push(data.toString()),
      },
      killed: false,
      kill: () => {},
    };

    // Simulate inbound ready frame
    bridge.dispatchInboundFrame({ type: 'ready' });
    assert(writtenFrames.length === 1, 'Bridge sends negotiate_protocol command upon ready');

    const negotiateFrame = JSON.parse(writtenFrames[0].trim());
    assert(negotiateFrame.type === 'negotiate_protocol', 'First frame is negotiate_protocol');

    // Simulate negotiation success
    bridge.dispatchInboundFrame({
      type: 'response',
      id: negotiateFrame.id,
      command: 'negotiate_protocol',
      success: true,
      data: { protocolVersion: 2 },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    // Check that post-handshake triggers thinking level and auto compaction commands
    assert(bridge.lifecycleState === 'ready', 'Bridge transitions to ready state');

    // Check sent commands
    const framesAfterHandshake = writtenFrames.slice(1).map((f) => JSON.parse(f.trim()));
    const hasThinkingLevelCmd = framesAfterHandshake.some(
      (f) => f.type === 'set_thinking_level' && f.level === 'high'
    );
    const hasAutoCompactionCmd = framesAfterHandshake.some(
      (f) => f.type === 'set_auto_compaction' && f.enabled === true
    );

    assert(hasThinkingLevelCmd, 'set_thinking_level command sent with settings default level');
    assert(hasAutoCompactionCmd, 'set_auto_compaction command sent with settings autoCompaction');
  }

  // ----------------------------------------------------
  // Test 7: Runtime updates sync back to SettingsStore
  // ----------------------------------------------------
  console.log('\n[Test 7] Runtime updates sync back to SettingsStore');
  {
    const storePath = path.join(tempDir, 'sync-settings.json');
    const store = new SettingsStore(storePath);

    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: () => {} },
    };

    const bridge = new OmpBridge(mockWindow, store);
    bridge.lifecycleState = 'ready';

    const writtenFrames = [];
    bridge.process = {
      stdin: {
        writable: true,
        write: (data) => writtenFrames.push(data.toString()),
      },
      killed: false,
      kill: () => {},
    };

    // 1. setModel sync
    const setModelPromise = bridge.setModel('openai', 'gpt-4o');
    const setModelFrame = JSON.parse(writtenFrames[writtenFrames.length - 1].trim());
    bridge.dispatchInboundFrame({
      type: 'response',
      id: setModelFrame.id,
      command: 'set_model',
      success: true,
      data: { id: 'gpt-4o', provider: 'openai', name: 'GPT-4o' },
    });
    await setModelPromise;
    assert(store.get().defaultProvider === 'openai', 'setModel syncs defaultProvider to store');
    assert(store.get().defaultModel === 'gpt-4o', 'setModel syncs defaultModel to store');

    // 2. setThinkingLevel sync
    const setThinkingPromise = bridge.setThinkingLevel('medium');
    const setThinkingFrame = JSON.parse(writtenFrames[writtenFrames.length - 1].trim());
    bridge.dispatchInboundFrame({
      type: 'response',
      id: setThinkingFrame.id,
      command: 'set_thinking_level',
      success: true,
    });
    await setThinkingPromise;
    assert(store.get().defaultThinkingLevel === 'medium', 'setThinkingLevel syncs to store');

    // 3. setApprovalMode sync
    await bridge.setApprovalMode('yolo');
    assert(store.get().approvalMode === 'yolo', 'setApprovalMode syncs to store');

    // 4. setAutoCompaction sync
    bridge.lifecycleState = 'ready';
    bridge.process = {
      stdin: {
        writable: true,
        write: (data) => writtenFrames.push(data.toString()),
      },
      killed: false,
      kill: () => {},
    };
    const setCompactionPromise = bridge.setAutoCompaction(true);
    const setCompactionFrame = JSON.parse(writtenFrames[writtenFrames.length - 1].trim());
    bridge.dispatchInboundFrame({
      type: 'response',
      id: setCompactionFrame.id,
      command: 'set_auto_compaction',
      success: true,
    });
    await setCompactionPromise;
    assert(store.get().autoCompaction === true, 'setAutoCompaction syncs to store');
  }

  // ----------------------------------------------------
  // Test 8: Theme Init & Toggle Persistence
  // ----------------------------------------------------
  console.log('\n[Test 8] Theme init & toggle persistence');
  {
    const themeStorePath = path.join(tempDir, 'theme-settings.json');
    const store = new SettingsStore(themeStorePath);

    // Initial state
    assert(store.get().theme === 'light', 'Theme starts at light default');

    // Toggle 1: light -> dark
    const next1 = store.get().theme === 'light' ? 'dark' : 'light';
    store.set({ theme: next1 });
    assert(store.get().theme === 'dark', 'Toggled to dark theme');

    // Toggle 2: dark -> light
    const next2 = store.get().theme === 'light' ? 'dark' : 'light';
    store.set({ theme: next2 });
    assert(store.get().theme === 'light', 'Toggled back to light theme');

    // Verify disk persistence
    const reloaded = new SettingsStore(themeStorePath);
    assert(reloaded.get().theme === 'light', 'Disk reload confirms theme state');
  }

  console.log(`\n=== Settings Verification Suite Complete: ${passed} passed, ${failed} failed ===`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
