/**
 * Verification Suite: Slash Commands & Skills in Composer (Phase 6)
 *
 * Requirements:
 * 1. Types: OmpCommandInfo, OmpSubcommandInfo and RPC event/command frames.
 * 2. Bridge command catalog: load after handshake + refresh on available_commands_update frame.
 * 3. CommandMenu: fuzzy filter & 2 groups (Commands vs Skills with subcommands level 2).
 * 4. Text insertion: '/name ' inserted accurately into input.
 * 5. command_output frame: emitted as IPC 'omp:command-output'.
 * 6. session_info_update frame: updates sessionName & emits context usage update.
 * 7. config_update frame: triggers getState to synchronize model & thinkingLevel.
 */

import { OmpBridge } from '../electron/omp-bridge.ts';
import { filterAndGroupCommands, getDemoCommands } from '../src/utils/commandMenu.ts';
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

console.log('=== Starting Slash Commands & Skills Verification Suite (Phase 6) ===\n');

// Sample Fixture from Probe
const FIXTURE_COMMANDS = [
  {
    name: 'model',
    description: 'Chọn hoặc hiển thị model đang hoạt động',
    inputHint: '<provider/model>',
  },
  {
    name: 'thinking',
    description: 'Cài đặt mức độ suy nghĩ',
    inputHint: '<off|low|medium|high|max>',
  },
  {
    name: 'security',
    description: 'Bảo mật và kiểm tra mã nguồn',
    subcommands: [
      { name: 'scan', description: 'Quét lỗ hổng nhanh' },
      { name: 'audit', description: 'Kiểm tra bảo mật toàn diện STRIDE + OWASP' },
    ],
  },
  {
    name: 'skill:ak-brainstorm',
    description: 'Brainstorm ý tưởng & kiến trúc trước khi code',
  },
  {
    name: 'skill:ak-cook',
    description: 'Thực thi tính năng theo workflow có cấu trúc',
  },
  {
    name: 'skill:ak-debug',
    description: 'Debug và phân tích nguyên nhân gốc rễ',
  },
  {
    name: 'skill:ak-code-review',
    description: 'Review chất lượng code và tìm lỗi tiềm ẩn',
  },
];

// ----------------------------------------------------
// Test 1: Bridge Command Catalog & Handshake Loading
// ----------------------------------------------------
console.log('[Test 1] Bridge Command Catalog & Handshake Loading');
{
  const emittedEvents = [];
  const writtenFrames = [];

  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, ...args) => emittedEvents.push({ channel, args }),
    },
  };

  const bridge = new OmpBridge(mockWindow);

  // Offline guard check
  const offlineRes = await bridge.getAvailableCommands();
  assert(offlineRes.success === false, 'getAvailableCommands returns success: false when unready');
  assert(typeof offlineRes.error === 'string', 'getAvailableCommands returns structured offline error');

  // Set mock process
  bridge.lifecycleState = 'awaiting_ready';
  bridge.process = {
    stdin: {
      writable: true,
      write: (data) => writtenFrames.push(data.toString()),
    },
    killed: false,
    kill: () => {},
  };

  // 1. Ready frame arriving
  bridge.dispatchInboundFrame({
    type: 'ready',
    supportedProtocolVersions: [1, 2],
    maxFrameBytes: 1048576,
    maxReassembledFrameBytes: 4194304,
  });

  assert(writtenFrames.length === 1, 'Bridge writes negotiate_protocol frame');
  const negotiateCmd = JSON.parse(writtenFrames[0].trim());
  assert(negotiateCmd.type === 'negotiate_protocol', 'Negotiate frame type is correct');

  // 2. Negotiate response arriving
  bridge.dispatchInboundFrame({
    type: 'response',
    id: negotiateCmd.id,
    command: 'negotiate_protocol',
    success: true,
  });

  await new Promise((r) => setTimeout(r, 20));

  assert(bridge.getLifecycleState() === 'ready', 'Bridge transitions to ready state');

  // Check that get_available_commands was sent after ready
  const getCmdsFrame = writtenFrames
    .map((f) => JSON.parse(f.trim()))
    .find((f) => f.type === 'get_available_commands');

  assert(Boolean(getCmdsFrame), 'Bridge automatically sends get_available_commands after handshake');

  // Respond to get_available_commands with fixture
  bridge.dispatchInboundFrame({
    type: 'response',
    id: getCmdsFrame.id,
    command: 'get_available_commands',
    success: true,
    data: {
      commands: FIXTURE_COMMANDS,
    },
  });

  await new Promise((r) => setTimeout(r, 20));

  const commandsRes = await bridge.getAvailableCommands();
  assert(commandsRes.commands.length === FIXTURE_COMMANDS.length, 'Loaded all fixture commands');

  // Verify IPC emission
  const updateEvent = emittedEvents.find((e) => e.channel === 'omp:commands-update');
  assert(Boolean(updateEvent), 'Emitted omp:commands-update snapshot event to window');
  assert(updateEvent.args[0].length === FIXTURE_COMMANDS.length, 'IPC snapshot carries all commands');
}

