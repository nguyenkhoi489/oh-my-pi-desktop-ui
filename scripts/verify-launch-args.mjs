/**
 * Verification Suite: Launch Options & Argv Builder (Phase 4)
 *
 * Verifies:
 * 1. buildLaunchArgs unit tests: empty, each flag, list repetition, whitespace preservation, precedence
 * 2. sanitizeLaunchOptions: type safety, invalid shape recovery, clean trimming
 * 3. expandHomeDir: home directory expansion, relative / absolute paths
 * 4. SettingsStore persistence: launchOptions stored, loaded, updated
 * 5. OmpBridge integration: launchOptions inserted before extraArgs in spawn command
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  buildLaunchArgs,
  sanitizeLaunchOptions,
  expandHomeDir,
} from '../electron/launch-args.ts';
import { SettingsStore } from '../electron/settings-store.ts';
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

console.log('=== Starting Launch Options Verification Suite (Phase 4) ===\n');

// ----------------------------------------------------
// Test 1: expandHomeDir
// ----------------------------------------------------
console.log('[Test 1] expandHomeDir unit tests');
{
  const homedir = os.homedir();
  assert(expandHomeDir('~') === homedir, 'expandHomeDir("~") returns user home directory');
  assert(expandHomeDir('~/my-folder') === path.join(homedir, 'my-folder'), 'expandHomeDir("~/my-folder") expands path');
  assert(expandHomeDir('  ~/dir  ') === path.join(homedir, 'dir'), 'expandHomeDir trims input before expanding');
  assert(expandHomeDir('/tmp/test') === '/tmp/test', 'expandHomeDir keeps absolute paths intact');
  assert(expandHomeDir('') === '', 'expandHomeDir handles empty string');
}

// ----------------------------------------------------
// Test 2: sanitizeLaunchOptions
// ----------------------------------------------------
console.log('\n[Test 2] sanitizeLaunchOptions unit tests');
{
  // Null / undefined / primitive handling
  const cleanNull = sanitizeLaunchOptions(null);
  assert(Array.isArray(cleanNull.addDirs) && cleanNull.addDirs.length === 0, 'Null returns default clean object');

  const cleanMalformed = sanitizeLaunchOptions({
    addDirs: ['/valid', '', 123, '  /trimmed  '],
    noTools: 'not-a-bool',
    noLsp: true,
    tools: ['t1', null, '  t2  '],
    systemPrompt: '  Custom Prompt  ',
    maxTime: '   ',
  });

  assert(cleanMalformed.addDirs?.length === 2, 'Filtered non-strings and empty strings from addDirs');
  assert(cleanMalformed.addDirs?.[1] === '/trimmed', 'Trimmed strings in addDirs');
  assert(cleanMalformed.noTools === undefined, 'Ignored non-boolean noTools');
  assert(cleanMalformed.noLsp === true, 'Preserved boolean noLsp');
  assert(cleanMalformed.tools?.length === 2 && cleanMalformed.tools[1] === 't2', 'Cleaned tools array');
  assert(cleanMalformed.systemPrompt === 'Custom Prompt', 'Trimmed systemPrompt');
  assert(cleanMalformed.maxTime === undefined, 'Empty whitespace maxTime converted to undefined');
}

// ----------------------------------------------------
// Test 3: buildLaunchArgs test matrix
// ----------------------------------------------------
console.log('\n[Test 3] buildLaunchArgs matrix verification');
{
  // 3.1 Empty / null -> []
  assert(buildLaunchArgs(null).length === 0, 'null options -> empty args');
  assert(buildLaunchArgs({}).length === 0, 'empty options -> empty args');

  // 3.2 addDirs (multiple, expanded)
  const homedir = os.homedir();
  const addDirsArgs = buildLaunchArgs({
    addDirs: ['/opt/extra', '~/workspace/tools'],
  });
  assert(
    addDirsArgs.length === 4 &&
      addDirsArgs[0] === '--add-dir' &&
      addDirsArgs[1] === '/opt/extra' &&
      addDirsArgs[2] === '--add-dir' &&
      addDirsArgs[3] === path.join(homedir, 'workspace/tools'),
    'addDirs produces repeated --add-dir with expanded paths'
  );

  // 3.3 tools vs noTools
  const toolsArgs = buildLaunchArgs({ tools: ['git', 'shell'] });
  assert(
    toolsArgs.length === 4 &&
      toolsArgs[0] === '--tools' &&
      toolsArgs[1] === 'git' &&
      toolsArgs[2] === '--tools' &&
      toolsArgs[3] === 'shell',
    'tools produces repeated --tools flags'
  );

  const noToolsArgs = buildLaunchArgs({ noTools: true, tools: ['git'] });
  assert(
    noToolsArgs.length === 1 && noToolsArgs[0] === '--no-tools',
    'noTools=true overrides tools array and emits --no-tools'
  );

  // 3.4 noLsp, noPty, noRules, advisor, hideThinking, noTitle
  const flagsArgs = buildLaunchArgs({
    noLsp: true,
    noPty: true,
    noRules: true,
    advisor: true,
    hideThinking: true,
    noTitle: true,
  });
  assert(
    flagsArgs.includes('--no-lsp') &&
      flagsArgs.includes('--no-pty') &&
      flagsArgs.includes('--no-rules') &&
      flagsArgs.includes('--advisor') &&
      flagsArgs.includes('--hide-thinking') &&
      flagsArgs.includes('--no-title'),
    'Simple boolean flags are correctly emitted'
  );

  // 3.5 skills vs noSkills
  const skillsArgs = buildLaunchArgs({ skills: ['cook', 'test'] });
  assert(
    skillsArgs.length === 4 &&
      skillsArgs[0] === '--skills' &&
      skillsArgs[1] === 'cook' &&
      skillsArgs[2] === '--skills' &&
      skillsArgs[3] === 'test',
    'skills produces repeated --skills flags'
  );

  const noSkillsArgs = buildLaunchArgs({ noSkills: true, skills: ['cook'] });
  assert(
    noSkillsArgs.length === 1 && noSkillsArgs[0] === '--no-skills',
    'noSkills=true overrides skills array'
  );

  // 3.6 extensions & hooks vs noExtensions
  const extArgs = buildLaunchArgs({
    extensions: ['~/ext.js', '/opt/ext2.js'],
    hooks: ['~/hook.sh'],
  });
  assert(
    extArgs.includes('-e') &&
      extArgs.includes(path.join(homedir, 'ext.js')) &&
      extArgs.includes('/opt/ext2.js') &&
      extArgs.includes('--hook') &&
      extArgs.includes(path.join(homedir, 'hook.sh')),
    'extensions emit -e and hooks emit --hook with expanded paths'
  );

  const noExtArgs = buildLaunchArgs({
    noExtensions: true,
    extensions: ['/ext.js'],
    hooks: ['/hook.sh'],
  });
  assert(
    noExtArgs.length === 1 && noExtArgs[0] === '--no-extensions',
    'noExtensions=true overrides extensions and hooks'
  );

  // 3.7 prewalk vs prewalkInto
  const prewalkArgs = buildLaunchArgs({ prewalk: true });
  assert(prewalkArgs.length === 1 && prewalkArgs[0] === '--prewalk', 'prewalk emits --prewalk');

  const prewalkIntoArgs = buildLaunchArgs({ prewalk: true, prewalkInto: '~/custom/prewalk' });
  assert(
    prewalkIntoArgs.length === 2 &&
      prewalkIntoArgs[0] === '--prewalk-into' &&
      prewalkIntoArgs[1] === path.join(homedir, 'custom/prewalk'),
    'prewalkInto takes precedence over prewalk and emits --prewalk-into <path>'
  );

  // 3.8 planYolo vs planYoloInto
  const planYoloArgs = buildLaunchArgs({ planYolo: true });
  assert(planYoloArgs.length === 1 && planYoloArgs[0] === '--plan-yolo', 'planYolo emits --plan-yolo');

  const planYoloIntoArgs = buildLaunchArgs({ planYolo: true, planYoloInto: '~/custom/plan' });
  assert(
    planYoloIntoArgs.length === 2 &&
      planYoloIntoArgs[0] === '--plan-yolo-into' &&
      planYoloIntoArgs[1] === path.join(homedir, 'custom/plan'),
    'planYoloInto takes precedence over planYolo'
  );

  // 3.9 maxTime & serviceTier
  const miscArgs = buildLaunchArgs({
    maxTime: '45m',
    serviceTier: 'scale',
  });
  assert(
    miscArgs.includes('--max-time') &&
      miscArgs[miscArgs.indexOf('--max-time') + 1] === '45m' &&
      miscArgs.includes('--service-tier') &&
      miscArgs[miscArgs.indexOf('--service-tier') + 1] === 'scale',
    'maxTime and serviceTier are correctly emitted'
  );

  // 3.10 systemPrompt & appendSystemPrompt (whitespace values kept as single argv)
  const promptArgs = buildLaunchArgs({
    systemPrompt: 'You are a senior engineer specializing in TypeScript.',
    appendSystemPrompt: 'Always format code cleanly.',
  });
  assert(
    promptArgs.includes('--system-prompt') &&
      promptArgs[promptArgs.indexOf('--system-prompt') + 1] ===
        'You are a senior engineer specializing in TypeScript.',
    'systemPrompt value with spaces is preserved as exactly 1 argv element'
  );
  assert(
    promptArgs.includes('--append-system-prompt') &&
      promptArgs[promptArgs.indexOf('--append-system-prompt') + 1] ===
        'Always format code cleanly.',
    'appendSystemPrompt value with spaces is preserved as exactly 1 argv element'
  );

  // 3.11 configOverlays & models (multiple)
  const configModelArgs = buildLaunchArgs({
    configOverlays: ['~/overlay1.yml', '/etc/omp/overlay2.yml'],
    models: ['claude-3-5-sonnet', 'gemini-2.0-flash'],
  });
  assert(
    configModelArgs.includes('--config') &&
      configModelArgs.includes(path.join(homedir, 'overlay1.yml')) &&
      configModelArgs.includes('/etc/omp/overlay2.yml') &&
      configModelArgs.includes('--models') &&
      configModelArgs.includes('claude-3-5-sonnet') &&
      configModelArgs.includes('gemini-2.0-flash'),
    'configOverlays and models emit repeated flags with expanded values'
  );
}

// ----------------------------------------------------
// Test 4: SettingsStore persistence with launchOptions
// ----------------------------------------------------
console.log('\n[Test 4] SettingsStore persistence for launchOptions');
{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-launch-settings-'));
  const testSettingsFile = path.join(tempDir, 'settings.json');

  try {
    const store = new SettingsStore(testSettingsFile);
    assert(store.get().launchOptions === undefined, 'Initial launchOptions is undefined');

    // Save launch options
    store.set({
      launchOptions: {
        addDirs: ['/extra/dir1'],
        noLsp: true,
        advisor: true,
        systemPrompt: 'Be concise',
      },
    });

    const saved = store.get();
    assert(saved.launchOptions !== undefined, 'launchOptions is saved in store');
    assert(saved.launchOptions?.noLsp === true, 'noLsp is saved');
    assert(saved.launchOptions?.advisor === true, 'advisor is saved');
    assert(saved.launchOptions?.addDirs?.[0] === '/extra/dir1', 'addDirs is saved');
    assert(saved.launchOptions?.systemPrompt === 'Be concise', 'systemPrompt is saved');

    // Reload from disk
    const reloadedStore = new SettingsStore(testSettingsFile);
    const reloaded = reloadedStore.get();
    assert(reloaded.launchOptions?.noLsp === true, 'noLsp survived disk reload');
    assert(reloaded.launchOptions?.systemPrompt === 'Be concise', 'systemPrompt survived disk reload');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// ----------------------------------------------------
// Test 5: OmpBridge spawn args ordering & integration
// ----------------------------------------------------
console.log('\n[Test 5] OmpBridge reads launchOptions and orders args before extraArgs');
{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-launch-bridge-'));
  const testSettingsFile = path.join(tempDir, 'settings.json');

  // Create mock executable script that records its argv
  const argsLogFile = path.join(tempDir, 'spawn-args.log');
  const dummyBin = path.join(tempDir, 'mock-omp-spawn.sh');
  fs.writeFileSync(
    dummyBin,
    `#!/bin/sh\necho "$@" > "${argsLogFile}"\nexit 0\n`,
    'utf-8'
  );
  fs.chmodSync(dummyBin, 0o755);

  try {
    const store = new SettingsStore(testSettingsFile);
    store.set({
      customBinaryPath: dummyBin,
      defaultProvider: 'anthropic',
      defaultModel: 'claude-3-5-sonnet',
      launchOptions: {
        addDirs: ['/workspace/extra'],
        advisor: true,
        noLsp: true,
      },
    });

    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: () => {} },
    };

    const bridge = new OmpBridge(mockWindow, store);
    bridge.setCustomBinaryPath(dummyBin);

    await bridge.startProcess(tempDir, 'claude-3-5-sonnet', {
      provider: 'anthropic',
      extraArgs: ['--custom-extra', 'foo'],
    });

    assert(fs.existsSync(argsLogFile), 'Mock script was spawned and recorded args');
    const recordedArgs = fs.readFileSync(argsLogFile, 'utf-8').trim();

    assert(recordedArgs.includes('--add-dir /workspace/extra'), '--add-dir passed to process');
    assert(recordedArgs.includes('--advisor'), '--advisor passed to process');
    assert(recordedArgs.includes('--no-lsp'), '--no-lsp passed to process');
    assert(recordedArgs.includes('--custom-extra foo'), '--custom-extra passed to process');

    const addDirPos = recordedArgs.indexOf('--add-dir');
    const advisorPos = recordedArgs.indexOf('--advisor');
    const noLspPos = recordedArgs.indexOf('--no-lsp');
    const extraPos = recordedArgs.indexOf('--custom-extra');
    assert(
      addDirPos < extraPos && advisorPos < extraPos && noLspPos < extraPos,
      'Launch options precede extraArgs in recorded arguments'
    );

    bridge.stopProcess();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

console.log(`\n=== Launch Options Verification Suite Complete: ${passed} passed, ${failed} failed ===`);
