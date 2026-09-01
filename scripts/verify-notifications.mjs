/**
 * Verification Suite: Notifications & Status Surfacing (Phase 1)
 *
 * Requirements:
 * 1. notify 3 types (info, warning, error) + unknown -> emitted omp:notification with proper shape, 0 replies to stdin.
 * 2. setStatus key A/B then A empty -> snapshot has B, 0 replies to stdin.
 * 3. setWidget key W1/W2 then W1 empty -> snapshot has W2, 0 replies to stdin.
 * 4. setTitle -> 0 replies to stdin.
 * 5. newSession, switchSession, cleanupProcess -> resets both Maps and emits empty snapshots.
 * 6. Window destroyed / offline -> zero crash / clean guard.
 */

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

console.log('=== Starting Notifications & Status Surfacing Verification Suite (Phase 1) ===\n');

// ----------------------------------------------------
// Fixture 1: notify Forwarding & Zero Reply Contract
// ----------------------------------------------------
console.log('[Test 1] notify Forwarding (info, warning, error, unknown) & Zero Stdin Replies');
{
  const writtenFrames = [];
  const emittedEvents = [];

  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => emittedEvents.push({ channel, payload }),
    },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.process = {
    stdin: {
      writable: true,
      write: (data) => writtenFrames.push(data.toString()),
    },
    killed: false,
    kill: () => {},
  };

  const dispatch = (frame) => bridge.dispatchInboundFrame(frame);

  // 1. Info notify
  dispatch({
    type: 'extension_ui_request',
    id: 'notif_1',
    method: 'notify',
    message: 'Task initiated',
    notifyType: 'info',
  });

  // 2. Warning notify
  dispatch({
    type: 'extension_ui_request',
    id: 'notif_2',
    method: 'notify',
    message: 'High memory usage detected',
    notifyType: 'warning',
  });

  // 3. Error notify
  dispatch({
    type: 'extension_ui_request',
    id: 'notif_3',
    method: 'notify',
    message: 'Process disconnected unexpectedly',
    notifyType: 'error',
  });

  // 4. Custom unknown notify type
  dispatch({
    type: 'extension_ui_request',
    id: 'notif_4',
    method: 'notify',
    message: 'Custom announcement',
    notifyType: 'special_ping',
  });

  assert(writtenFrames.length === 0, '0 reply frames written to stdin for notify frames (Decision E2)');

  const notifications = emittedEvents.filter((e) => e.channel === 'omp:notification');
  assert(notifications.length === 4, 'Emitted exactly 4 omp:notification events');

  assert(notifications[0].payload.id === 'notif_1', 'Notification 1 id matches');
  assert(notifications[0].payload.message === 'Task initiated', 'Notification 1 message matches');
  assert(notifications[0].payload.notifyType === 'info', 'Notification 1 notifyType is info');
  assert(typeof notifications[0].payload.timestamp === 'number', 'Notification 1 has timestamp');

  assert(notifications[1].payload.notifyType === 'warning', 'Notification 2 notifyType is warning');
  assert(notifications[2].payload.notifyType === 'error', 'Notification 3 notifyType is error');
  assert(notifications[3].payload.notifyType === 'special_ping', 'Notification 4 preserves custom notifyType');
}
console.log();

// ----------------------------------------------------
// Fixture 2: setStatus Dynamic Key Map & Snapshots
// ----------------------------------------------------
console.log('[Test 2] setStatus Map Tracking & Snapshot Emission');
{
  const writtenFrames = [];
  const emittedEvents = [];

  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => emittedEvents.push({ channel, payload }),
    },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.process = {
    stdin: {
      writable: true,
      write: (data) => writtenFrames.push(data.toString()),
    },
    killed: false,
    kill: () => {},
  };

  const dispatch = (frame) => bridge.dispatchInboundFrame(frame);

  // Set Key A
  dispatch({
    type: 'extension_ui_request',
    id: 'stat_1',
    method: 'setStatus',
    statusKey: 'build',
    statusText: 'Compiling TS files...',
  });

  assert(writtenFrames.length === 0, '0 replies written for setStatus key A');
  let statusSnapshots = emittedEvents.filter((e) => e.channel === 'omp:engine-status');
  assert(statusSnapshots.length === 1, 'Received 1st status snapshot');
  assert(statusSnapshots[0].payload.length === 1, 'Snapshot contains 1 item');
  assert(statusSnapshots[0].payload[0].key === 'build', 'Snapshot entry key is build');
  assert(statusSnapshots[0].payload[0].text === 'Compiling TS files...', 'Snapshot entry text matches');

  // Set Key B
  dispatch({
    type: 'extension_ui_request',
    id: 'stat_2',
    method: 'setStatus',
    statusKey: 'tests',
    statusText: 'Running 18 test suites',
  });

  statusSnapshots = emittedEvents.filter((e) => e.channel === 'omp:engine-status');
  assert(statusSnapshots.length === 2, 'Received 2nd status snapshot');
  const latestSnapshot = statusSnapshots[1].payload;
  assert(latestSnapshot.length === 2, 'Snapshot contains 2 entries (build, tests)');

  // Clear Key A by sending empty text
  dispatch({
    type: 'extension_ui_request',
    id: 'stat_3',
    method: 'setStatus',
    statusKey: 'build',
    statusText: '',
  });

  statusSnapshots = emittedEvents.filter((e) => e.channel === 'omp:engine-status');
  assert(statusSnapshots.length === 3, 'Received 3rd status snapshot after clearing key A');
  const clearedSnapshot = statusSnapshots[2].payload;
  assert(clearedSnapshot.length === 1, 'Snapshot now contains only 1 entry');
  assert(clearedSnapshot[0].key === 'tests', 'Remaining entry is key tests');
  assert(clearedSnapshot[0].text === 'Running 18 test suites', 'Remaining entry text intact');
  assert(writtenFrames.length === 0, '0 replies written to stdin throughout setStatus operations');
}
console.log();