// ----------------------------------------------------
// Test 2: Frame available_commands_update Dynamic Refresh
// ----------------------------------------------------
console.log('\n[Test 2] Frame available_commands_update Dynamic Refresh');
{
  const emittedEvents = [];
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, ...args) => emittedEvents.push({ channel, args }),
    },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.lifecycleState = 'ready';
  bridge.process = {
    stdin: { writable: true, write: () => {} },
    killed: false,
    kill: () => {},
  };

  const UPDATED_COMMANDS = [
    ...FIXTURE_COMMANDS,
    { name: 'skill:ak-tanstack', description: 'Xây dựng với TanStack Start' },
  ];

  bridge.dispatchInboundFrame({
    type: 'available_commands_update',
    commands: UPDATED_COMMANDS,
  });

  const commandsRes = await bridge.getAvailableCommands();
  assert(commandsRes.commands.length === UPDATED_COMMANDS.length, 'Catalog updated to new count (8)');
  assert(
    commandsRes.commands.some((c) => c.name === 'skill:ak-tanstack'),
    'New skill is present in catalog'
  );

  const lastUpdate = emittedEvents.filter((e) => e.channel === 'omp:commands-update').pop();
  assert(Boolean(lastUpdate), 'Emitted omp:commands-update on frame arrival');
  assert(lastUpdate.args[0].length === UPDATED_COMMANDS.length, 'Payload contains updated commands');
}

// ----------------------------------------------------
// Test 3: Fuzzy Filter & Grouping (Commands vs Skills)
// ----------------------------------------------------
console.log('\n[Test 3] Fuzzy Filter & Grouping (Commands vs Skills)');
{
  // 1. Grouping test on empty query
  const { items, groups } = filterAndGroupCommands(FIXTURE_COMMANDS, '');
  assert(groups.length === 2, 'Commands partitioned into exactly 2 groups');
  assert(groups[0].name === 'Commands', 'First group is Commands');
  assert(groups[1].name === 'Skills', 'Second group is Skills');

  const cmdGroup = groups[0];
  const skillGroup = groups[1];

  assert(cmdGroup.items.some((i) => i.commandName === 'model'), 'Commands group contains "model"');
  assert(cmdGroup.items.some((i) => i.commandName === 'security'), 'Commands group contains "security"');

  // Subcommands check
  assert(
    cmdGroup.items.some((i) => i.commandName === 'security scan' && i.isSubcommand === true),
    'Security scan subcommand flattened at level 2'
  );
  assert(
    cmdGroup.items.some((i) => i.commandName === 'security audit' && i.isSubcommand === true),
    'Security audit subcommand flattened at level 2'
  );

  // Skills check: displayName should have 'skill:' stripped
  const brainstormSkill = skillGroup.items.find((i) => i.commandName === 'skill:ak-brainstorm');
  assert(Boolean(brainstormSkill), 'Skills group contains ak-brainstorm');
  assert(brainstormSkill.displayName === 'ak-brainstorm', 'Skill displayName strips "skill:" prefix');
  assert(brainstormSkill.insertText === '/skill:ak-brainstorm ', 'Skill insertText is correct');

  // 2. Query filter tests
  const resBrainstorm = filterAndGroupCommands(FIXTURE_COMMANDS, 'brain');
  assert(resBrainstorm.items.length === 1, 'Query "brain" returns exactly 1 item');
  assert(resBrainstorm.items[0].commandName === 'skill:ak-brainstorm', 'Matched ak-brainstorm');

  const resScan = filterAndGroupCommands(FIXTURE_COMMANDS, 'scan');
  assert(
    resScan.items.some((i) => i.commandName === 'security scan'),
    'Query "scan" matches subcommand "security scan"'
  );

  const resSecurity = filterAndGroupCommands(FIXTURE_COMMANDS, 'sec');
  assert(
    resSecurity.items.some((i) => i.commandName === 'security'),
    'Query "sec" matches parent "security"'
  );

  // 3. Fallback to DEMO_COMMANDS test
  const demoRes = filterAndGroupCommands(getDemoCommands(), 'cook');
  assert(demoRes.items.length >= 1, 'DEMO_COMMANDS fuzzy search matches "cook"');
}

