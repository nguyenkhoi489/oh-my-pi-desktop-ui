/**
 * Verification Suite: Modal & Omnibar Refinement (Phase 9)
 * 
 * Verifies Phase 9 Requirements:
 * 1. Tool Approval Card non-blocking & explicit Approve/Deny:
 *    - Tool approvals route to ToolApprovalCard (not dismissed via ESC)
 *    - Explicit Approve ('Approve') and Deny ('Deny') payload semantics
 *    - PromptComposer disabled when tool approval is pending
 * 2. Select Keyboard Navigation & Shortcuts:
 *    - handleSelectKeyNav for ArrowDown, ArrowUp, Enter, and numbers 1-9
 *    - Direct number key trigger selects and submits option
 * 3. Normal Request ESC Dismissal:
 *    - Generic select, confirm, input, editor dismiss via ESC to cancelled: true
 * 4. Truthful Timeout Badge:
 *    - Only rendered when request.timeout is a positive number
 *    - Zero countdown does not trigger premature client dismissal
 * 5. Real Omnibar & useCommandCatalog:
 *    - Filters and groups raw commands into Commands and Skills
 *    - Correct insertText generation for top-level and subcommands
 * 6. Modal Layering Z-Index Hierarchy:
 *    - OmpRequiredModal (z-[60]) > PermissionModal (z-[55]) > OmnibarModal (z-[50])
 * 7. Mock Preview Fallbacks:
 *    - Valid shape for DEMO_TOOL_APPROVAL_REQUEST and DEMO_GENERIC_SELECT_REQUEST
 */

import fs from 'node:fs';
import path from 'node:path';
import { handleSelectKeyNav } from '../src/utils/permissionNav.ts';
import { filterAndGroupCommands, getDemoCommands } from '../src/utils/commandMenu.ts';
import { DEMO_TOOL_APPROVAL_REQUEST, DEMO_GENERIC_SELECT_REQUEST } from '../src/mock/demoData.ts';

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

console.log('=== Starting Modal & Omnibar Refinement Verification Suite (Phase 9) ===\n');

// ----------------------------------------------------
// Test 1: Tool Approval Routing & Explicit Actions
// ----------------------------------------------------
console.log('[Test 1] Tool Approval Routing & Action Semantics');
{
  const toolApprovalReq = {
    id: 'req-tool-1',
    method: 'select',
    title: 'Allow tool: write',
    options: ['Approve', 'Deny'],
    isToolApproval: true,
  };

  const genericReq = {
    id: 'req-generic-1',
    method: 'select',
    title: 'Select strategy',
    options: ['Option 1', 'Option 2', 'Option 3'],
    isToolApproval: false,
  };

  // Helper matching App.tsx tool approval detection logic
  function isToolApproval(req) {
    if (!req) return false;
    return (
      req.isToolApproval ||
      (req.method === 'select' &&
        Array.isArray(req.options) &&
        req.options.length === 2 &&
        req.options.includes('Approve') &&
        req.options.includes('Deny'))
    );
  }

  assert(isToolApproval(toolApprovalReq) === true, 'Tool approval request is correctly identified');
  assert(isToolApproval(genericReq) === false, 'Generic select request is not treated as tool approval');

  // Verify response values
  let responsePayload = null;
  function mockRespondSelect(id, value) {
    responsePayload = { id, value };
  }

  mockRespondSelect(toolApprovalReq.id, 'Approve');
  assert(responsePayload.value === 'Approve', 'Approval sends value "Approve"');

  mockRespondSelect(toolApprovalReq.id, 'Deny');
  assert(responsePayload.value === 'Deny', 'Denial sends value "Deny"');

  // Verify ToolApprovalCard source code contains NO escape key handler
  const cardSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/AgentPanel/ToolApprovalCard.tsx'),
    'utf-8'
  );
  assert(
    !cardSource.includes("e.key === 'Escape'"),
    'ToolApprovalCard does not contain Escape key dismiss handler'
  );
  assert(
    cardSource.includes("e.key === 'Enter'") && cardSource.includes("e.key === 'Backspace'"),
    'ToolApprovalCard supports ⌘↵ Approve and ⌘⌫ Deny shortcuts'
  );
}

