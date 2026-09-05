/**
 * Verification Suite: Center Chat, Event Routing & Layout Cutover (Phase 3)
 * 
 * Verifies that:
 * 1. AgentPanel serves as Center Stage Chat with max-w-4xl bounded reading container.
 * 2. FloatingChangesCard floats above PromptComposer with git diff stats and Review in Inspector action.
 * 3. ProjectGroupList renders multi-project hierarchy and live animated status spinners for background runtimes.
 * 4. useOmpRpc demultiplexes omp:event envelopes across multiple runtimes.
 * 5. App.tsx integrates the 3-column architecture (Sidebar -> Center Stage Chat -> Right Inspector)
 *    and supports switching between Center Chat and Workbench/Canvas mode.
 * 6. All Phase 3 i18n keys are mirrored identically in vi and en dictionaries.
 */

import fs from 'node:fs';
import path from 'node:path';
import { vi } from '../shared/i18n/vi.ts';
import { en } from '../shared/i18n/en.ts';
import {
  handleRuntimeEnvelope,
  saveActiveSessionToMap,
  restoreSessionFromMap,
  createEmptyRuntimeSession,
} from '../src/utils/runtimeDemux.ts';

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

console.log('=== Starting Center Chat, Event Routing & Layout Cutover Verification (Phase 3) ===\n');

// ----------------------------------------------------
// Test 1: FloatingChangesCard Component & Layout
// ----------------------------------------------------
console.log('[Test 1] FloatingChangesCard Component & Props Contract');
{
  const cardPath = path.resolve('src/components/AgentPanel/FloatingChangesCard.tsx');
  assert(fs.existsSync(cardPath), 'FloatingChangesCard.tsx exists');
  const code = fs.readFileSync(cardPath, 'utf8');

  assert(code.includes('export interface FloatingChangesCardProps'), 'Exports FloatingChangesCardProps');
  assert(code.includes('export const FloatingChangesCard'), 'Exports FloatingChangesCard component');
  assert(code.includes('filesChanged'), 'Accepts filesChanged prop');
  assert(code.includes('insertions'), 'Accepts insertions prop');
  assert(code.includes('deletions'), 'Accepts deletions prop');
  assert(code.includes('onReview'), 'Accepts onReview callback');
  assert(code.includes('onDismiss'), 'Accepts onDismiss callback');
  assert(code.includes('filesChanged <= 0 && insertions <= 0 && deletions <= 0'), 'Safely returns null when no changes are present');
  assert(code.includes('floatingChanges.filesChanged'), 'Uses i18n key floatingChanges.filesChanged');
  assert(code.includes('floatingChanges.review'), 'Uses i18n key floatingChanges.review');
  assert(code.includes('text-emerald'), 'Renders additions in green');
  assert(code.includes('text-rose'), 'Renders deletions in red');
}

// ----------------------------------------------------
// Test 2: ProjectGroupList Component & Multi-Runtime Status
// ----------------------------------------------------
console.log('\n[Test 2] ProjectGroupList Component & Live Runtime Status');
{
  const groupListPath = path.resolve('src/components/Sidebar/ProjectGroupList.tsx');
  assert(fs.existsSync(groupListPath), 'ProjectGroupList.tsx exists');
  const code = fs.readFileSync(groupListPath, 'utf8');

  assert(code.includes('export interface ProjectGroupListProps'), 'Exports ProjectGroupListProps');
  assert(code.includes('export const ProjectGroupList'), 'Exports ProjectGroupList component');
  assert(code.includes('projects'), 'Accepts projects list');
  assert(code.includes('runtimeStates'), 'Accepts runtimeStates map');
  assert(code.includes('onSelectProject'), 'Supports selecting a project');
  assert(code.includes('onAddProject'), 'Supports adding a new project');
  assert(code.includes('onTogglePinProject'), 'Supports pinning a project');
  assert(code.includes('onRemoveProject'), 'Supports removing a project');
  assert(code.includes('onNewSession'), 'Supports creating a new session within a project');
  assert(code.includes('onSelectSession'), 'Supports selecting a session');
  assert(code.includes('LoaderCircle') && code.includes('animate-spin'), 'Renders animated spinner for running sessions in background runtimes');
  assert(code.includes('attention') && code.includes('animate-pulse'), 'Renders attention badge for completed background sessions');
  assert(code.includes('formatRelativeTime'), 'Uses relative timestamp helper');
}