// ----------------------------------------------------
// Fixture 3: setWidget Multi-line Entries & Snapshots
// ----------------------------------------------------
console.log('[Test 3] setWidget Map Tracking & Snapshot Emission');
{
  const writtenFrames = [];
  const emittedEvents = [];

  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => emittedEvents.push({ channel, payload }),
    },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.process = {
    stdin: {
      writable: true,
      write: (data) => writtenFrames.push(data.toString()),
    },
    killed: false,
    kill: () => {},
  };

  const dispatch = (frame) => bridge.dispatchInboundFrame(frame);

  // 1. Add Widget W1
  dispatch({
    type: 'extension_ui_request',
    id: 'wid_1',
    method: 'setWidget',
    widgetKey: 'git_status',
    widgetLines: ['M src/App.tsx', 'A src/types/index.ts'],
    widgetPlacement: 'aboveEditor',
  });

  assert(writtenFrames.length === 0, '0 replies written for setWidget W1');
  let widgetSnapshots = emittedEvents.filter((e) => e.channel === 'omp:widget-update');
  assert(widgetSnapshots.length === 1, 'Received 1st widget snapshot');
  assert(widgetSnapshots[0].payload.length === 1, 'Snapshot contains 1 widget');
  assert(widgetSnapshots[0].payload[0].key === 'git_status', 'Widget key is git_status');
  assert(widgetSnapshots[0].payload[0].lines.length === 2, 'Widget contains 2 lines');
  assert(widgetSnapshots[0].payload[0].placement === 'aboveEditor', 'Widget placement preserved');

  // 2. Add Widget W2
  dispatch({
    type: 'extension_ui_request',
    id: 'wid_2',
    method: 'setWidget',
    widgetKey: 'system_diag',
    widgetLines: ['cpu: 12%', 'mem: 450MB'],
  });

  widgetSnapshots = emittedEvents.filter((e) => e.channel === 'omp:widget-update');
  assert(widgetSnapshots.length === 2, 'Received 2nd widget snapshot');
  assert(widgetSnapshots[1].payload.length === 2, 'Snapshot contains 2 widgets');

  // 3. Clear Widget W1 by sending empty lines
  dispatch({
    type: 'extension_ui_request',
    id: 'wid_3',
    method: 'setWidget',
    widgetKey: 'git_status',
    widgetLines: [],
  });

  widgetSnapshots = emittedEvents.filter((e) => e.channel === 'omp:widget-update');
  assert(widgetSnapshots.length === 3, 'Received 3rd widget snapshot after clearing W1');
  const remaining = widgetSnapshots[2].payload;
  assert(remaining.length === 1, 'Snapshot contains 1 widget remaining');
  assert(remaining[0].key === 'system_diag', 'Remaining widget is system_diag');
  assert(writtenFrames.length === 0, '0 replies written to stdin throughout setWidget operations');
}
console.log();

// ----------------------------------------------------
// Fixture 4: setTitle Handling & Zero Reply
// ----------------------------------------------------
console.log('[Test 4] setTitle Inbound Frame (Zero Stdin Replies)');
{
  const writtenFrames = [];
  const emittedEvents = [];

  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => emittedEvents.push({ channel, payload }),
    },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.process = {
    stdin: {
      writable: true,
      write: (data) => writtenFrames.push(data.toString()),
    },
    killed: false,
    kill: () => {},
  };

  bridge.dispatchInboundFrame({
    type: 'extension_ui_request',
    id: 'title_1',
    method: 'setTitle',
    title: 'Phase 1: Implementation in Progress',
  });

  assert(writtenFrames.length === 0, '0 replies written to stdin for setTitle');
}
console.log();

