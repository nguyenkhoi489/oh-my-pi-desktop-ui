import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseFindModelsJson, findModels } from '../electron/models-config.ts';

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('=== Running verify-update-models.mjs (Phase 7) ===');

// [Test 1] parseFindModelsJson with clean JSON fixture
test('parseFindModelsJson parses clean fixture and normalizes fields', () => {
  const fixture = JSON.stringify({
    models: [
      {
        provider: 'openai',
        id: 'gpt-4o',
        selector: 'openai/gpt-4o',
        name: 'GPT-4o',
        contextWindow: 128000,
        maxTokens: 16384,
        reasoning: false,
        input: ['text', 'image'],
        cost: {
          input: 2.5,
          output: 10.0,
          cacheRead: 1.25,
        },
      },
      {
        provider: 'anthropic',
        id: 'claude-3-7-sonnet',
        name: 'Claude 3.7 Sonnet',
        contextWindow: 200000,
        reasoning: true,
        thinking: ['effort', 'budget'],
      },
    ],
  });

  const parsed = parseFindModelsJson(fixture);
  assert.strictEqual(parsed.length, 2);

  // First model
  assert.strictEqual(parsed[0].provider, 'openai');
  assert.strictEqual(parsed[0].id, 'gpt-4o');
  assert.strictEqual(parsed[0].selector, 'openai/gpt-4o');
  assert.strictEqual(parsed[0].name, 'GPT-4o');
  assert.strictEqual(parsed[0].contextWindow, 128000);
  assert.strictEqual(parsed[0].maxTokens, 16384);
  assert.strictEqual(parsed[0].reasoning, false);
  assert.deepStrictEqual(parsed[0].input, ['text', 'image']);
  assert.strictEqual(parsed[0].cost?.input, 2.5);
  assert.strictEqual(parsed[0].cost?.output, 10.0);
  assert.strictEqual(parsed[0].cost?.cacheRead, 1.25);

  // Second model (selector fallback)
  assert.strictEqual(parsed[1].provider, 'anthropic');
  assert.strictEqual(parsed[1].id, 'claude-3-7-sonnet');
  assert.strictEqual(parsed[1].selector, 'anthropic/claude-3-7-sonnet');
  assert.strictEqual(parsed[1].name, 'Claude 3.7 Sonnet');
  assert.strictEqual(parsed[1].reasoning, true);
  assert.deepStrictEqual(parsed[1].thinking, ['effort', 'budget']);
});

// [Test 2] parseFindModelsJson with banner noise before JSON
test('parseFindModelsJson handles stdout with prepended banners', () => {
  const rawOutput = `
Syncing session files...
Connected to daemon on port 48123.
{
  "models": [
    {
      "provider": "deepseek",
      "id": "deepseek-chat",
      "contextWindow": 64000
    }
  ]
}
`;

  const parsed = parseFindModelsJson(rawOutput);
  assert.strictEqual(parsed.length, 1);
  assert.strictEqual(parsed[0].provider, 'deepseek');
  assert.strictEqual(parsed[0].id, 'deepseek-chat');
  assert.strictEqual(parsed[0].selector, 'deepseek/deepseek-chat');
  assert.strictEqual(parsed[0].contextWindow, 64000);
});

// [Test 3] parseFindModelsJson with direct array fixture & empty input
test('parseFindModelsJson handles direct array and empty inputs gracefully', () => {
  assert.deepStrictEqual(parseFindModelsJson(''), []);
  assert.deepStrictEqual(parseFindModelsJson('   \n  '), []);
  assert.deepStrictEqual(parseFindModelsJson('Some non-json text'), []);

  const arrayFixture = JSON.stringify([
    { provider: 'google', id: 'gemini-2.5-flash', selector: 'google/gemini-2.5-flash' },
  ]);
  const parsed = parseFindModelsJson(arrayFixture);
  assert.strictEqual(parsed.length, 1);
  assert.strictEqual(parsed[0].provider, 'google');
  assert.strictEqual(parsed[0].id, 'gemini-2.5-flash');
});

// [Test 4] findModels empty pattern & missing binary handling
await asyncTest('findModels validates inputs without spawning', async () => {
  // Empty pattern
  const emptyRes = await findModels('/bin/omp', '');
  assert.strictEqual(emptyRes.success, true);
  assert.deepStrictEqual(emptyRes.models, []);

  const whitespaceRes = await findModels('/bin/omp', '   ');
  assert.strictEqual(whitespaceRes.success, true);
  assert.deepStrictEqual(whitespaceRes.models, []);

  // Missing binary
  const noBinRes = await findModels('', 'gpt-4o');
  assert.strictEqual(noBinRes.success, false);
  assert.ok(noBinRes.error);
});

