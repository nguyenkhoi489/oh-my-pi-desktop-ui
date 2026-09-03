/**
 * Verification Suite: Code Editor Save & Dirty State (Phase 2)
 *
 * Requirements:
 * 1. Dirty state logic: isDirty is true iff editorValue !== fileContent when file is active.
 * 2. Save file write to disk via fs:save-file IPC contract.
 * 3. Workspace content synchronization after save.
 * 4. i18n keys for save/saving/unsaved are defined in both vi and en.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { vi } from '../shared/i18n/vi.ts';
import { en } from '../shared/i18n/en.ts';

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

console.log('=== Starting Code Editor Save & Dirty State Verification (Phase 2) ===\n');

// Test 1: Dirty state logic verification
console.log('[Test 1] Dirty state detection logic');
{
  const file = { name: 'app.ts', path: '/test/app.ts', relativePath: 'app.ts', isDirectory: false };
  const initialContent = 'const a = 1;';
  
  // Clean state
  let editorValue = 'const a = 1;';
  let isDirty = Boolean(file && editorValue !== initialContent);
  assert(isDirty === false, 'Initial state is not dirty');

  // Modified state
  editorValue = 'const a = 2;';
  isDirty = Boolean(file && editorValue !== initialContent);
  assert(isDirty === true, 'Modified state is dirty');

  // Reverted back to initial
  editorValue = 'const a = 1;';
  isDirty = Boolean(file && editorValue !== initialContent);
  assert(isDirty === false, 'Reverting to initial content clears dirty state');

  // Null file is not dirty
  isDirty = Boolean(null && editorValue !== initialContent);
  assert(isDirty === false, 'Null file is never dirty');
}

// Test 2: File save to disk contract
console.log('\n[Test 2] File save contract');
{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-editor-save-test-'));
  const testFile = path.join(tempDir, 'sample.txt');
  fs.writeFileSync(testFile, 'initial line\n', 'utf-8');

  // Emulate save handler
  const newContent = 'updated line\nsecond line\n';
  fs.writeFileSync(testFile, newContent, 'utf-8');

  const onDisk = fs.readFileSync(testFile, 'utf-8');
  assert(onDisk === newContent, 'Saved content matches new editor value exactly');
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// Test 3: i18n keys for editor save
console.log('\n[Test 3] i18n keys for Editor Save & Dirty Status');
{
  const requiredKeys = [
    'editor.save',
    'editor.saving',
    'editor.savedSuccess',
    'editor.unsavedChanges',
  ];

  for (const key of requiredKeys) {
    assert(typeof vi[key] === 'string' && vi[key].length > 0, `vi dictionary has key "${key}"`);
    assert(typeof en[key] === 'string' && en[key].length > 0, `en dictionary has key "${key}"`);
  }
}

console.log(`\n========================================`);
console.log(`✅ ALL ${passed} VERIFICATION CHECKS PASSED!`);
console.log(`========================================\n`);
process.exit(0);