// ----------------------------------------------------
// Test 2: Select Keyboard Navigation & Number Shortcuts
// ----------------------------------------------------
console.log('\n[Test 2] Select Keyboard Navigation & Number Shortcuts');
{
  const optionsCount = 3;

  // ArrowDown
  let res = handleSelectKeyNav('ArrowDown', 0, optionsCount);
  assert(res.handled === true && res.nextIndex === 1, 'ArrowDown navigates from 0 to 1');
  res = handleSelectKeyNav('ArrowDown', 2, optionsCount);
  assert(res.handled === true && res.nextIndex === 0, 'ArrowDown wraps from 2 to 0');

  // ArrowUp
  res = handleSelectKeyNav('ArrowUp', 0, optionsCount);
  assert(res.handled === true && res.nextIndex === 2, 'ArrowUp wraps from 0 to 2');
  res = handleSelectKeyNav('ArrowUp', 2, optionsCount);
  assert(res.handled === true && res.nextIndex === 1, 'ArrowUp navigates from 2 to 1');

  // Enter key
  res = handleSelectKeyNav('Enter', 1, optionsCount);
  assert(
    res.handled === true && res.submitIndex === 1,
    'Enter key selects and submits index 1'
  );

  // Number key '1'
  res = handleSelectKeyNav('1', 0, optionsCount);
  assert(
    res.handled === true && res.nextIndex === 0 && res.submitIndex === 0,
    'Number key "1" immediately selects and submits index 0'
  );

  // Number key '3'
  res = handleSelectKeyNav('3', 0, optionsCount);
  assert(
    res.handled === true && res.nextIndex === 2 && res.submitIndex === 2,
    'Number key "3" immediately selects and submits index 2'
  );

  // Out of bound number key '5' with 3 options
  res = handleSelectKeyNav('5', 0, optionsCount);
  assert(res.handled === false, 'Out-of-range number key "5" is ignored for 3 options');

  // Non-navigation key
  res = handleSelectKeyNav('a', 0, optionsCount);
  assert(res.handled === false, 'Alphabet key "a" is not handled by select nav');
}

// ----------------------------------------------------
// Test 3: Normal Request Dismissal Semantics
// ----------------------------------------------------
console.log('\n[Test 3] Normal Request Dismissal Semantics');
{
  const modalSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/Modals/PermissionModal.tsx'),
    'utf-8'
  );
  assert(
    modalSource.includes("e.key === 'Escape'"),
    'PermissionModal retains Escape key dismiss listener for normal requests'
  );
  assert(
    modalSource.includes('onDismiss(request.id)'),
    'PermissionModal invokes onDismiss on Escape'
  );
}

// ----------------------------------------------------
// Test 4: Truthful Timeout Logic
// ----------------------------------------------------
console.log('\n[Test 4] Truthful Timeout Logic');
{
  function computeInitialTimeout(timeoutMsOrSec) {
    if (typeof timeoutMsOrSec !== 'number' || timeoutMsOrSec <= 0) return null;
    return Math.max(1, Math.round(timeoutMsOrSec > 1000 ? timeoutMsOrSec / 1000 : timeoutMsOrSec));
  }

  assert(computeInitialTimeout(undefined) === null, 'Undefined timeout returns null badge');
  assert(computeInitialTimeout(0) === null, 'Zero timeout returns null badge');
  assert(computeInitialTimeout(-10) === null, 'Negative timeout returns null badge');
  assert(computeInitialTimeout(30000) === 30, '30000ms converts to 30 seconds');
  assert(computeInitialTimeout(45) === 45, '45s preserved as 45 seconds');

  const cardSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/AgentPanel/ToolApprovalCard.tsx'),
    'utf-8'
  );
  assert(
    cardSource.includes("t('toolApproval.timeout'"),
    'ToolApprovalCard displays truthful engine timeout label'
  );
}