// ----------------------------------------------------
// Test 3: useOmpRpc Event Demultiplexing Across Runtimes
// ----------------------------------------------------
console.log('\n[Test 3] useOmpRpc Multi-Runtime Event Demultiplexer & Behavioral Stream Preservation');
{
  const hookPath = path.resolve('src/hooks/useOmpRpc.ts');
  assert(fs.existsSync(hookPath), 'useOmpRpc.ts exists');
  const code = fs.readFileSync(hookPath, 'utf8');

  assert(code.includes('activeRuntimeId'), 'Hook tracks activeRuntimeId state');
  assert(code.includes('runtimeStates'), 'Hook tracks runtimeStates map');
  assert(code.includes('switchRuntime'), 'Hook exposes switchRuntime function');
  assert(code.includes('clearRuntimeAttention'), 'Hook exposes clearRuntimeAttention function');
  assert(code.includes('window.electronAPI.onOmpEvent'), 'Subscribes to window.electronAPI.onOmpEvent');
  assert(code.includes('handleRuntimeEnvelope'), 'Delegates envelope processing to runtimeDemux reducer');
  assert(code.includes('saveActiveSessionToMap'), 'Caches active session state prior to switching');
  assert(code.includes('restoreSessionFromMap'), 'Restores session state after switching');

  // Behavioral simulation of concurrent multi-runtime execution:
  let map = {};

  // Step 1: Runtime A is active, working on Task A
  const initialActiveA = {
    messages: [{ id: 'msg-a1', role: 'user', content: 'Task A' }],
    currentStreamText: 'Initial stream A',
    currentThinking: null,
    activeToolCalls: [],
    activeDiff: null,
    status: 'streaming',
  };
  map = saveActiveSessionToMap(map, 'rt-A', initialActiveA);
  assert(map['rt-A'].currentStreamText === 'Initial stream A', 'Saved active A stream');

  // Step 2: Switch to Runtime B (rt-B becomes active)
  const activeRuntime = 'rt-B';
  const restoredB = restoreSessionFromMap(map, activeRuntime);
  assert(restoredB.messages.length === 0, 'New runtime B has empty messages');
  assert(restoredB.currentStreamText === '', 'New runtime B has empty stream');

  // Step 3: Active runtime B receives a dual-emitted envelope (flat + envelope)
  // The reducer MUST ignore active runtime stream accumulation to avoid duplicate tokens
  const envelopeB = {
    runtimeId: 'rt-B',
    projectId: 'proj-B',
    channel: 'omp:stream-token',
    payload: 'token for B from envelope',
  };
  map = handleRuntimeEnvelope(map, envelopeB, activeRuntime);
  assert(map['rt-B'].currentStreamText === '', 'Active runtime B stream is not duplicated from envelope');

  // Step 4: Background Runtime A receives streaming tokens and tool calls via envelopes
  const envelopeAStatus = {
    runtimeId: 'rt-A',
    projectId: 'proj-A',
    channel: 'omp:status-change',
    payload: 'streaming',
  };
  map = handleRuntimeEnvelope(map, envelopeAStatus, activeRuntime);
  assert(map['rt-A'].status === 'streaming', 'Background runtime A status updated to streaming');

  const envelopeAToken1 = {
    runtimeId: 'rt-A',
    projectId: 'proj-A',
    channel: 'omp:stream-token',
    payload: ' + background token A1',
  };
  map = handleRuntimeEnvelope(map, envelopeAToken1, activeRuntime);

  const envelopeAToken2 = {
    runtimeId: 'rt-A',
    projectId: 'proj-A',
    channel: 'omp:stream-token',
    payload: ' + background token A2',
  };
  map = handleRuntimeEnvelope(map, envelopeAToken2, activeRuntime);

  const envelopeATool = {
    runtimeId: 'rt-A',
    projectId: 'proj-A',
    channel: 'omp:tool-call',
    payload: { id: 'call-1', name: 'read', status: 'running' },
  };
  map = handleRuntimeEnvelope(map, envelopeATool, activeRuntime);

  assert(
    map['rt-A'].currentStreamText === 'Initial stream A + background token A1 + background token A2',
    'Background runtime A accumulated all stream tokens without loss'
  );
  assert(map['rt-A'].activeToolCalls.length === 1, 'Background runtime A tracked active tool call');
  assert(map['rt-B'].currentStreamText === '', 'Active runtime B was unaffected by A\'s background stream');

  // Step 5: Background Runtime A completes turn
  const envelopeAIdle = {
    runtimeId: 'rt-A',
    projectId: 'proj-A',
    channel: 'omp:status-change',
    payload: 'idle',
  };
  map = handleRuntimeEnvelope(map, envelopeAIdle, activeRuntime);
  assert(map['rt-A'].status === 'idle', 'Background runtime A transitioned to idle');
  assert(map['rt-A'].attention === true, 'Background runtime A marked with attention flag upon completion');

  // Step 6: User switches back to Runtime A (A -> B -> A)
  // First save active B state
  const activeBState = {
    messages: [{ id: 'msg-b1', role: 'user', content: 'Task B in progress' }],
    currentStreamText: 'stream for B',
    currentThinking: null,
    activeToolCalls: [],
    activeDiff: null,
    status: 'idle',
  };
  map = saveActiveSessionToMap(map, 'rt-B', activeBState);

  // Restore A
  const restoredA = restoreSessionFromMap(map, 'rt-A');
  assert(restoredA.messages.length === 1, 'Restored A has original user message');
  assert(
    restoredA.currentStreamText === 'Initial stream A + background token A1 + background token A2',
    'Restored A has exact preserved background stream text without interruption'
  );
  assert(restoredA.activeToolCalls.length === 1, 'Restored A has preserved tool calls');
  assert(restoredA.activeToolCalls[0].name === 'read', 'Preserved tool call has correct name');
}

