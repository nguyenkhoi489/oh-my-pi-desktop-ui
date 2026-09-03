import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ExtensionManager, parseJsonOrEmpty } from '../electron/extension-manager.ts';

let passCount = 0;
async function test(name, fn) {
  await fn();
  passCount++;
  console.log(`✓ ${name}`);
}

console.log('=== Running verify-extension-manager-expansion.mjs ===\n');

// 1. Helper tests: parseJsonOrEmpty & ANSI stripping
await test('parseJsonOrEmpty parses JSON and handles empty / non-json gracefully', async () => {
  // Valid JSON
  assert.deepStrictEqual(parseJsonOrEmpty('{"a": 1}', {}), { a: 1 });
  assert.deepStrictEqual(parseJsonOrEmpty('[1, 2, 3]', []), [1, 2, 3]);

  // ANSI escape stripping
  assert.deepStrictEqual(parseJsonOrEmpty('\x1B[32m[{"name":"test"}]\x1B[0m', []), [{ name: 'test' }]);

  // Empty strings & fallbacks
  assert.deepStrictEqual(parseJsonOrEmpty('', []), []);
  assert.deepStrictEqual(parseJsonOrEmpty('   ', { empty: true }), { empty: true });

  // Known CLI empty texts
  assert.deepStrictEqual(parseJsonOrEmpty('No plugins available', []), []);
  assert.deepStrictEqual(parseJsonOrEmpty('No marketplaces configured\n\nAdd one with: omp...', []), []);
  assert.deepStrictEqual(parseJsonOrEmpty('All marketplace plugins are up to date.', []), []);
});

// 2. Validation tests for inputs
await test('ExtensionManager input validation for features, config, and marketplace', async () => {
  const manager = new ExtensionManager();

  // Features
  const fRes1 = await manager.features('omp', '');
  assert(fRes1.success === false, 'Empty pluginName should fail');
  assert(fRes1.error?.includes('không được để trống'));

  const fRes2 = await manager.toggleFeature('omp', '', 'f1', true);
  assert(fRes2.success === false, 'Empty pluginName should fail in toggleFeature');

  const fRes3 = await manager.toggleFeature('omp', 'p1', '', true);
  assert(fRes3.success === false, 'Empty feature should fail in toggleFeature');

  // Config
  const cRes1 = await manager.setPluginConfig('omp', '', [{ key: 'k', value: 'v' }]);
  assert(cRes1.success === false, 'Empty pluginName should fail in setPluginConfig');

  const cRes2 = await manager.setPluginConfig('omp', 'p1', []);
  assert(cRes2.success === false, 'Empty pairs should fail in setPluginConfig');

  const cRes3 = await manager.getPluginConfig('omp', '');
  assert(cRes3.success === false, 'Empty pluginName should fail in getPluginConfig');

  // Toggle plugin
  const tRes = await manager.togglePlugin('omp', '', true);
  assert(tRes.success === false, 'Empty name should fail in togglePlugin');

  // Marketplace
  const mRes1 = await manager.marketplace('omp', 'add', '');
  assert(mRes1.success === false, 'Empty source should fail in marketplace add');

  const mRes2 = await manager.marketplace('omp', 'remove', '');
  assert(mRes2.success === false, 'Empty source should fail in marketplace remove');
});

// 3. Live doctor test with real omp binary
await test('ExtensionManager live doctor runs and returns structured health items', async () => {
  const manager = new ExtensionManager();
  const res = await manager.doctor('omp');
  assert(res.success === true, 'doctor should succeed');
  assert(Array.isArray(res.items), 'items should be an array');
  assert(res.items.length >= 1, 'doctor should return at least 1 health item');
  assert(typeof res.items[0].name === 'string', 'doctor item should have name');
  assert(typeof res.items[0].status === 'string', 'doctor item should have status');
  assert(typeof res.items[0].message === 'string', 'doctor item should have message');
});

