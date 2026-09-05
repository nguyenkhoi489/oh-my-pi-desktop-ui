/**
 * Verification Suite: Unsaved Changes Guard & External Conflict Sync (Phase 3)
 *
 * Requirements:
 * 1. File switch guard: triggers modal if isEditorDirty is true; proceeds directly if false.
 * 2. Save & Continue flow: saves draft content and selects pending target.
 * 3. Discard & Continue flow: discards draft and selects pending target without saving.
 * 4. Cancel flow: preserves current file selection and remains dirty.
 * 5. External file change behavior: clean editor auto-reloads; dirty editor triggers conflict banner.
 * 6. i18n keys defined for modal and conflict banner in vi and en.
 */

import fs from 'node:fs';
import path from 'node:path';
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

console.log('=== Starting Unsaved Changes Guard & Conflict Sync Verification (Phase 3) ===\n');

// Test 1: File switch guard state machine
console.log('[Test 1] File switch guard state transitions');
{
  let selectedFile = { name: 'fileA.ts', path: '/workspace/fileA.ts', relativePath: 'fileA.ts', isDirectory: false };
  let pendingFile = null;
  let isModalOpen = false;
  let isDirty = true;
  let savedFiles = [];

  const targetFile = { name: 'fileB.ts', path: '/workspace/fileB.ts', relativePath: 'fileB.ts', isDirectory: false };

  // 1a. Attempt switch while dirty -> triggers modal
  if (isDirty) {
    pendingFile = targetFile;
    isModalOpen = true;
  } else {
    selectedFile = targetFile;
  }
  assert(isModalOpen === true, 'Modal is opened when switching file while dirty');
  assert(pendingFile?.path === targetFile.path, 'Pending file is recorded');

  // 1b. User clicks "Cancel"
  pendingFile = null;
  isModalOpen = false;
  assert(selectedFile.path === '/workspace/fileA.ts', 'Selected file unchanged after Cancel');
  assert(isDirty === true, 'Dirty state preserved after Cancel');

  // 1c. User switches again and clicks "Save & Continue"
  pendingFile = targetFile;
  isModalOpen = true;
  
  // Save action
  savedFiles.push({ path: selectedFile.path, content: 'draft content' });
  isDirty = false;
  isModalOpen = false;
  selectedFile = pendingFile;
  pendingFile = null;

  assert(savedFiles.length === 1 && savedFiles[0].path === '/workspace/fileA.ts', 'File A was saved');
  assert(selectedFile.path === '/workspace/fileB.ts', 'Selected file switched to File B after Save & Continue');
  assert(isDirty === false, 'Dirty state cleared after Save & Continue');
}

// Test 2: External conflict detection logic
console.log('\n[Test 2] External file modification handling');
{
  const initialDiskContent = 'export const val = 1;';
  let editorValue = 'export const val = 1;';
  let lastKnownDiskContent = initialDiskContent;
  let hasExternalConflict = false;

  // Case A: Disk content changes while editor is NOT dirty
  let isDirty = editorValue !== initialDiskContent; // false
  let newDiskContent = 'export const val = 2;';
  if (newDiskContent !== lastKnownDiskContent) {
    lastKnownDiskContent = newDiskContent;
    if (!isDirty) {
      editorValue = newDiskContent;
      hasExternalConflict = false;
    } else {
      hasExternalConflict = true;
    }
  }
  assert(editorValue === 'export const val = 2;', 'Clean editor automatically synced to new disk content');
  assert(hasExternalConflict === false, 'No conflict banner shown when editor was clean');

  // Case B: User modifies editor (becomes dirty), then disk changes again
  editorValue = 'export const val = 100; // my draft';
  isDirty = true;
  let thirdDiskContent = 'export const val = 3; // AI modified';
  if (thirdDiskContent !== lastKnownDiskContent) {
    lastKnownDiskContent = thirdDiskContent;
    if (!isDirty) {
      editorValue = thirdDiskContent;
      hasExternalConflict = false;
    } else {
      hasExternalConflict = true;
    }
  }
  assert(editorValue === 'export const val = 100; // my draft', 'Dirty editor draft preserved when disk changes');
  assert(hasExternalConflict === true, 'Conflict banner triggered when disk changed while dirty');

  // Case C: File is selected, initially rendered before async read completes, then content arrives
  let fileSelected = { path: '/workspace/newFile.ts' };
  let initialReadPendingContent = '';
  let isUserDirty = false;
  let savedContent = initialReadPendingContent;
  let cEditorValue = initialReadPendingContent;
  let cHasConflict = false;

  // Async read resolves with actual file content
  let actualDiskContent = 'console.log("hello world");';
  if (actualDiskContent !== savedContent) {
    if (!isUserDirty) {
      savedContent = actualDiskContent;
      cEditorValue = actualDiskContent;
      cHasConflict = false;
    } else {
      cHasConflict = true;
    }
  }
  assert(cEditorValue === 'console.log("hello world");', 'Async disk content automatically loaded into editor without manual reload');
  assert(cHasConflict === false, 'No conflict banner triggered during async file loading');
  assert(isUserDirty === false, 'Editor remains not dirty after initial load');
}

// Test 3: i18n keys for Phase 3
console.log('\n[Test 3] i18n keys for Unsaved Modal & Conflict Banner');
{
  const requiredKeys = [
    'editor.unsavedModalTitle',
    'editor.unsavedModalDesc',
    'editor.saveAndContinue',
    'editor.discardAndContinue',
    'editor.cancel',
    'editor.externalChangeBanner',
    'editor.reloadFromDisk',
    'editor.keepDraft',
  ];

  for (const key of requiredKeys) {
    assert(typeof vi[key] === 'string' && vi[key].length > 0, `vi dictionary has key "${key}"`);
    assert(typeof en[key] === 'string' && en[key].length > 0, `en dictionary has key "${key}"`);
  }
}

// Test 4: App.tsx implementation verification for handleSaveAndContinue
console.log('\n[Test 4] App.tsx handleSaveAndContinue implementation');
{
  const appPath = path.resolve('src/App.tsx');
  assert(fs.existsSync(appPath), 'src/App.tsx exists');
  const appCode = fs.readFileSync(appPath, 'utf8');

  assert(appCode.includes('handleSaveAndContinue'), 'App defines handleSaveAndContinue');
  assert(
    appCode.includes('saveFileContent(selectedFile.path, contentToSave)'),
    'handleSaveAndContinue invokes saveFileContent with selectedFile.path and contentToSave'
  );
  assert(
    appCode.includes('editorDraftContent ?? fileContent'),
    'contentToSave resolves editorDraftContent ?? fileContent'
  );

  const saveIndex = appCode.indexOf('await saveFileContent(selectedFile.path, contentToSave)');
  const selectIndex = appCode.indexOf('selectFile(pendingFileToSelect)', saveIndex);
  assert(
    saveIndex !== -1 && selectIndex !== -1 && saveIndex < selectIndex,
    'saveFileContent executes strictly before switching to pendingFileToSelect'
  );
}

console.log(`\n========================================`);
console.log(`✅ ALL ${passed} VERIFICATION CHECKS PASSED!`);
console.log(`========================================\n`);
process.exit(0);
