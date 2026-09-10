/**
 * Verification Suite: Chat Tool Calls & Subagents Grouping (Sources & Outputs)
 *
 * Verifies:
 * 1. Component existence & structure: ChatTurnContextCard is exported and memoized.
 * 2. Sources & Outputs tabs: Renders Sources with tools/subagents and Outputs with diffFiles.
 * 3. ChatHistory integration: Renders ChatTurnContextCard for both completed msg.toolCalls and streaming activeToolCalls.
 * 4. Data pipeline: AgentPanel and App.tsx pass diffFiles, subagents, and onSelectDiff down to ChatHistory.
 * 5. i18n parity: All chat.context.* keys are defined in both vi.ts and en.ts.
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

console.log('=== Starting Chat Context Card & Grouping Verification Suite ===\n');

// ----------------------------------------------------
// Test 1: Component Existence & Memoization
// ----------------------------------------------------
console.log('[Test 1] ChatTurnContextCard component existence & exports...');
{
  const cardPath = path.join(rootDir, 'src/components/AgentPanel/ChatTurnContextCard.tsx');
  assert(fs.existsSync(cardPath), 'ChatTurnContextCard.tsx exists');

  const cardSource = fs.readFileSync(cardPath, 'utf-8');
  assert(cardSource.includes('export const ChatTurnContextCard'), 'ChatTurnContextCard is exported');
  assert(cardSource.includes('memo(function ChatTurnContextCard'), 'ChatTurnContextCard is wrapped in React.memo');
  assert(cardSource.includes('toolCalls'), 'ChatTurnContextCard accepts toolCalls prop');
  assert(cardSource.includes('diffFiles'), 'ChatTurnContextCard accepts diffFiles prop');
  assert(cardSource.includes('subagents'), 'ChatTurnContextCard accepts subagents prop');
}
console.log();

// ----------------------------------------------------
// Test 2: Sources & Outputs Tab Switching & Live State
// ----------------------------------------------------
console.log('[Test 2] Sources and Outputs tab features...');
{
  const cardSource = fs.readFileSync(path.join(rootDir, 'src/components/AgentPanel/ChatTurnContextCard.tsx'), 'utf-8');
  assert(cardSource.includes("const [activeTab, setActiveTab] = useState<'sources' | 'outputs'>('sources');"), 'Manages activeTab between sources and outputs');
  assert(cardSource.includes("chat.context.sources"), 'Uses i18n for sources tab title');
  assert(cardSource.includes("chat.context.outputs"), 'Uses i18n for outputs tab title');
  assert(cardSource.includes("chat.context.toolsRunning"), 'Displays live running indicator when isActive');
  assert(cardSource.includes("chat.context.toolsExecuted"), 'Displays executed count when completed');
  assert(cardSource.includes("onSelectDiff"), 'Supports diff inspection callback on output items');
}
console.log();

// ----------------------------------------------------
// Test 3: ChatHistory & AgentPanel Integration
// ----------------------------------------------------
console.log('[Test 3] ChatHistory & AgentPanel routing...');
{
  const historySource = fs.readFileSync(path.join(rootDir, 'src/components/AgentPanel/ChatHistory.tsx'), 'utf-8');
  assert(historySource.includes("import { ChatTurnContextCard } from './ChatTurnContextCard';"), 'ChatHistory imports ChatTurnContextCard');
  assert(historySource.includes("<ChatTurnContextCard\n                toolCalls={msg.toolCalls}"), 'ChatHistory routes msg.toolCalls to ChatTurnContextCard');
  assert(historySource.includes("<ChatTurnContextCard\n          toolCalls={activeToolCalls}\n          isActive={true}"), 'ChatHistory routes activeToolCalls to ChatTurnContextCard with isActive={true}');

  const agentPanelSource = fs.readFileSync(path.join(rootDir, 'src/components/AgentPanel/AgentPanel.tsx'), 'utf-8');
  assert(agentPanelSource.includes('diffFiles={diffFiles}'), 'AgentPanel passes diffFiles to ChatHistory');
  assert(agentPanelSource.includes('subagents={subagents}'), 'AgentPanel passes subagents to ChatHistory');
  assert(agentPanelSource.includes('onSelectDiff={onSelectDiff}'), 'AgentPanel passes onSelectDiff to ChatHistory');

  const appSource = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf-8');
  assert(appSource.includes('diffFiles={activeDiff ? [activeDiff] : []}'), 'App.tsx forwards activeDiff to AgentPanel');
  assert(appSource.includes('subagents={subagents}'), 'App.tsx forwards subagents to AgentPanel');
}
console.log();

// ----------------------------------------------------
// Test 4: i18n Key Parity
// ----------------------------------------------------
console.log('[Test 4] i18n parity for chat.context.* keys...');
{
  const requiredKeys = [
    'chat.context.toolsExecuted',
    'chat.context.toolsRunning',
    'chat.context.sources',
    'chat.context.outputs',
    'chat.context.viewDetails',
    'chat.context.noOutputs',
    'chat.context.noSources',
    'chat.context.completed',
    'chat.context.running',
    'chat.context.subagents',
  ];

  for (const key of requiredKeys) {
    assert(key in vi, `Key "${key}" exists in vi.ts`);
    assert(key in en, `Key "${key}" exists in en.ts`);
    assert(vi[key] !== '', `Key "${key}" in vi.ts is not empty`);
    assert(en[key] !== '', `Key "${key}" in en.ts is not empty`);
  }
}

console.log(`\n====================================================`);
console.log(`Chat Context Card Verification: ${passed} passed, ${failed} failed.`);
console.log(`====================================================\n`);