// 4. Discover text parser simulation
await test('ExtensionManager discover text parsing simulation', async () => {
  const manager = new ExtensionManager();
  const res = await manager.discover('omp');
  assert(res.success === true, 'discover should succeed');
  assert(Array.isArray(res.plugins), 'plugins should be an array');
});

// 5. Marketplace list simulation
await test('ExtensionManager marketplace list returns array', async () => {
  const manager = new ExtensionManager();
  const res = await manager.marketplace('omp', 'list');
  assert(res.success === true, 'marketplace list should succeed');
  assert(Array.isArray(res.marketplaces), 'marketplaces should be an array');
});

// 6. Preload & Main IPC contract coverage
await test('IPC handlers for all plugin expansion actions are properly declared and wired', async () => {
  const preloadSource = fs.readFileSync(path.resolve('electron/preload.ts'), 'utf-8');
  const mainSource = fs.readFileSync(path.resolve('electron/main.ts'), 'utf-8');

  const requiredChannels = [
    'omp:plugin-list',
    'omp:plugin-install',
    'omp:plugin-uninstall',
    'omp:plugin-link',
    'omp:plugin-doctor',
    'omp:plugin-features',
    'omp:plugin-feature-toggle',
    'omp:plugin-config-set',
    'omp:plugin-config-get',
    'omp:plugin-toggle',
    'omp:plugin-upgrade',
    'omp:plugin-discover',
    'omp:plugin-marketplace',
  ];

  for (const ch of requiredChannels) {
    assert(preloadSource.includes(ch), `preload.ts must reference ${ch}`);
    assert(mainSource.includes(ch), `main.ts must handle ${ch}`);
  }
});

// 7. Types & UI Component existence
await test('Types and UI component ExtensionsTab exist and are integrated in OpsModal', async () => {
  const electronTypes = fs.readFileSync(path.resolve('electron/types.ts'), 'utf-8');
  const srcTypes = fs.readFileSync(path.resolve('src/types/index.ts'), 'utf-8');
  const opsModalSource = fs.readFileSync(path.resolve('src/components/Modals/OpsModal.tsx'), 'utf-8');
  const extensionsTabPath = path.resolve('src/components/Modals/ops/ExtensionsTab.tsx');

  assert(fs.existsSync(extensionsTabPath), 'ExtensionsTab.tsx component must exist');

  assert(electronTypes.includes('OmpPluginDoctorItem'), 'electron/types.ts must declare OmpPluginDoctorItem');
  assert(electronTypes.includes('OmpPluginFeatureItem'), 'electron/types.ts must declare OmpPluginFeatureItem');
  assert(electronTypes.includes('OmpMarketplaceItem'), 'electron/types.ts must declare OmpMarketplaceItem');
  assert(electronTypes.includes('OmpDiscoverPluginItem'), 'electron/types.ts must declare OmpDiscoverPluginItem');

  assert(srcTypes.includes('OmpPluginDoctorItem'), 'src/types/index.ts must declare OmpPluginDoctorItem');
  assert(srcTypes.includes('OmpPluginFeatureItem'), 'src/types/index.ts must declare OmpPluginFeatureItem');
  assert(srcTypes.includes('OmpMarketplaceItem'), 'src/types/index.ts must declare OmpMarketplaceItem');
  assert(srcTypes.includes('OmpDiscoverPluginItem'), 'src/types/index.ts must declare OmpDiscoverPluginItem');

  assert(opsModalSource.includes('ExtensionsTab'), 'OpsModal.tsx must import and use ExtensionsTab');

  const extensionsTabContent = fs.readFileSync(extensionsTabPath, 'utf-8');
  assert(extensionsTabContent.includes('w-full min-w-0'), 'ExtensionsTab inputs must use min-w-0 to prevent flex/grid overflow');
  assert(extensionsTabContent.includes('truncate'), 'ExtensionsTab card headers must use truncate to prevent icon squeeze');
});

console.log(`\nAll ${passCount} tests passed successfully!`);