// ----------------------------------------------------
// Test 4: Text Insertion Logic
// ----------------------------------------------------
console.log('\n[Test 4] Text Insertion Logic');
{
  function simulateInsert(currentInput, insertText) {
    const remainder = currentInput.replace(/^\/[^\s]*/, '');
    return `${insertText}${remainder.trimStart()}`;
  }

  // 1. Plain slash
  assert(simulateInsert('/', '/model ') === '/model ', 'Insert "/model " from bare "/"');

  // 2. Partial prefix
  assert(simulateInsert('/mod', '/model ') === '/model ', 'Insert "/model " replaces "/mod"');

  // 3. Partial prefix with trailing arguments
  assert(
    simulateInsert('/mod gemini-3.7-flash', '/model ') === '/model gemini-3.7-flash',
    'Insert "/model " preserves trailing arguments'
  );

  // 4. Skill insertion
  assert(
    simulateInsert('/brain', '/skill:ak-brainstorm ') === '/skill:ak-brainstorm ',
    'Insert skill replaces query with full skill syntax'
  );

  // 5. Subcommand insertion
  assert(
    simulateInsert('/sec', '/security scan ') === '/security scan ',
    'Insert subcommand replaces query with subcommand command'
  );
}

// ----------------------------------------------------
// Test 5: command_output Frame -> IPC Event
// ----------------------------------------------------
console.log('\n[Test 5] command_output Frame -> IPC Event');
{
  const emittedEvents = [];
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, ...args) => emittedEvents.push({ channel, args }),
    },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.lifecycleState = 'ready';

  const outputText = 'Current thinking level: high\nActive model: gemini-3.7-flash-tiered';
  bridge.dispatchInboundFrame({
    type: 'command_output',
    text: outputText,
  });

  const cmdOutEvent = emittedEvents.find((e) => e.channel === 'omp:command-output');
  assert(Boolean(cmdOutEvent), 'Emitted omp:command-output event');
  assert(cmdOutEvent.args[0].text === outputText, 'Output text matches frame content');
}

// ----------------------------------------------------
// Test 6: session_info_update Frame -> sessionName & Context Usage
// ----------------------------------------------------
console.log('\n[Test 6] session_info_update Frame -> sessionName & Context Usage');
{
  const emittedEvents = [];
  const writtenFrames = [];

  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, ...args) => emittedEvents.push({ channel, args }),
    },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.lifecycleState = 'ready';
  bridge.process = {
    stdin: {
      writable: true,
      write: (data) => writtenFrames.push(data.toString()),
    },
    killed: false,
    kill: () => {},
  };

  bridge.dispatchInboundFrame({
    type: 'session_info_update',
    title: 'Slash Commands Plan Session',
    sessionId: 'sess-cmd-001',
  });

  const usageEvent = emittedEvents.find((e) => e.channel === 'omp:context-usage');
  assert(Boolean(usageEvent), 'Emitted omp:context-usage on session_info_update');
  assert(usageEvent.args[0].sessionName === 'Slash Commands Plan Session', 'Updated sessionName in context usage event');
  assert(bridge.getCurrentSessionId() === 'sess-cmd-001', 'Updated currentSessionId');

  // Verify getState was triggered to refresh
  const getStateFrame = writtenFrames
    .map((f) => JSON.parse(f.trim()))
    .find((f) => f.type === 'get_state');
  assert(Boolean(getStateFrame), 'Triggered get_state on session_info_update');
}

// ----------------------------------------------------
// Test 7: config_update Frame -> State Refresh
// ----------------------------------------------------
console.log('\n[Test 7] config_update Frame -> State Refresh');
{
  const writtenFrames = [];
  const mockWindow = {
    isDestroyed: () => false,
    webContents: { send: () => {} },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.lifecycleState = 'ready';
  bridge.process = {
    stdin: {
      writable: true,
      write: (data) => writtenFrames.push(data.toString()),
    },
    killed: false,
    kill: () => {},
  };

  bridge.dispatchInboundFrame({
    type: 'config_update',
    model: 'gemini-3.7-flash-tiered',
    thinkingLevel: 'high',
  });

  const getStateFrame = writtenFrames
    .map((f) => JSON.parse(f.trim()))
    .find((f) => f.type === 'get_state');
  assert(Boolean(getStateFrame), 'config_update triggered get_state to sync engine state');
}

// ----------------------------------------------------
// Test 8: Process Stop Cleans Up Available Commands
// ----------------------------------------------------
console.log('\n[Test 8] Process Stop Cleans Up Available Commands');
{
  const emittedEvents = [];
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, ...args) => emittedEvents.push({ channel, args }),
    },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.lifecycleState = 'ready';
  bridge.availableCommands = [...FIXTURE_COMMANDS];

  bridge.stopProcess();

  assert(bridge.getLifecycleState() === 'idle', 'Bridge is idle after stop');
  const commandsRes = await bridge.getAvailableCommands();
  assert(commandsRes.commands.length === 0, 'Available commands catalog emptied on stop');

  const lastUpdate = emittedEvents.filter((e) => e.channel === 'omp:commands-update').pop();
  assert(Boolean(lastUpdate), 'Emitted empty omp:commands-update on stop');
  assert(lastUpdate.args[0].length === 0, 'Payload is empty array');
}

console.log('\n====================================================');
console.log(`Slash Commands Verification: ${passed} passed, ${failed} failed.`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
}