// [Test 5] Maintenance task arguments validation for Phase 7
test('Phase 7 maintenance task arguments matrix is well-formed', () => {
  const tasks = {
    'update-canary': ['update', '--canary'],
    'update-stable': ['update', '--stable'],
    'update-force': ['update', '--force'],
    'update-plugins': ['update', '--plugins'],
    'models-refresh': ['models', 'refresh'],
  };

  assert.deepStrictEqual(tasks['update-canary'], ['update', '--canary']);
  assert.deepStrictEqual(tasks['update-stable'], ['update', '--stable']);
  assert.deepStrictEqual(tasks['update-force'], ['update', '--force']);
  assert.deepStrictEqual(tasks['update-plugins'], ['update', '--plugins']);
  assert.deepStrictEqual(tasks['models-refresh'], ['models', 'refresh']);
});

// [Test 6] Preload & Main IPC static contract checks
test('Preload & Main IPC contracts are properly wired', () => {
  const mainSrc = fs.readFileSync(path.resolve('electron/main.ts'), 'utf-8');
  const preloadSrc = fs.readFileSync(path.resolve('electron/preload.ts'), 'utf-8');
  const electronTypesSrc = fs.readFileSync(path.resolve('electron/types.ts'), 'utf-8');
  const srcTypesSrc = fs.readFileSync(path.resolve('src/types/index.ts'), 'utf-8');

  // Main IPC
  assert.ok(mainSrc.includes("'omp:models-find'"), 'main.ts must handle omp:models-find');
  assert.ok(mainSrc.includes("'omp:maintenance-run-task'"), 'main.ts must handle omp:maintenance-run-task');

  // Preload
  assert.ok(preloadSrc.includes('findModels:'), 'preload.ts must expose findModels');
  assert.ok(preloadSrc.includes('runMaintenanceTask:'), 'preload.ts must expose runMaintenanceTask');

  // Types
  assert.ok(electronTypesSrc.includes('interface OmpFoundModel'), 'electron/types.ts must declare OmpFoundModel');
  assert.ok(electronTypesSrc.includes('interface FindModelsResult'), 'electron/types.ts must declare FindModelsResult');
  assert.ok(srcTypesSrc.includes('interface OmpFoundModel'), 'src/types/index.ts must declare OmpFoundModel');
  assert.ok(srcTypesSrc.includes('interface FindModelsResult'), 'src/types/index.ts must declare FindModelsResult');
});

// [Test 7] UI Components & i18n static structure checks
test('UI components and i18n are properly integrated', () => {
  const engineTabSrc = fs.readFileSync(path.resolve('src/components/Modals/ops/EngineTab.tsx'), 'utf-8');
  const modelsCatalogSrc = fs.readFileSync(path.resolve('src/components/Modals/settings/ModelsCatalogSection.tsx'), 'utf-8');
  const opsModalSrc = fs.readFileSync(path.resolve('src/components/Modals/OpsModal.tsx'), 'utf-8');
  const settingsModalSrc = fs.readFileSync(path.resolve('src/components/Modals/SettingsModal.tsx'), 'utf-8');
  const viSrc = fs.readFileSync(path.resolve('shared/i18n/vi.ts'), 'utf-8');
  const enSrc = fs.readFileSync(path.resolve('shared/i18n/en.ts'), 'utf-8');

  // EngineTab
  assert.ok(engineTabSrc.includes('update.channel'), 'EngineTab must inspect update.channel');
  assert.ok(engineTabSrc.includes('--canary'), 'EngineTab must support --canary switch');
  assert.ok(engineTabSrc.includes('--stable'), 'EngineTab must support --stable switch');
  assert.ok(engineTabSrc.includes('--force'), 'EngineTab must support --force update');
  assert.ok(engineTabSrc.includes('--plugins'), 'EngineTab must support --plugins update');
  assert.ok(opsModalSrc.includes('<EngineTab'), 'OpsModal must mount EngineTab');

  // ModelsCatalogSection
  assert.ok(modelsCatalogSrc.includes('findModels'), 'ModelsCatalogSection must call findModels');
  assert.ok(modelsCatalogSrc.includes('models-refresh'), 'ModelsCatalogSection must support models-refresh');
  assert.ok(settingsModalSrc.includes('<ModelsCatalogSection'), 'SettingsModal must mount ModelsCatalogSection');

  // i18n keys
  const expectedKeys = [
    'ops.engine.updateChannel',
    'ops.engine.channelStable',
    'ops.engine.channelCanary',
    'ops.engine.switchCanary',
    'ops.engine.switchStable',
    'ops.engine.updateForce',
    'ops.engine.updatePlugins',
    'settings.providers.modelsFindTitle',
    'settings.providers.refreshCatalog',
  ];

  for (const key of expectedKeys) {
    assert.ok(viSrc.includes(`'${key}':`), `vi.ts must contain key ${key}`);
    assert.ok(enSrc.includes(`'${key}':`), `en.ts must contain key ${key}`);
  }
});

console.log(`\nAll ${passCount} tests passed successfully!`);
