/**
 * Verification Script: Model Catalog & State IPC with OmpBridge
 * 
 * Verifies:
 * 1. Structured error returned when calling methods before engine is ready
 * 2. Real engine spawns and negotiates protocol in RPC mode
 * 3. getAvailableModels() returns list containing current model
 * 4. setThinkingLevel() succeeds
 * 5. getState() returns complete engine state (model, sessionId, contextUsage)
 * 6. setModel() succeeds when setting valid model
 * 7. setModel() returns structured error when model/provider is invalid
 * 8. Process stops cleanly
 */

import fs from 'fs';
import os from 'os';
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

async function runModelStateIpcVerification() {
  console.log('=== Live OMP Model & State IPC Verification Suite ===\n');

  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, ...args) => {
        // Mock listener
      },
    },
  };

  const bridge = new OmpBridge(mockWindow);

  // ----------------------------------------------------
  // Scenario 1: Structured error responses when offline/unready
  // ----------------------------------------------------
  console.log('[Scenario 1] Testing structured errors before process startup...');
  
  const unreadyModels = await bridge.getAvailableModels();
  assert(unreadyModels.success === false, 'getAvailableModels returns success: false before process start');
  assert(typeof unreadyModels.error === 'string' && unreadyModels.error.length > 0, 'getAvailableModels returns error string');

  const unreadySetModel = await bridge.setModel('provider', 'model');
  assert(unreadySetModel.success === false, 'setModel returns success: false before process start');
  assert(typeof unreadySetModel.error === 'string', 'setModel returns error string');

  const unreadyThinking = await bridge.setThinkingLevel('low');
  assert(unreadyThinking.success === false, 'setThinkingLevel returns success: false before process start');
  assert(typeof unreadyThinking.error === 'string', 'setThinkingLevel returns error string');

  const unreadyState = await bridge.getState();
  assert(unreadyState.success === false, 'getState returns success: false before process start');
  assert(typeof unreadyState.error === 'string', 'getState returns error string');

  // ----------------------------------------------------
  // Scenario 2: Start live engine process
  // ----------------------------------------------------
  console.log('\n[Scenario 2] Spawning OMP engine in RPC mode (--no-session)...');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-model-state-verify-'));
  
  let spawnResult = await bridge.startProcess(tempDir, 'gemini-3.7-flash-tiered', {
    provider: 'nguyenkhoi-lmstudio-prod',
    extraArgs: ['--no-session'],
  });

  if (!spawnResult.success) {
    console.log('  ⚠️ Retrying with provider nguyenkhoi-lmstudio-local...');
    spawnResult = await bridge.startProcess(tempDir, 'gemini-3.7-flash-tiered', {
      provider: 'nguyenkhoi-lmstudio-local',
      extraArgs: ['--no-session'],
    });
  }

  assert(spawnResult.success === true, `OMP process started and negotiated protocol (PID: ${spawnResult.pid})`);
  assert(bridge.getLifecycleState() === 'ready', 'Bridge lifecycle state is "ready"');

  // ----------------------------------------------------
  // Scenario 3: getAvailableModels()
  // ----------------------------------------------------
  console.log('\n[Scenario 3] Querying getAvailableModels()...');
  const modelsRes = await bridge.getAvailableModels();
  assert(modelsRes.success === true, 'getAvailableModels returned success: true');
  assert(Array.isArray(modelsRes.models), 'getAvailableModels returned models array');
  assert(modelsRes.models.length > 0, `Catalog contains ${modelsRes.models.length} model(s)`);

  const currentModel = modelsRes.models.find((m) => m.id === 'gemini-3.7-flash-tiered');
  assert(Boolean(currentModel), 'Model catalog contains "gemini-3.7-flash-tiered"');
  assert(typeof currentModel.name === 'string', 'Model has valid name');
  assert(typeof currentModel.provider === 'string', 'Model has valid provider');
  assert(typeof currentModel.contextWindow === 'number', 'Model has contextWindow number');
  console.log(`  Target model verified: ${currentModel.name} (${currentModel.provider}/${currentModel.id})`);

  // ----------------------------------------------------
  // Scenario 4: setThinkingLevel()
  // ----------------------------------------------------
  console.log('\n[Scenario 4] Testing setThinkingLevel()...');
  const thinkResLow = await bridge.setThinkingLevel('low');
  assert(thinkResLow.success === true, 'setThinkingLevel("low") returned success: true');

  const thinkResOff = await bridge.setThinkingLevel('off');
  assert(thinkResOff.success === true, 'setThinkingLevel("off") returned success: true');

  // ----------------------------------------------------
  // Scenario 5: getState()
  // ----------------------------------------------------
  console.log('\n[Scenario 5] Querying getState()...');
  const stateRes = await bridge.getState();
  assert(stateRes.success === true, 'getState returned success: true');
  assert(Boolean(stateRes.state), 'getState returned state object');
  assert(stateRes.state.model?.id === 'gemini-3.7-flash-tiered', 'Engine state reports model "gemini-3.7-flash-tiered"');
  assert(typeof stateRes.state.sessionId === 'string', `Engine state reports sessionId: ${stateRes.state.sessionId}`);
  assert(Boolean(stateRes.state.contextUsage), 'Engine state reports contextUsage');
  assert(typeof stateRes.state.contextUsage.tokens === 'number', `contextUsage tokens: ${stateRes.state.contextUsage.tokens}`);

  // ----------------------------------------------------
  // Scenario 6: setModel() with valid model from catalog
  // ----------------------------------------------------
  console.log('\n[Scenario 6] Testing setModel() with valid model from catalog...');
  const setModelRes = await bridge.setModel(currentModel.provider, currentModel.id);
  assert(setModelRes.success === true, 'setModel returned success: true');
  assert(setModelRes.model?.id === currentModel.id, `Active model confirmed as "${setModelRes.model?.id}"`);

  // ----------------------------------------------------
  // Scenario 7: setModel() with invalid model
  // ----------------------------------------------------
  console.log('\n[Scenario 7] Testing setModel() with invalid model...');
  const invalidModelRes = await bridge.setModel('non-existent-provider', 'non-existent-model');
  assert(invalidModelRes.success === false, 'Invalid setModel returned success: false');
  assert(typeof invalidModelRes.error === 'string' && invalidModelRes.error.length > 0, `Invalid setModel returned error message: "${invalidModelRes.error}"`);

  // ----------------------------------------------------
  // Scenario 8: Clean shutdown
  // ----------------------------------------------------
  console.log('\n[Scenario 8] Stopping process cleanly...');
  bridge.stopProcess();
  fs.rmSync(tempDir, { recursive: true, force: true });
  assert(bridge.getLifecycleState() === 'idle', 'Bridge lifecycle reset to "idle"');

  console.log('\n====================================================');
  console.log(`Live Model & State IPC Verification: ${passed} passed, ${failed} failed.`);
  console.log('====================================================\n');
}

runModelStateIpcVerification().catch((err) => {
  console.error('\n❌ Unhandled error during verification:', err);
  process.exit(1);
});
