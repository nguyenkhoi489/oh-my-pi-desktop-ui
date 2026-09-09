/**
 * Verification Suite: MCP Servers Management & Configuration
 *
 * Requirements:
 * 1. getMcpConfigPath resolves correct paths for user and project scopes.
 * 2. readMcpConfig handles missing files, valid files, and malformed JSON safely.
 * 3. saveMcpServer creates atomic files and merges new servers without data loss.
 * 4. toggleMcpServer toggles disabled status correctly.
 * 5. deleteMcpServer removes servers while preserving other entries.
 * 6. testMcpConnection runs end-to-end stdio JSON-RPC handshake.
 * 7. mcpPresets helpers validate server names, env rows, and preset builders.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  getMcpConfigPath,
  readMcpConfig,
  saveMcpServer,
  deleteMcpServer,
  toggleMcpServer,
  testMcpConnection,
} from '../electron/mcp-servers.ts';
import {
  MCP_PRESETS,
  envToRows,
  rowsToEnv,
  argsToText,
  textToArgs,
  validateServerName,
  buildConfigFromPreset,
} from '../src/utils/mcpPresets.ts';

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

console.log('=== Starting MCP Servers Configuration Verification Suite ===\n');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-mcp-test-'));
const fakeProjectDir = path.join(tempDir, 'fake-project');
fs.mkdirSync(fakeProjectDir, { recursive: true });

try {
  // ----------------------------------------------------
  // Test 1: getMcpConfigPath resolution
  // ----------------------------------------------------
  console.log('[Test 1] getMcpConfigPath resolution for user and project scopes');
  {
    const userPath = await getMcpConfigPath('user');
    assert(userPath.endsWith(path.join('.omp', 'agent', 'mcp.json')), 'User scope resolves to ~/.omp/agent/mcp.json');

    const profilePath = await getMcpConfigPath('user', undefined, 'custom-profile');
    assert(profilePath.includes('custom-profile'), 'Profile scope resolves inside custom-profile directory');

    const projectPath = await getMcpConfigPath('project', fakeProjectDir);
    assert(
      projectPath === path.join(fakeProjectDir, '.omp', 'mcp.json'),
      'Project scope resolves to <project>/.omp/mcp.json'
    );

    let threw = false;
    try {
      await getMcpConfigPath('project');
    } catch {
      threw = true;
    }
    assert(threw, 'Project scope throws if projectPath is missing');
  }

  // ----------------------------------------------------
  // Test 2: readMcpConfig with non-existent, valid, and corrupt files
  // ----------------------------------------------------
  console.log('\n[Test 2] readMcpConfig handling missing, valid, and malformed files');
  {
    // Non-existent file
    const emptyRes = await readMcpConfig('project', fakeProjectDir);
    assert(emptyRes.success === true, 'Reading non-existent mcp.json succeeds with empty servers');
    assert(Object.keys(emptyRes.servers).length === 0, 'Initial servers map is empty');

    // Valid file creation
    const configDir = path.join(fakeProjectDir, '.omp');
    fs.mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'mcp.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        $schema: 'https://example.com/schema.json',
        mcpServers: {
          testServer: {
            command: 'node',
            args: ['server.js'],
            env: { FOO: 'bar' },
            type: 'stdio',
          },
        },
      }),
      'utf-8'
    );

    const validRes = await readMcpConfig('project', fakeProjectDir);
    assert(validRes.success === true, 'Reading valid mcp.json succeeds');
    assert(validRes.servers.testServer?.command === 'node', 'Parsed testServer command correctly');
    assert(validRes.servers.testServer?.env?.FOO === 'bar', 'Parsed testServer env correctly');

    // Malformed JSON file
    fs.writeFileSync(configPath, 'NOT_VALID_JSON{', 'utf-8');
    const corruptRes = await readMcpConfig('project', fakeProjectDir);
    assert(corruptRes.success === false, 'Reading corrupt JSON returns success: false');
    assert(typeof corruptRes.error === 'string', 'Error message provided for corrupt JSON');
  }

  // ----------------------------------------------------
  // Test 3: saveMcpServer atomic mutation & merging
  // ----------------------------------------------------
  console.log('\n[Test 3] saveMcpServer atomic write and merge');
  {
    // Clean directory
    const projectA = path.join(tempDir, 'project-a');
    fs.mkdirSync(projectA, { recursive: true });

    // Save first server
    const save1 = await saveMcpServer(
      'project',
      'github',
      {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_TOKEN: 'secret_123' },
        type: 'stdio',
      },
      projectA
    );
    assert(save1.success === true, 'Saving first server succeeds');

    // Verify written file
    const read1 = await readMcpConfig('project', projectA);
    assert(read1.servers.github?.command === 'npx', 'github server was persisted');
    assert(read1.servers.github?.env?.GITHUB_TOKEN === 'secret_123', 'github env token was persisted');

    // Save second server, ensuring first is preserved
    const save2 = await saveMcpServer(
      'project',
      'memory',
      {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory'],
        type: 'stdio',
      },
      projectA
    );
    assert(save2.success === true, 'Saving second server succeeds');

    const read2 = await readMcpConfig('project', projectA);
    assert(Object.keys(read2.servers).length === 2, 'Both servers exist in mcp.json');
    assert(read2.servers.github?.command === 'npx', 'github server still preserved');
    assert(read2.servers.memory?.command === 'npx', 'memory server added');

    // Reject empty name
    const saveEmpty = await saveMcpServer('project', '   ', { command: 'node' }, projectA);
    assert(saveEmpty.success === false, 'Rejects empty server name');
  }

  // ----------------------------------------------------
  // Test 4: toggleMcpServer enabled/disabled status
  // ----------------------------------------------------
  console.log('\n[Test 4] toggleMcpServer enabled/disabled toggle');
  {
    const projectA = path.join(tempDir, 'project-a');

    // Disable github server
    const toggle1 = await toggleMcpServer('project', 'github', false, projectA);
    assert(toggle1.success === true, 'Disabling github server succeeds');

    const read1 = await readMcpConfig('project', projectA);
    assert(read1.servers.github?.disabled === true, 'github server disabled flag is true');

    // Re-enable github server
    const toggle2 = await toggleMcpServer('project', 'github', true, projectA);
    assert(toggle2.success === true, 'Re-enabling github server succeeds');

    const read2 = await readMcpConfig('project', projectA);
    assert(read2.servers.github?.disabled === false, 'github server disabled flag is false');

    // Non-existent server toggle
    const toggleMissing = await toggleMcpServer('project', 'non_existent', false, projectA);
    assert(toggleMissing.success === false, 'Toggling non-existent server returns error');
  }

  // ----------------------------------------------------
  // Test 5: deleteMcpServer
  // ----------------------------------------------------
  console.log('\n[Test 5] deleteMcpServer entry deletion');
  {
    const projectA = path.join(tempDir, 'project-a');

    const delRes = await deleteMcpServer('project', 'github', projectA);
    assert(delRes.success === true, 'Deleting github server succeeds');

    const readAfter = await readMcpConfig('project', projectA);
    assert(!('github' in readAfter.servers), 'github server removed from servers list');
    assert('memory' in readAfter.servers, 'memory server remains intact');

    // Deleting already deleted server should succeed safely
    const delAgain = await deleteMcpServer('project', 'github', projectA);
    assert(delAgain.success === true, 'Deleting already removed server succeeds gracefully');
  }

  // ----------------------------------------------------
  // Test 6: testMcpConnection validation and stdio handshake
  // ----------------------------------------------------
  console.log('\n[Test 6] testMcpConnection validation and stdio handshake');
  {
    // Empty command rejection
    const emptyCmdRes = await testMcpConnection({ command: '', type: 'stdio' });
    assert(emptyCmdRes.success === false, 'Rejects empty command for stdio');

    // Empty URL rejection
    const emptyUrlRes = await testMcpConnection({ url: '', type: 'http' });
    assert(emptyUrlRes.success === false, 'Rejects empty URL for http');

    // Real stdio JSON-RPC handshake simulation via node
    const mockServerScript = `
      const readline = require('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
      rl.on('line', (line) => {
        try {
          const msg = JSON.parse(line.trim());
          if (msg.id === 1) {
            console.log(JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              result: {
                protocolVersion: '2024-11-05',
                serverInfo: { name: 'mock-mcp-server', version: '1.0.0' }
              }
            }));
          } else if (msg.id === 2) {
            console.log(JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              result: {
                tools: [
                  { name: 'mock_tool_1', description: 'First mock tool' },
                  { name: 'mock_tool_2', description: 'Second mock tool' }
                ]
              }
            }));
          }
        } catch {}
      });
    `;

    const mockScriptPath = path.join(tempDir, 'mock-mcp.cjs');
    fs.writeFileSync(mockScriptPath, mockServerScript, 'utf-8');

    const handshakeRes = await testMcpConnection({
      command: process.execPath,
      args: [mockScriptPath],
      type: 'stdio',
    });

    assert(handshakeRes.success === true, 'JSON-RPC handshake completed successfully');
    assert(handshakeRes.serverInfo?.name === 'mock-mcp-server', 'Handshake parsed serverInfo.name');
    assert(handshakeRes.serverInfo?.version === '1.0.0', 'Handshake parsed serverInfo.version');
    assert(handshakeRes.tools?.length === 2, 'Handshake extracted 2 tools');
    assert(handshakeRes.tools?.[0]?.name === 'mock_tool_1', 'Tool 1 name matches');
    assert(handshakeRes.tools?.[1]?.name === 'mock_tool_2', 'Tool 2 name matches');
    assert(handshakeRes.latencyMs >= 0, 'Handshake recorded non-negative latency');

    // Immediate exit process (test EPIPE resistance on proc.stdin)
    const immediateExitRes = await testMcpConnection({
      command: process.execPath,
      args: ['-e', 'process.exit(1)'],
      type: 'stdio',
    });
    assert(immediateExitRes.success === false, 'Immediate exit process handled cleanly without EPIPE crash');
  }

  // ----------------------------------------------------
  // Test 7: mcpPresets and utility helpers
  // ----------------------------------------------------
  console.log('\n[Test 7] mcpPresets and utility functions');
  {
    assert(MCP_PRESETS.length >= 6, `Catalog contains presets (count: ${MCP_PRESETS.length})`);
    const presetIds = MCP_PRESETS.map((p) => p.id);
    assert(presetIds.includes('github'), 'Catalog contains github');
    assert(presetIds.includes('filesystem'), 'Catalog contains filesystem');
    assert(presetIds.includes('memory'), 'Catalog contains memory');
    assert(presetIds.includes('fetch'), 'Catalog contains fetch');
    assert(presetIds.includes('postgres'), 'Catalog contains postgres');
    assert(presetIds.includes('puppeteer'), 'Catalog contains puppeteer');

    // Server name validation
    assert(validateServerName('github_server-1:test').valid === true, 'Valid server name passes');
    assert(validateServerName('').valid === false, 'Empty server name rejected');
    assert(validateServerName('invalid space').valid === false, 'Space in server name rejected');
    assert(validateServerName('invalid$char').valid === false, 'Special character rejected');

    // Env conversion helpers
    const originalEnv = { API_KEY: '12345', DB_USER: 'postgres' };
    const rows = envToRows(originalEnv);
    assert(rows.length === 2, 'envToRows created 2 rows');
    const convertedBack = rowsToEnv(rows);
    assert(convertedBack.API_KEY === '12345', 'rowsToEnv converted API_KEY back');
    assert(convertedBack.DB_USER === 'postgres', 'rowsToEnv converted DB_USER back');

    // Args conversion helpers
    const textArgs = 'arg1\narg2\narg3';
    const parsedArgs = textToArgs(textArgs);
    assert(parsedArgs.length === 3, 'textToArgs parsed 3 lines');
    assert(parsedArgs[1] === 'arg2', 'textToArgs item matched');
    const joined = argsToText(parsedArgs);
    assert(joined === textArgs, 'argsToText converted back to newline separated string');

    // Space-separated and quoted arguments
    const spaceArgs = '-y "@modelcontextprotocol/server-filesystem" /path/to/folder';
    const parsedSpaceArgs = textToArgs(spaceArgs);
    assert(parsedSpaceArgs.length === 3, 'textToArgs parsed space-separated arguments');
    assert(parsedSpaceArgs[0] === '-y', 'textToArgs parsed flag');
    assert(parsedSpaceArgs[1] === '@modelcontextprotocol/server-filesystem', 'textToArgs stripped quotes from package');
    assert(parsedSpaceArgs[2] === '/path/to/folder', 'textToArgs parsed path argument');

    // Preset builder
    const githubPreset = MCP_PRESETS.find((p) => p.id === 'github');
    assert(Boolean(githubPreset), 'Found github preset');
    const builtConfig = buildConfigFromPreset(githubPreset, {
      GITHUB_PERSONAL_ACCESS_TOKEN: 'token_xyz',
    });
    assert(builtConfig.command === 'npx', 'Built config has npx command');
    assert(builtConfig.env?.GITHUB_PERSONAL_ACCESS_TOKEN === 'token_xyz', 'Built config set token in env');

    const fsPreset = MCP_PRESETS.find((p) => p.id === 'filesystem');
    assert(Boolean(fsPreset), 'Found filesystem preset');
    const fsConfig = buildConfigFromPreset(fsPreset, {
      allowedDir: '/Users/test/dir',
    });
    assert(fsConfig.args?.includes('/Users/test/dir'), 'Built filesystem config injected allowed directory into args');
  }

  // ----------------------------------------------------
  // Test 8: Lock public IPC channels and preload contracts
  // ----------------------------------------------------
  console.log('\n[Test 8] Lock public IPC channels and preload contracts (AGENTS.md Hard rule 1)');
  {
    const mainTs = fs.readFileSync(path.resolve(process.cwd(), 'electron/main.ts'), 'utf-8');
    assert(mainTs.includes("ipcMain.handle('omp:mcp-list'"), "main.ts registers 'omp:mcp-list'");
    assert(mainTs.includes("ipcMain.handle('omp:mcp-save'"), "main.ts registers 'omp:mcp-save'");
    assert(mainTs.includes("ipcMain.handle('omp:mcp-delete'"), "main.ts registers 'omp:mcp-delete'");
    assert(mainTs.includes("ipcMain.handle('omp:mcp-toggle'"), "main.ts registers 'omp:mcp-toggle'");
    assert(mainTs.includes("ipcMain.handle('omp:mcp-test'"), "main.ts registers 'omp:mcp-test'");

    const preloadTs = fs.readFileSync(path.resolve(process.cwd(), 'electron/preload.ts'), 'utf-8');
    assert(preloadTs.includes('listMcpServers:'), 'preload.ts exposes listMcpServers');
    assert(preloadTs.includes('saveMcpServer:'), 'preload.ts exposes saveMcpServer');
    assert(preloadTs.includes('deleteMcpServer:'), 'preload.ts exposes deleteMcpServer');
    assert(preloadTs.includes('toggleMcpServer:'), 'preload.ts exposes toggleMcpServer');
    assert(preloadTs.includes('testMcpConnection:'), 'preload.ts exposes testMcpConnection');

    const electronTypesTs = fs.readFileSync(path.resolve(process.cwd(), 'electron/types.ts'), 'utf-8');
    assert(electronTypesTs.includes('listMcpServers:'), 'electron/types.ts declares listMcpServers');
    assert(electronTypesTs.includes('saveMcpServer:'), 'electron/types.ts declares saveMcpServer');
    assert(electronTypesTs.includes('deleteMcpServer:'), 'electron/types.ts declares deleteMcpServer');
    assert(electronTypesTs.includes('toggleMcpServer:'), 'electron/types.ts declares toggleMcpServer');
    assert(electronTypesTs.includes('testMcpConnection:'), 'electron/types.ts declares testMcpConnection');

    const srcTypesTs = fs.readFileSync(path.resolve(process.cwd(), 'src/types/index.ts'), 'utf-8');
    assert(srcTypesTs.includes('listMcpServers?:'), 'src/types/index.ts declares listMcpServers');
    assert(srcTypesTs.includes('saveMcpServer?:'), 'src/types/index.ts declares saveMcpServer');
    assert(srcTypesTs.includes('deleteMcpServer?:'), 'src/types/index.ts declares deleteMcpServer');
    assert(srcTypesTs.includes('toggleMcpServer?:'), 'src/types/index.ts declares toggleMcpServer');
    assert(srcTypesTs.includes('testMcpConnection?:'), 'src/types/index.ts declares testMcpConnection');
  }
  // ----------------------------------------------------
  // Test 9: Read-only permission fix command & i18n keys
  // ----------------------------------------------------
  console.log('\n[Test 9] Read-only permission fix command & i18n keys');
  {
    const viTs = fs.readFileSync(path.resolve(process.cwd(), 'shared/i18n/vi.ts'), 'utf-8');
    const enTs = fs.readFileSync(path.resolve(process.cwd(), 'shared/i18n/en.ts'), 'utf-8');
    assert(viTs.includes("'settings.mcp.permissionFixHint'"), "vi.ts contains 'settings.mcp.permissionFixHint'");
    assert(enTs.includes("'settings.mcp.permissionFixHint'"), "en.ts contains 'settings.mcp.permissionFixHint'");
    assert(viTs.includes("'settings.mcp.copyCommand'"), "vi.ts contains 'settings.mcp.copyCommand'");
    assert(enTs.includes("'settings.mcp.copyCommand'"), "en.ts contains 'settings.mcp.copyCommand'");
    assert(viTs.includes("'settings.mcp.copiedCommand'"), "vi.ts contains 'settings.mcp.copiedCommand'");
    assert(enTs.includes("'settings.mcp.copiedCommand'"), "en.ts contains 'settings.mcp.copiedCommand'");

    const mcpSectionTsx = fs.readFileSync(path.resolve(process.cwd(), 'src/components/Modals/settings/McpServersSection.tsx'), 'utf-8');
    assert(mcpSectionTsx.includes('sudo chown $(whoami)') && mcpSectionTsx.includes('chmod u+w'), 'McpServersSection.tsx includes sudo chown $(whoami) and chmod u+w command for permission fix');
    assert(mcpSectionTsx.includes('handleCopyCmd'), 'McpServersSection.tsx includes handleCopyCmd callback');

    const settingsModalTsx = fs.readFileSync(path.resolve(process.cwd(), 'src/components/Modals/SettingsModal.tsx'), 'utf-8');
    assert(settingsModalTsx.includes('max-w-4xl'), 'SettingsModal.tsx uses max-w-4xl for comfortable navbar width');
    assert(settingsModalTsx.includes('whitespace-nowrap'), 'SettingsModal.tsx uses whitespace-nowrap for navbar tabs');
    assert(settingsModalTsx.includes('overflow-x-auto shrink-0'), 'SettingsModal.tsx tab navigation keeps shrink-0 with overflow-x-auto');
  }

  console.log('\n====================================================');
  console.log(`MCP Servers Verification: ${passed} passed, ${failed} failed.`);
  console.log('====================================================\n');
} finally {
  // Cleanup temp directory
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup error
  }
}
