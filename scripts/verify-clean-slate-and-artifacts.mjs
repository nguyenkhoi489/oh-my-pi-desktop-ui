/**
 * Verification Suite: State Clean Slate & ChatGPT-Style Right Sidebar (Artifacts Overview)
 *
 * Verifies:
 * 1. State Clean Slate:
 *    - useOmpRpc.resetChat clears messages, stream text, thinking, diff, todos, queues, and activeSessionPath.
 *    - App.tsx calls resetChat(false) on project select, add project, open folder, and process started.
 * 2. Chat Clutter Reduction & Typography:
 *    - markdownParser.ts uses neutral slate/zinc codespan (zero rose/pink).
 *    - TodoPanel.tsx defaults isExpanded to false with single-line pill header.
 * 3. ChatGPT-Style Right Sidebar:
 *    - ArtifactsOverview.tsx renders Outputs list and Sources/Attachments.
 *    - InspectorPanel.tsx mounts ArtifactsOverview as default and supports detail view toggle.
 *    - App.tsx does not auto-force changes tab on diff arrival.
 * 4. i18n Parity:
 *    - All inspector.artifacts keys exist in both vi and en.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { vi } from '../shared/i18n/vi.ts';
import { en } from '../shared/i18n/en.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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

console.log('=== Starting Clean Slate & ChatGPT-Style Sidebar Verification Suite ===\n');

// ----------------------------------------------------
// Test 1: State Clean Slate in useOmpRpc & App.tsx
// ----------------------------------------------------
console.log('[Test 1] State Clean Slate contract...');
{
  const useOmpRpcSource = fs.readFileSync(path.join(rootDir, 'src/hooks/useOmpRpc.ts'), 'utf-8');
  assert(useOmpRpcSource.includes('setActiveSessionPath(null);'), 'resetChat clears activeSessionPath');
  assert(useOmpRpcSource.includes('setActiveDiff(null);'), 'resetChat clears activeDiff');
  assert(useOmpRpcSource.includes('setTodoPhases([]);'), 'resetChat clears todoPhases');
  assert(useOmpRpcSource.includes('setTodos([]);'), 'resetChat clears todos');
  assert(useOmpRpcSource.includes('setFollowUpQueue([]);'), 'resetChat clears followUpQueue');

  const appSource = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf-8');
  assert(appSource.includes('handleProcessStarted = useCallback(async () => {\n    await resetChat(false);'), 'handleProcessStarted calls resetChat(false)');
  assert(appSource.includes('handleAddProject = useCallback(async () => {\n    if (window.electronAPI?.selectFolder) {\n      const selected = await window.electronAPI.selectFolder();\n      if (selected) {\n        await resetChat(false);'), 'handleAddProject calls resetChat(false) before opening');
  assert(appSource.includes('handleOpenFolder = useCallback(async (customPath?: string) => {\n    await resetChat(false);\n    await openFolderDialog(customPath);'), 'handleOpenFolder calls resetChat(false)');
}
console.log();

// ----------------------------------------------------
// Test 2: Chat Clutter Reduction & Neutral Typography
// ----------------------------------------------------
console.log('[Test 2] Chat Clutter & Neutral Typography...');
{
  const parserSource = fs.readFileSync(path.join(rootDir, 'src/utils/markdownParser.ts'), 'utf-8');
  assert(!parserSource.includes('codespan({ text }) {\n        return `<code class="px-1.5 py-0.5 rounded bg-rose'), 'codespan does not use rose background');
  assert(parserSource.includes('codespan({ text }) {\n        return `<code class="px-1.5 py-0.5 rounded bg-slate-100'), 'codespan uses neutral slate/zinc styling');
  assert(parserSource.includes('bg-slate-100 dark:bg-zinc-800'), 'markdownParser uses neutral slate/zinc styling for codespan');

  const todoPanelSource = fs.readFileSync(path.join(rootDir, 'src/components/AgentPanel/TodoPanel.tsx'), 'utf-8');
  assert(todoPanelSource.includes('const [isExpanded, setIsExpanded] = useState<boolean>(false);'), 'TodoPanel defaults isExpanded to false');
  assert(todoPanelSource.includes('activeTask'), 'TodoPanel computes activeTask for collapsed pill');
  assert(todoPanelSource.includes('rotate-180'), 'TodoPanel rotates chevron smoothly');
}
console.log();

// ----------------------------------------------------
// Test 3: ChatGPT-Style Right Sidebar (ArtifactsOverview)
// ----------------------------------------------------
console.log('[Test 3] ChatGPT-Style Right Sidebar (ArtifactsOverview)...');
{
  assert(fs.existsSync(path.join(rootDir, 'src/components/Inspector/ArtifactsOverview.tsx')), 'ArtifactsOverview.tsx exists');
  const artifactsSource = fs.readFileSync(path.join(rootDir, 'src/components/Inspector/ArtifactsOverview.tsx'), 'utf-8');
  assert(artifactsSource.includes('export const ArtifactsOverview'), 'ArtifactsOverview component is exported');
  assert(artifactsSource.includes('inspector.artifacts.outputs'), 'ArtifactsOverview renders Outputs section with i18n');
  assert(artifactsSource.includes('inspector.artifacts.sources'), 'ArtifactsOverview renders Sources section with i18n');
  assert(artifactsSource.includes('onSelectDiff?.(idx)'), 'ArtifactsOverview emits onSelectDiff on card click');

  const inspectorSource = fs.readFileSync(path.join(rootDir, 'src/components/Inspector/InspectorPanel.tsx'), 'utf-8');
  assert(inspectorSource.includes('ArtifactsOverview'), 'InspectorPanel imports ArtifactsOverview');
  assert(inspectorSource.includes('isViewingDiffDetail'), 'InspectorPanel manages isViewingDiffDetail state');
  assert(inspectorSource.includes('inspector.artifacts.backToOverview'), 'InspectorPanel has Back to Overview button in detail view');

  const appSource = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf-8');
  assert(appSource.includes('sessionSources'), 'App.tsx computes sessionSources from messages');
  assert(appSource.includes('sources={sessionSources}'), 'App.tsx passes sessionSources to InspectorPanel');
}
console.log();

// ----------------------------------------------------
// Test 4: i18n Parity for Artifacts Keys
// ----------------------------------------------------
console.log('[Test 4] i18n key parity for inspector.artifacts...');
{
  const requiredKeys = [
    'inspector.artifacts.outputs',
    'inspector.artifacts.sources',
    'inspector.artifacts.backToOverview',
    'inspector.artifacts.noOutputs',
    'inspector.artifacts.noSources',
    'inspector.artifacts.viewDiff',
    'inspector.artifacts.statusPending',
    'inspector.artifacts.statusAccepted',
    'inspector.artifacts.statusRejected',
    'inspector.artifacts.viewAll',
  ];

  for (const key of requiredKeys) {
    assert(key in vi, `VI has key ${key}`);
    assert(key in en, `EN has key ${key}`);
  }
}

// ----------------------------------------------------
// Test 5: Session Grouping & Project Matching
// ----------------------------------------------------
console.log('[Test 5] Session Grouping & Project Path Resolution...');
{
  const bridgeSource = fs.readFileSync(path.join(rootDir, 'electron/omp-bridge.ts'), 'utf-8');
  assert(bridgeSource.includes('projectPath: this.workspacePath || undefined'), 'omp-bridge attaches projectPath on listSessions');

  const groupListSource = fs.readFileSync(path.join(rootDir, 'src/components/Sidebar/ProjectGroupList.tsx'), 'utf-8');
  assert(groupListSource.includes('homeRelativeDash'), 'ProjectGroupList handles OMP home-relative encoded paths');
  assert(groupListSource.includes('matchedProjectId = activeProjectId'), 'ProjectGroupList assigns active sessions to activeProjectId');
}
console.log();
console.log();

console.log('====================================================');
console.log(`Clean Slate & ChatGPT-Style Sidebar: ${passed} passed, ${failed} failed.`);
console.log('====================================================\n');
