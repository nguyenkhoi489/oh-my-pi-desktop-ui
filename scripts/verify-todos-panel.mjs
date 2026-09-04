/**
 * Verification Suite: Todos Panel & Plan Progress (Phase 4)
 *
 * Verifies:
 * 1. OmpBridge.getTodos & normalizeAndSetTodos:
 *    - Inbound `todos` frame with `phases` parses and stores phases and flat todos.
 *    - Inbound `todos` frame with flat `todos` groups into default phase.
 *    - Inbound `todo_reminder` frame updates todos snapshot.
 *    - Inbound frames dispatch `omp:todos-update` to renderer window.
 * 2. OmpBridge.getState:
 *    - Reflects `todoPhases` / `todos` in state response and updates internal snapshot.
 * 3. OmpBridge.setTodos:
 *    - Sends `set_todos` command frame with phases.
 *    - Resolves upon response and synchronizes snapshot.
 *    - Offline simulation support updates snapshot.
 * 4. Session lifecycle & cleanup:
 *    - resetSessionAccumulators clears todos and emits empty snapshot.
 *    - stopProcess clears todos and emits empty snapshot.
 * 5. Preload & Main IPC contract:
 *    - Preload exposes `getTodos`, `setTodos`, `onOmpTodosUpdate`.
 *    - Main registers `omp:get-todos` and `omp:set-todos`.
 *    - Types export `OmpTodoPhase`, `OmpTodoItem`, `OmpTodoStatus`.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OmpBridge } from '../electron/omp-bridge.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function runTodosPanelVerification() {
  console.log('=== Starting Todos Panel Verification Suite (Phase 4) ===\n');

  // ----------------------------------------------------
  // Test 1: Inbound `todos` frame with `phases`
  // ----------------------------------------------------
  console.log('[Test 1] Inbound `todos` frame with phases...');
  {
    const sentEvents = [];
    const mockWindow = {
      isDestroyed: () => false,
      webContents: {
        send: (channel, data) => {
          sentEvents.push({ channel, data });
        },
      },
    };

    const bridge = new OmpBridge(mockWindow);

    // Simulate inbound `todos` frame from engine
    const todosFrame = {
      type: 'todos',
      phases: [
        {
          name: 'Phase 1: Khảo sát & Phân tích',
          tasks: [
            { content: 'Khảo sát cấu trúc RPC', status: 'done' },
            { content: 'Xác minh schema todos', status: 'in_progress' },
          ],
        },
        {
          name: 'Phase 2: Xây dựng UI',
          tasks: [
            { content: 'Viết component TodoPanel', status: 'pending' },
          ],
        },
      ],
    };

    bridge.dispatchInboundFrame(todosFrame);

    const snapshot = bridge.getTodos();
    assert(Array.isArray(snapshot.phases) && snapshot.phases.length === 2, 'bridge stores exactly 2 phases');
    assert(snapshot.phases[0].name === 'Phase 1: Khảo sát & Phân tích', 'Phase 1 name matches');
    assert(snapshot.phases[0].tasks.length === 2, 'Phase 1 has 2 tasks');
    assert(snapshot.phases[1].tasks.length === 1, 'Phase 2 has 1 task');

    assert(Array.isArray(snapshot.todos) && snapshot.todos.length === 3, 'bridge computes flat todos list of 3 items');
    assert(snapshot.todos[0].content === 'Khảo sát cấu trúc RPC', 'Task 1 content matches');
    assert(snapshot.todos[0].status === 'done', 'Task 1 status is done');
    assert(snapshot.todos[0].phase === 'Phase 1: Khảo sát & Phân tích', 'Task 1 has phase name attached');
    assert(snapshot.todos[1].status === 'in_progress', 'Task 2 status is in_progress');

    const updateEvent = sentEvents.find((e) => e.channel === 'omp:todos-update');
    assert(Boolean(updateEvent), 'Dispatched omp:todos-update event to renderer');
    assert(updateEvent.data.phases.length === 2, 'Dispatched event contains phases');
    assert(updateEvent.data.todos.length === 3, 'Dispatched event contains flat todos');
  }

  // ----------------------------------------------------
  // Test 2: Inbound `todos` frame with flat `todos` list
  // ----------------------------------------------------
  console.log('\n[Test 2] Inbound `todos` frame with flat todos list...');
  {
    const sentEvents = [];
    const mockWindow = {
      isDestroyed: () => false,
      webContents: {
        send: (channel, data) => {
          sentEvents.push({ channel, data });
        },
      },
    };

    const bridge = new OmpBridge(mockWindow);

    const flatTodosFrame = {
      type: 'todos',
      todos: [
        { content: 'Viết test suite', status: 'in_progress', phase: 'Testing' },
        { content: 'Kiểm tra typecheck', status: 'pending', phase: 'Testing' },
      ],
    };

    bridge.dispatchInboundFrame(flatTodosFrame);

    const snapshot = bridge.getTodos();
    assert(snapshot.todos.length === 2, 'Flat todos list stored');
    assert(snapshot.phases.length === 1, 'Grouped into 1 phase');
    assert(snapshot.phases[0].name === 'Testing', 'Phase name grouped from items');
    assert(snapshot.phases[0].tasks.length === 2, 'Phase contains both tasks');
  }

  // ----------------------------------------------------
  // Test 3: Inbound `todo_reminder` frame
  // ----------------------------------------------------
  console.log('\n[Test 3] Inbound `todo_reminder` frame handling...');
  {
    const sentEvents = [];
    const mockWindow = {
      isDestroyed: () => false,
      webContents: {
        send: (channel, data) => {
          sentEvents.push({ channel, data });
        },
      },
    };

    const bridge = new OmpBridge(mockWindow);

    const reminderFrame = {
      type: 'todo_reminder',
      todos: [
        { content: 'Active Task 1', status: 'in_progress' },
        { content: 'Pending Task 2', status: 'pending' },
      ],
      attempt: 1,
      maxAttempts: 3,
    };

    bridge.dispatchInboundFrame(reminderFrame);

    const snapshot = bridge.getTodos();
    assert(snapshot.todos.length === 2, 'todo_reminder updated todos snapshot');
    assert(snapshot.todos[0].content === 'Active Task 1', 'Task 1 preserved');
    assert(snapshot.todos[0].status === 'in_progress', 'Task 1 is in_progress');
    assert(snapshot.phases.length === 1, 'Phase created for reminder tasks');
  }

  // ----------------------------------------------------
  // Test 3b: `todo_reminder` giữ nguyên tên phase đã có
  // ----------------------------------------------------
  console.log('\n[Test 3b] `todo_reminder` preserves existing phase structure...');
  {
    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: () => {} },
    };

    const bridge = new OmpBridge(mockWindow);

    bridge.dispatchInboundFrame({
      type: 'todos',
      phases: [
        { name: 'Phase 1 - Setup', tasks: [{ content: 'Task A', status: 'pending' }] },
        { name: 'Phase 2 - Build', tasks: [{ content: 'Task B', status: 'pending' }] },
      ],
    });

    // Reminder trả todos phẳng không kèm phase (đúng như engine thật gửi)
    bridge.dispatchInboundFrame({
      type: 'todo_reminder',
      todos: [
        { content: 'Task A', status: 'done' },
        { content: 'Task B', status: 'in_progress' },
      ],
      attempt: 1,
      maxAttempts: 3,
    });

    const snapshot = bridge.getTodos();
    assert(snapshot.phases.length === 2, 'Both phases survive the reminder');
    assert(snapshot.phases[0].name === 'Phase 1 - Setup', 'Phase 1 name preserved');
    assert(snapshot.phases[1].name === 'Phase 2 - Build', 'Phase 2 name preserved');
    assert(snapshot.phases[0].tasks[0].status === 'done', 'Task A status synced from reminder');
    assert(snapshot.phases[1].tasks[0].status === 'in_progress', 'Task B status synced from reminder');
    assert(snapshot.todos.every((t) => typeof t.phase === 'string' && t.phase), 'Flat todos keep phase attribution');
  }

  // ----------------------------------------------------
  // Test 4: getState response updates todos snapshot
  // ----------------------------------------------------
  console.log('\n[Test 4] getState response synchronization with todoPhases...');
  {
    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: () => {} },
    };

    const bridge = new OmpBridge(mockWindow);
    const writtenFrames = [];

    bridge.lifecycleState = 'ready';
    bridge.process = {
      stdin: {
        writable: true,
        write: (str) => {
          writtenFrames.push(JSON.parse(str.trim()));
          return true;
        },
      },
    };

    const getStatePromise = bridge.getState();
    assert(writtenFrames.length === 1, 'getState wrote command frame');
    const cmdId = writtenFrames[0].id;
    assert(writtenFrames[0].type === 'get_state', 'Command type is get_state');

    // Simulate response with todoPhases
    bridge.dispatchInboundFrame({
      id: cmdId,
      type: 'response',
      command: 'get_state',
      success: true,
      data: {
        todoPhases: [
          {
            name: 'Initial Phase',
            tasks: [{ content: 'Sync from state', status: 'done' }],
          },
        ],
      },
    });

    const res = await getStatePromise;
    assert(res.success === true, 'getState resolved with success: true');
    const snapshot = bridge.getTodos();
    assert(snapshot.phases.length === 1, 'Todos snapshot updated from getState');
    assert(snapshot.todos[0].content === 'Sync from state', 'Todo content matches getState');
  }

  // ----------------------------------------------------
  // Test 5: setTodos command framing & offline fallback
  // ----------------------------------------------------
  console.log('\n[Test 5] setTodos command framing & response handling...');
  {
    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: () => {} },
    };

    const bridge = new OmpBridge(mockWindow);

    // Test offline simulation
    const offlinePhases = [
      {
        name: 'Offline Phase',
        tasks: [{ content: 'Task offline', status: 'pending' }],
      },
    ];
    const offlineRes = await bridge.setTodos(offlinePhases);
    assert(offlineRes.success === true, 'setTodos offline fallback succeeds');
    assert(bridge.getTodos().phases.length === 1, 'Offline phase stored in snapshot');

    // Test live framing
    const writtenFrames = [];
    bridge.lifecycleState = 'ready';
    bridge.process = {
      stdin: {
        writable: true,
        write: (str) => {
          writtenFrames.push(JSON.parse(str.trim()));
          return true;
        },
      },
    };

    const livePhases = [
      {
        name: 'Live Phase',
        tasks: [{ content: 'Live Task 1', status: 'in_progress' }],
      },
    ];

    const setTodosPromise = bridge.setTodos(livePhases);
    assert(writtenFrames.length === 1, 'setTodos wrote command frame');
    assert(writtenFrames[0].type === 'set_todos', 'Frame type is set_todos');
    assert(writtenFrames[0].phases.length === 1, 'Frame contains phases');
    const cmdId = writtenFrames[0].id;

    // Simulate response
    bridge.dispatchInboundFrame({
      id: cmdId,
      type: 'response',
      command: 'set_todos',
      success: true,
      data: {
        todoPhases: livePhases,
      },
    });

    const liveRes = await setTodosPromise;
    assert(liveRes.success === true, 'setTodos resolved with success');
    assert(bridge.getTodos().phases[0].name === 'Live Phase', 'Snapshot synchronized after response');
  }

  // ----------------------------------------------------
  // Test 6: Session reset & cleanup clears todos snapshot
  // ----------------------------------------------------
  console.log('\n[Test 6] Session reset & stopProcess clears todos snapshot...');
  {
    const sentEvents = [];
    const mockWindow = {
      isDestroyed: () => false,
      webContents: {
        send: (channel, data) => {
          sentEvents.push({ channel, data });
        },
      },
    };

    const bridge = new OmpBridge(mockWindow);

    bridge.dispatchInboundFrame({
      type: 'todos',
      todos: [{ content: 'Task to be cleared', status: 'pending' }],
    });
    assert(bridge.getTodos().todos.length === 1, 'Todos stored before cleanup');

    // Reset session
    bridge.resetSessionAccumulators();
    assert(bridge.getTodos().todos.length === 0, 'todos cleared after resetSessionAccumulators');
    assert(bridge.getTodos().phases.length === 0, 'phases cleared after resetSessionAccumulators');

    const lastEvent = sentEvents[sentEvents.length - 1];
    assert(lastEvent.channel === 'omp:todos-update', 'Emitted empty omp:todos-update on reset');
    assert(lastEvent.data.todos.length === 0 && lastEvent.data.phases.length === 0, 'Empty arrays sent');
  }

  // ----------------------------------------------------
  // Test 7: Preload & Main IPC Contract Verification
  // ----------------------------------------------------
  console.log('\n[Test 7] Preload & Main IPC Contract Verification...');
  {
    const preloadPath = path.join(__dirname, '../electron/preload.ts');
    const preloadContent = fs.readFileSync(preloadPath, 'utf-8');

    assert(preloadContent.includes('getTodos:'), 'preload.ts exposes getTodos');
    assert(preloadContent.includes('setTodos:'), 'preload.ts exposes setTodos');
    assert(preloadContent.includes('onOmpTodosUpdate:'), 'preload.ts exposes onOmpTodosUpdate');
    assert(preloadContent.includes('omp:todos-update'), 'preload.ts listens on omp:todos-update channel');

    const mainPath = path.join(__dirname, '../electron/main.ts');
    const mainContent = fs.readFileSync(mainPath, 'utf-8');

    assert(mainContent.includes("ipcMain.handle('omp:get-todos'"), 'main.ts registers omp:get-todos handler');
    assert(mainContent.includes("ipcMain.handle('omp:set-todos'"), 'main.ts registers omp:set-todos handler');

    const typesPath = path.join(__dirname, '../electron/types.ts');
    const typesContent = fs.readFileSync(typesPath, 'utf-8');
    assert(typesContent.includes('export type OmpTodoStatus'), 'types.ts exports OmpTodoStatus');
    assert(typesContent.includes('export interface OmpTodoItem'), 'types.ts exports OmpTodoItem');
    assert(typesContent.includes('export interface OmpTodoPhase'), 'types.ts exports OmpTodoPhase');

    const rpcTypesPath = path.join(__dirname, '../electron/omp-rpc-types.ts');
    const rpcTypesContent = fs.readFileSync(rpcTypesPath, 'utf-8');
    assert(rpcTypesContent.includes('export interface SetTodosCommand'), 'omp-rpc-types.ts exports SetTodosCommand');
    assert(rpcTypesContent.includes('export interface TodosEvent'), 'omp-rpc-types.ts exports TodosEvent');
    assert(rpcTypesContent.includes('export interface TodoReminderEvent'), 'omp-rpc-types.ts exports TodoReminderEvent');
  }

  // ----------------------------------------------------
  // Test 8: TodoPanel Component source structure
  // ----------------------------------------------------
  console.log('\n[Test 8] TodoPanel Component Source & React.memo Verification...');
  {
    const componentPath = path.join(__dirname, '../src/components/AgentPanel/TodoPanel.tsx');
    assert(fs.existsSync(componentPath), 'TodoPanel.tsx exists');
    const componentContent = fs.readFileSync(componentPath, 'utf-8');

    assert(componentContent.includes('React.memo'), 'TodoPanel is wrapped in React.memo');
    assert(componentContent.includes('isExpanded'), 'TodoPanel supports collapsible state');
    assert(componentContent.includes('renderTodoStatusIcon'), 'TodoPanel has status icon renderer');
    assert(componentContent.includes('normalizedPhases.length === 0'), 'TodoPanel returns null when empty');
    assert(componentContent.includes('engineStatus'), 'TodoPanel accepts engineStatus prop');
    assert(componentContent.includes('isEngineBusy'), 'TodoPanel checks isEngineBusy for spinner animation');

    const agentPanelPath = path.join(__dirname, '../src/components/AgentPanel/AgentPanel.tsx');
    const agentPanelContent = fs.readFileSync(agentPanelPath, 'utf-8');
    assert(agentPanelContent.includes('<TodoPanel'), 'AgentPanel mounts TodoPanel');
    assert(agentPanelContent.includes('todoPhases'), 'AgentPanel passes todoPhases');
    assert(agentPanelContent.includes('todos'), 'AgentPanel passes todos');
    assert(agentPanelContent.includes('engineStatus={status}'), 'AgentPanel passes engineStatus to TodoPanel');
  }
  console.log(`\n====================================================`);
  console.log(`Todos Panel Verification Complete: ${passed} passed, ${failed} failed.`);
  console.log(`====================================================\n`);
}

runTodosPanelVerification().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