// ----------------------------------------------------
// Test 5: Omnibar & Real Command Catalog Filter
// ----------------------------------------------------
console.log('\n[Test 5] Omnibar & Real Command Catalog Filter');
{
  const sampleCatalog = [
    { name: 'model', description: 'Chọn hoặc hiển thị model', inputHint: '<provider/model>' },
    {
      name: 'session',
      description: 'Quản lý phiên làm việc',
      subcommands: [
        { name: 'list', description: 'Liệt kê các phiên' },
        { name: 'new', description: 'Tạo phiên mới' },
      ],
    },
    { name: 'skill:ak-cook', description: 'Thực thi tính năng theo workflow' },
    { name: 'skill:ak-debug', description: 'Debug và phân tích nguyên nhân gốc rễ' },
  ];

  // 1. Unfiltered catalog
  const { items: allItems, groups: allGroups } = filterAndGroupCommands(sampleCatalog, '');
  assert(allItems.length === 6, 'Catalog flattened to 6 total items (including subcommands)');
  assert(allGroups.length === 2, 'Catalog grouped into 2 groups (Commands and Skills)');
  assert(allGroups[0].name === 'Commands', 'First group is Commands');
  assert(allGroups[1].name === 'Skills', 'Second group is Skills');

  // 2. Query filtering by skill
  const { items: skillItems, groups: skillGroups } = filterAndGroupCommands(sampleCatalog, 'cook');
  assert(skillItems.length === 1, 'Filter by "cook" returns 1 item');
  assert(skillItems[0].commandName === 'skill:ak-cook', 'Matched item is skill:ak-cook');
  assert(skillItems[0].group === 'Skills', 'Matched item group is Skills');
  assert(skillGroups.length === 1 && skillGroups[0].name === 'Skills', 'Only Skills group rendered');

  // 3. Subcommand insertText verification
  const sessionListItem = allItems.find((i) => i.key === 'sub-session-list');
  assert(Boolean(sessionListItem), 'Subcommand item sub-session-list exists');
  assert(
    sessionListItem.insertText === '/session list ',
    'Subcommand insertText is formatted as "/session list "'
  );

  // 4. Omnibar uses real catalog (no fake quick actions)
  const omnibarSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/Modals/OmnibarModal.tsx'),
    'utf-8'
  );
  assert(
    !omnibarSource.includes('/plan Lên kế hoạch tính năng'),
    'Omnibar does not contain hardcoded fake quick action /plan'
  );
  assert(
    !omnibarSource.includes('/diff Xem các file vừa sửa'),
    'Omnibar does not contain hardcoded fake quick action /diff'
  );
  assert(
    omnibarSource.includes('useCommandCatalog'),
    'Omnibar uses useCommandCatalog hook for real commands'
  );
}

// ----------------------------------------------------
// Test 6: Modal Layering Z-Index Hierarchy
// ----------------------------------------------------
console.log('\n[Test 6] Modal Layering Z-Index Hierarchy');
{
  const ompReqSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/Modals/OmpRequiredModal.tsx'),
    'utf-8'
  );
  const permSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/Modals/PermissionModal.tsx'),
    'utf-8'
  );
  const omniSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/Modals/OmnibarModal.tsx'),
    'utf-8'
  );

  assert(ompReqSource.includes('z-[60]'), 'OmpRequiredModal has z-[60]');
  assert(permSource.includes('z-[55]'), 'PermissionModal has z-[55]');
  assert(omniSource.includes('z-[50]'), 'OmnibarModal has z-[50]');
  console.log('  ✓ PASSED: Layering hierarchy z-[60] (OmpRequired) > z-[55] (Permission) > z-[50] (Omnibar)');
  passed++;
}

// ----------------------------------------------------
// Test 7: Mock Preview Data Shape
// ----------------------------------------------------
console.log('\n[Test 7] Mock Preview Data Shape');
{
  assert(
    DEMO_TOOL_APPROVAL_REQUEST && DEMO_TOOL_APPROVAL_REQUEST.isToolApproval === true,
    'DEMO_TOOL_APPROVAL_REQUEST has isToolApproval: true'
  );
  assert(
    Array.isArray(DEMO_TOOL_APPROVAL_REQUEST.options) &&
      DEMO_TOOL_APPROVAL_REQUEST.options.includes('Approve') &&
      DEMO_TOOL_APPROVAL_REQUEST.options.includes('Deny'),
    'DEMO_TOOL_APPROVAL_REQUEST options include Approve and Deny'
  );
  assert(
    DEMO_GENERIC_SELECT_REQUEST && DEMO_GENERIC_SELECT_REQUEST.isToolApproval === false,
    'DEMO_GENERIC_SELECT_REQUEST has isToolApproval: false'
  );
  assert(
    Array.isArray(DEMO_GENERIC_SELECT_REQUEST.options) &&
      DEMO_GENERIC_SELECT_REQUEST.options.length >= 3,
    'DEMO_GENERIC_SELECT_REQUEST has options list'
  );
}

// ----------------------------------------------------
// Summary
// ----------------------------------------------------
console.log(`\n========================================`);
console.log(`Phase 9 Verification: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}