// ----------------------------------------------------
// Fixture 5: Cleanup & Reset on Session Switch / Process Stop
// ----------------------------------------------------
console.log('[Test 5] State Map Reset on Session Reset & Process Cleanup');
{
  const emittedEvents = [];

  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => emittedEvents.push({ channel, payload }),
    },
  };

  const bridge = new OmpBridge(mockWindow);
  bridge.process = {
    stdin: {
      writable: true,
      write: () => {},
    },
    killed: false,
    kill: () => {},
  };

  // Populate statuses and widgets
  bridge.dispatchInboundFrame({
    type: 'extension_ui_request',
    id: 's1',
    method: 'setStatus',
    statusKey: 'k1',
    statusText: 'active text',
  });
  bridge.dispatchInboundFrame({
    type: 'extension_ui_request',
    id: 'w1',
    method: 'setWidget',
    widgetKey: 'w1',
    widgetLines: ['Line A'],
  });

  assert(bridge.getEngineStatuses().length === 1, 'Bridge has 1 active status before cleanup');
  assert(bridge.getEngineWidgets().length === 1, 'Bridge has 1 active widget before cleanup');

  // Trigger resetSessionAccumulators
  bridge.resetSessionAccumulators();

  assert(bridge.getEngineStatuses().length === 0, 'Bridge engineStatuses map cleared on resetSessionAccumulators');
  assert(bridge.getEngineWidgets().length === 0, 'Bridge engineWidgets map cleared on resetSessionAccumulators');

  const emptyStatuses = emittedEvents.filter((e) => e.channel === 'omp:engine-status' && Array.isArray(e.payload) && e.payload.length === 0);
  const emptyWidgets = emittedEvents.filter((e) => e.channel === 'omp:widget-update' && Array.isArray(e.payload) && e.payload.length === 0);
  assert(emptyStatuses.length >= 1, 'Emitted empty omp:engine-status snapshot on session reset');
  assert(emptyWidgets.length >= 1, 'Emitted empty omp:widget-update snapshot on session reset');

  // Re-populate and test stopProcess cleanup
  bridge.dispatchInboundFrame({
    type: 'extension_ui_request',
    id: 's2',
    method: 'setStatus',
    statusKey: 'k2',
    statusText: 'text 2',
  });
  assert(bridge.getEngineStatuses().length === 1, 'Status repopulated');

  bridge.stopProcess();
  assert(bridge.getEngineStatuses().length === 0, 'Bridge engineStatuses cleared on stopProcess');
  assert(bridge.getEngineWidgets().length === 0, 'Bridge engineWidgets cleared on stopProcess');
}
console.log();

// ----------------------------------------------------
// Fixture 6: Destroyed Window / Null Window Resilience
// ----------------------------------------------------
console.log('[Test 6] Window Destroyed Safety Guard (Zero Crash)');
{
  const mockDestroyedWindow = {
    isDestroyed: () => true,
    webContents: {
      send: () => {
        throw new Error('Should not be called when window is destroyed');
      },
    },
  };

  const bridge = new OmpBridge(mockDestroyedWindow);
  bridge.process = {
    stdin: {
      writable: true,
      write: () => {},
    },
    killed: false,
    kill: () => {},
  };

  let threw = false;
  try {
    bridge.dispatchInboundFrame({
      type: 'extension_ui_request',
      id: 'd_1',
      method: 'notify',
      message: 'Hello to destroyed window',
    });
    bridge.dispatchInboundFrame({
      type: 'extension_ui_request',
      id: 'd_2',
      method: 'setStatus',
      statusKey: 'k_d',
      statusText: 'test',
    });
    bridge.dispatchInboundFrame({
      type: 'extension_ui_request',
      id: 'd_3',
      method: 'setWidget',
      widgetKey: 'w_d',
      widgetLines: ['L1'],
    });
    bridge.resetSessionAccumulators();
    bridge.stopProcess();
  } catch (err) {
    threw = true;
    console.error(err);
  }

  assert(!threw, 'Zero exceptions thrown when window is destroyed');
}
console.log();

// ----------------------------------------------------
// Summary
// ----------------------------------------------------
console.log('====================================================');
console.log(`Notifications & Status Verification Complete: ${passed} passed, ${failed} failed.`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
