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
  assert(useOmpRpcSource.includes('setContextUsage(null);'), 'resetChat clears contextUsage');
  assert(useOmpRpcSource.includes('setTokensPerSecond(null);'), 'resetChat clears tokensPerSecond');

  const appSource = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf-8');
  assert(appSource.includes('handleProcessStarted = useCallback(async () => {\n    await resetChat(false);'), 'handleProcessStarted calls resetChat(false)');
  assert(appSource.includes('handleAddProject = useCallback(async () => {\n    if (window.electronAPI?.selectFolder) {\n      const selected = await window.electronAPI.selectFolder();\n      if (selected) {\n        await resetChat(false);'), 'handleAddProject calls resetChat(false) before opening');
  assert(appSource.includes('handleOpenFolder = useCallback(async (customPath?: string) => {\n    await resetChat(false);\n    await openFolderDialog(customPath);'), 'handleOpenFolder calls resetChat(false)');
  assert(appSource.includes('todoPhases={hasWorkspace ? todoPhases : []}'), 'App.tsx suppresses todoPhases when hasWorkspace is false');
  assert(appSource.includes('todos={hasWorkspace ? todos : []}'), 'App.tsx suppresses todos when hasWorkspace is false');
  assert(appSource.includes('contextUsage={hasWorkspace ? contextUsage : null}'), 'App.tsx suppresses contextUsage when hasWorkspace is false');

  assert(appSource.includes('const [browserUrl, setBrowserUrl] = useState<string | null>(null);'), 'App.tsx initializes browserUrl to null');
  assert(appSource.includes('setBrowserUrl(null);'), 'App.tsx resets browserUrl to null on clean slate session switch');
  assert(appSource.includes("setInspectorTab('changes');"), 'App.tsx resets inspectorTab to changes on clean slate session switch');
  const agentPanelSource = fs.readFileSync(path.join(rootDir, 'src/components/AgentPanel/AgentPanel.tsx'), 'utf-8');
  assert(agentPanelSource.includes('{Boolean(workspacePath) && <TodoPanel'), 'AgentPanel guards TodoPanel with Boolean(workspacePath)');
  assert(agentPanelSource.includes('{Boolean(workspacePath) && contextUsage?.tokens != null && ('), 'AgentPanel guards contextUsage tokens with Boolean(workspacePath)');

  const composerSource = fs.readFileSync(path.join(rootDir, 'src/components/AgentPanel/PromptComposer.tsx'), 'utf-8');
  assert(composerSource.includes('Boolean(workspacePath) &&\n    contextUsage?.percent != null'), 'PromptComposer guards hasContextUsage with Boolean(workspacePath)');

  const mainSource = fs.readFileSync(path.join(rootDir, 'electron/main.ts'), 'utf-8');
  assert(mainSource.includes('mainWindow.webContents.on(\'did-finish-load\''), 'electron/main.ts listens to did-finish-load on mainWindow');
  assert(mainSource.includes('runtimeManager.setActiveRuntime(null)'), 'electron/main.ts resets active runtime on window reload');
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

  assert(artifactsSource.includes('AttachmentImage'), 'ArtifactsOverview uses AttachmentImage for secure thumbnails');
  assert(artifactsSource.includes('ImageLightboxModal'), 'ArtifactsOverview mounts ImageLightboxModal for zoom view');
  assert(artifactsSource.includes('isImageFile'), 'ArtifactsOverview reuses isImageFile utility');
  const inspectorSource = fs.readFileSync(path.join(rootDir, 'src/components/Inspector/InspectorPanel.tsx'), 'utf-8');
  assert(inspectorSource.includes('ArtifactsOverview'), 'InspectorPanel imports ArtifactsOverview');
  assert(inspectorSource.includes('isViewingDiffDetail'), 'InspectorPanel manages isViewingDiffDetail state');
  assert(inspectorSource.includes('inspector.artifacts.backToOverview'), 'InspectorPanel has Back to Overview button in detail view');

  assert(!inspectorSource.includes("initialBrowserUrl = 'http://localhost:5173'"), 'InspectorPanel does not use static localhost initialBrowserUrl default');
  assert(inspectorSource.includes('setHasVisitedBrowser(false);'), 'InspectorPanel resets hasVisitedBrowser when initialBrowserUrl is absent');
  assert(inspectorSource.includes('workspacePath={workspacePath}'), 'InspectorPanel passes workspacePath to ArtifactsOverview');
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
// ----------------------------------------------------
// Test 6: Browser Clean Slate & Storage Reset
// ----------------------------------------------------
console.log('[Test 6] Browser Clean Slate Storage & Cache Reset...');
{
  assert(fs.existsSync(path.join(rootDir, 'electron/browser-clean-slate.ts')), 'electron/browser-clean-slate.ts exists');
  const cleanSlateSource = fs.readFileSync(path.join(rootDir, 'electron/browser-clean-slate.ts'), 'utf-8');
  assert(cleanSlateSource.includes('export async function cleanBrowserSessionStorage'), 'cleanBrowserSessionStorage is exported');
  assert(cleanSlateSource.includes('export async function resetWebviewToBlank'), 'resetWebviewToBlank is exported');
  assert(cleanSlateSource.includes('clearStorageData()'), 'Clears cookies, storage, and indexedDB');
  assert(cleanSlateSource.includes('clearCache()'), 'Clears HTTP network cache');
  assert(cleanSlateSource.includes('clearAuthCache()'), 'Clears authentication credentials cache');
  assert(cleanSlateSource.includes('clearHostResolverCache()'), 'Clears DNS host resolver cache');

  const mainSource = fs.readFileSync(path.join(rootDir, 'electron/main.ts'), 'utf-8');
  assert(mainSource.includes('cleanBrowserSessionStorage'), 'electron/main.ts imports cleanBrowserSessionStorage');
  assert(mainSource.includes("ipcMain.handle('omp:clean-slate'"), 'electron/main.ts registers omp:clean-slate IPC handler');

  const runtimeManagerSource = fs.readFileSync(path.join(rootDir, 'electron/runtime-manager.ts'), 'utf-8');
  assert(runtimeManagerSource.includes('cleanBrowserSessionStorage'), 'RuntimeManager triggers cleanBrowserSessionStorage on runtime switch');
}
console.log();
console.log();

console.log('====================================================');
console.log(`Clean Slate & ChatGPT-Style Sidebar: ${passed} passed, ${failed} failed.`);
console.log('====================================================\n');