// ----------------------------------------------------
// Test 4: AgentPanel Center Stage Chat & Responsive max-w-4xl
// ----------------------------------------------------
console.log('\n[Test 4] AgentPanel Center Stage Layout with max-w-4xl');
{
  const agentPath = path.resolve('src/components/AgentPanel/AgentPanel.tsx');
  assert(fs.existsSync(agentPath), 'AgentPanel.tsx exists');
  const code = fs.readFileSync(agentPath, 'utf8');

  assert(code.includes('projectName'), 'Accepts projectName prop');
  assert(code.includes('gitBranch'), 'Accepts gitBranch prop');
  assert(code.includes('floatingChanges'), 'Accepts floatingChanges prop');
  assert(code.includes('FloatingChangesCard'), 'Integrates FloatingChangesCard');
  assert(code.includes('max-w-4xl') && code.includes('mx-auto'), 'Enforces max-w-4xl mx-auto container for Center Stage readability');
  assert(code.includes('PromptComposer'), 'Preserves PromptComposer docked at bottom of center container');
  assert(code.includes('ChatHistory'), 'Preserves ChatHistory inside center container');
}

// ----------------------------------------------------
// Test 5: App.tsx 3-Column Layout & Mode Switching
// ----------------------------------------------------
console.log('\n[Test 5] App.tsx 3-Column Layout Architecture');
{
  const appPath = path.resolve('src/App.tsx');
  assert(fs.existsSync(appPath), 'App.tsx exists');
  const code = fs.readFileSync(appPath, 'utf8');

  assert(code.includes('ProjectGroupList'), 'App.tsx mounts ProjectGroupList in Left Sidebar');
  assert(code.includes('InspectorPanel'), 'App.tsx mounts InspectorPanel in Right Sidebar');
  assert(code.includes('centerView'), 'App.tsx manages centerView state (\'chat\' | \'workbench\')');
  assert(code.includes('floatingChanges'), 'App.tsx computes floatingChanges from git and active diffs');
  assert(code.includes('onExpandCanvas'), 'InspectorPanel can toggle workbench mode');
  assert(code.includes('onToggleCenterView'), 'HeaderBar is passed centerView toggle callback');
}

// ----------------------------------------------------
// Test 6: i18n Key Parity for Phase 3
// ----------------------------------------------------
console.log('\n[Test 6] i18n Key Parity for Phase 3');
{
  const requiredKeys = [
    'header.chat',
    'header.chatView',
    'header.workbench',
    'header.workbenchView',
    'floatingChanges.filesChanged',
    'floatingChanges.review',
    'floatingChanges.dismiss',
    'projects.title',
    'projects.add',
    'projects.newSession',
    'projects.pin',
    'projects.unpin',
    'projects.remove',
    'projects.noProjects',
    'projects.otherSessions',
    'projects.running',
    'projects.finished',
  ];

  for (const key of requiredKeys) {
    assert(Boolean(vi[key]), `VI dictionary contains key: ${key}`);
    assert(Boolean(en[key]), `EN dictionary contains key: ${key}`);
  }
}

console.log(`\n====================================================`);
console.log(`Phase 3 Verification Complete: ${passed} passed, ${failed} failed.`);
console.log(`====================================================`);
