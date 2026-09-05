import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  clampWidth,
  calculateResizedWidth,
  loadPersistedWidth,
  savePersistedWidth,
} from '../src/utils/resizable.ts';
import { vi } from '../shared/i18n/vi.ts';
import { en } from '../shared/i18n/en.ts';

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ PASSED: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAILED: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('=== Starting Resizable Right Sidebar Verification ===\n');

// ----------------------------------------------------
// Test 1: Pure Clamp Width Logic
// ----------------------------------------------------
console.log('[Test 1] clampWidth boundaries');
await test('Clamps below minWidth', () => {
  assert.equal(clampWidth(200, 340, 900), 340);
});

await test('Clamps above maxWidth', () => {
  assert.equal(clampWidth(1200, 340, 900), 900);
});

await test('Preserves value within range', () => {
  assert.equal(clampWidth(500, 340, 900), 500);
});

await test('Handles inverted bounds safely', () => {
  assert.equal(clampWidth(400, 500, 300), 500);
});

// ----------------------------------------------------
// Test 2: calculateResizedWidth Directional Math
// ----------------------------------------------------
console.log('\n[Test 2] calculateResizedWidth math');
await test('Left-anchored sidebar: dragging left expands width', () => {
  const result = calculateResizedWidth({
    startWidth: 480,
    startX: 1000,
    currentX: 900, // cursor moved 100px to the left
    minWidth: 340,
    maxWidth: 900,
    direction: 'left',
  });
  assert.equal(result, 580);
});

await test('Left-anchored sidebar: dragging right shrinks width', () => {
  const result = calculateResizedWidth({
    startWidth: 480,
    startX: 1000,
    currentX: 1100, // cursor moved 100px to the right
    minWidth: 340,
    maxWidth: 900,
    direction: 'left',
  });
  assert.equal(result, 380);
});

await test('Enforces minWidth clamp on over-shrinking', () => {
  const result = calculateResizedWidth({
    startWidth: 480,
    startX: 1000,
    currentX: 1500,
    minWidth: 340,
    maxWidth: 900,
    direction: 'left',
  });
  assert.equal(result, 340);
});

await test('Enforces maxWidth clamp on over-expanding', () => {
  const result = calculateResizedWidth({
    startWidth: 480,
    startX: 1000,
    currentX: 100,
    minWidth: 340,
    maxWidth: 800,
    direction: 'left',
  });
  assert.equal(result, 800);
});

await test('Right-anchored sidebar: dragging right expands width', () => {
  const result = calculateResizedWidth({
    startWidth: 300,
    startX: 300,
    currentX: 450,
    minWidth: 200,
    maxWidth: 600,
    direction: 'right',
  });
  assert.equal(result, 450);
});

// ----------------------------------------------------
// Test 3: LocalStorage Persistence Logic
// ----------------------------------------------------
console.log('\n[Test 3] LocalStorage persistence');
await test('loadPersistedWidth returns defaultWidth when no storage', () => {
  const width = loadPersistedWidth(undefined, 480, 340, 900);
  assert.equal(width, 480);
});

await test('loadPersistedWidth works with mocked localStorage and clamps', () => {
  const mockStorage = {
    getItem: (key) => (key === 'test_width' ? '750' : null),
    setItem: () => {},
  };
  globalThis.window = { localStorage: mockStorage };

  const width = loadPersistedWidth('test_width', 480, 340, 900);
  assert.equal(width, 750);

  const clampedWidth = loadPersistedWidth('test_width', 480, 340, 600);
  assert.equal(clampedWidth, 600);

  delete globalThis.window;
});

await test('savePersistedWidth stores rounded width string', () => {
  let storedKey = null;
  let storedVal = null;
  const mockStorage = {
    setItem: (key, val) => {
      storedKey = key;
      storedVal = val;
    },
    getItem: () => null,
  };
  globalThis.window = { localStorage: mockStorage };

  savePersistedWidth('test_key', 512.6);
  assert.equal(storedKey, 'test_key');
  assert.equal(storedVal, '513');

  delete globalThis.window;
});

// ----------------------------------------------------
// Test 4: Hook & Component Source Code Verification
// ----------------------------------------------------
console.log('\n[Test 4] Source code contracts');
await test('useResizable hook exports proper contract', async () => {
  const hookPath = path.resolve('src/hooks/useResizable.ts');
  assert(fs.existsSync(hookPath), 'src/hooks/useResizable.ts exists');
  const code = fs.readFileSync(hookPath, 'utf8');

  assert(code.includes('export function useResizable'), 'Exports useResizable hook');
  assert(code.includes('startResize'), 'Provides startResize callback');
  assert(code.includes('resetWidth'), 'Provides resetWidth callback');
  assert(code.includes('isDragging'), 'Tracks isDragging state');
  assert(code.includes('requestAnimationFrame'), 'Uses requestAnimationFrame for 60/120fps smooth update');
  assert(code.includes('window.addEventListener(\'mousemove\''), 'Attaches mousemove to window');
  assert(code.includes('window.addEventListener(\'mouseup\''), 'Attaches mouseup to window');
});

await test('App.tsx integrates useResizable with drag overlay and resize handle', async () => {
  const appPath = path.resolve('src/App.tsx');
  const code = fs.readFileSync(appPath, 'utf8');

  assert(code.includes('useResizable'), 'App.tsx imports useResizable');
  assert(code.includes('rightSidebarWidth'), 'App.tsx tracks rightSidebarWidth');
  assert(code.includes('cursor-col-resize'), 'App.tsx has col-resize handle');
  assert(code.includes('onDoubleClick={resetRightSidebarWidth}'), 'App.tsx supports double-click reset');
  assert(code.includes('isRightSidebarDragging ? \'transition-none\' : \'transition-all duration-200\''), 'App.tsx disables transition during drag');
  assert(code.includes('fixed inset-0 z-50 cursor-col-resize select-none pointer-events-auto'), 'App.tsx mounts full-screen overlay during drag to prevent webview mouse capture');
});

// ----------------------------------------------------
// Test 5: i18n Key Parity
// ----------------------------------------------------
console.log('\n[Test 5] i18n Key Parity');
await test('inspector.resizeHandle is registered in vi and en', () => {
  assert(vi['inspector.resizeHandle'], 'vi dictionary has inspector.resizeHandle');
  assert(en['inspector.resizeHandle'], 'en dictionary has inspector.resizeHandle');
});

console.log(`\n====================================================`);
console.log(`Resizable Right Sidebar: ${passed} passed, 0 failed.`);
console.log(`====================================================\n`);
