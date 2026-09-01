const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const preloadPath = path.resolve(__dirname, '../dist-electron/preload.cjs');
const preloadArtifacts = readdirSync(path.dirname(preloadPath))
  .filter((fileName) => fileName.startsWith('preload.'))
  .sort();

assert.deepEqual(
  preloadArtifacts,
  ['preload.cjs'],
  'Electron build must emit exactly one preload artifact.',
);

const syntaxCheck = spawnSync(process.execPath, ['--check', preloadPath], {
  encoding: 'utf8',
});

assert.equal(
  syntaxCheck.status,
  0,
  `Electron preload must parse as CommonJS.\n${syntaxCheck.stderr}`,
);

const preloadSource = readFileSync(preloadPath, 'utf8');
assert.doesNotMatch(
  preloadSource,
  /^\s*(?:import\s|export\s)/m,
  'Electron preload must not contain top-level ESM syntax.',
);

console.log('Electron preload is valid CommonJS.');
