/**
 * Verification Suite: HeaderBar Layout & Responsive Overflow Protection
 * 
 * Verifies that HeaderBar maintains all controls visible without overflowing,
 * overlapping, or getting pushed off-screen when the agent is busy or idle,
 * eliminating noisy badges (Idle) and redundant text labels (Copilot).
 */

import fs from 'node:fs';
import path from 'node:path';

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

console.log('=== Starting HeaderBar Layout & Overflow Protection Verification ===\n');

const headerBarPath = path.resolve('src/components/HeaderBar.tsx');
assert(fs.existsSync(headerBarPath), 'src/components/HeaderBar.tsx exists');
const headerCode = fs.readFileSync(headerBarPath, 'utf8');

// ----------------------------------------------------
// Test 1: Header Container Layout & Dropdown Elevation
// ----------------------------------------------------
console.log('[Test 1] Header container has min-w-0 and relative z-30 for dropdown elevation');
{
  assert(
    /<header[^>]*min-w-0/.test(headerCode) && /<header[^>]*z-30/.test(headerCode),
    'Header element contains min-w-0 and z-30 to prevent container blowout while allowing dropdown popups'
  );
}

// ----------------------------------------------------
// Test 2: Right Section Protection & Icon-Only Copilot
// ----------------------------------------------------
console.log('[Test 2] Right section controls have shrink-0 protection and icon-only Copilot');
{
  assert(
    headerCode.includes('{/* Right: Right Sidebar Toggle, Theme Toggle & Quick Action ⌘K */}'),
    'Right section comment anchor exists'
  );
  assert(
    headerCode.includes('app-no-drag shrink-0'),
    'Right section flex container has shrink-0'
  );
  assert(headerCode.includes('PanelRightClose'), 'Right section includes Copilot toggle');
  assert(headerCode.includes('onToggleTheme'), 'Right section includes theme toggle');
  assert(headerCode.includes('onOpenOmnibar'), 'Right section includes Omnibar ⌘K button');
  assert(headerCode.includes('onOpenSettingsModal'), 'Right section includes settings button');

  // Verify Copilot button does not render redundant text label (icon only)
  const copilotBtnRegex = /<button[^>]*onClick=\{onToggleRightSidebar\}[^>]*>([\s\S]*?)<\/button>/;
  const match = headerCode.match(copilotBtnRegex);
  assert(match, 'Copilot toggle button located');
  assert(!match[1].includes('>Copilot<'), 'Copilot button is icon-only without redundant text');
}

// ----------------------------------------------------
// Test 3: Center Section Flexible Shrink & Truncation
// ----------------------------------------------------
console.log('[Test 3] Center section has min-w-0, flex-1, and bounded items');
{
  assert(
    headerCode.includes('flex-1 flex items-center justify-center') &&
    headerCode.includes('min-w-0'),
    'Center section flex container is configured with flex-1 and min-w-0 to prevent overlapping'
  );
  assert(
    headerCode.includes('max-w-[90px] sm:max-w-[130px] lg:max-w-[160px] truncate'),
    'Active model name has responsive truncation'
  );
  assert(
    headerCode.includes('max-w-[70px] sm:max-w-[90px] lg:max-w-[120px]'),
    'Approval mode label has responsive truncation'
  );
}

// ----------------------------------------------------
// Test 4: Status Badge (Active badges only, no Idle noise)
// ----------------------------------------------------
console.log('[Test 4] Status badges show active states only; Idle badge removed');
{
  assert(
    headerCode.includes('Thinking (AST / LSP)...') && headerCode.includes('Thinking...'),
    'Thinking badge has responsive short and long variants'
  );
  assert(
    headerCode.includes('Executing Tool') && headerCode.includes('Running...'),
    'Executing Tool badge has responsive short and long variants'
  );
  assert(
    headerCode.includes('Generating Response') && headerCode.includes('Generating...'),
    'Streaming badge has responsive short and long variants'
  );

  // Verify Idle badge is removed (default returns null)
  assert(
    /default:\s*return null;/.test(headerCode),
    'getStatusBadge returns null for idle status, eliminating visual noise'
  );
}

// ----------------------------------------------------
// Test 5: Context Meter & Tok/s Responsive Layout
// ----------------------------------------------------
console.log('[Test 5] Context usage meter & tokens/s display cleanly');
{
  assert(
    headerCode.includes('tok/s') && headerCode.includes('/s'),
    'Tokens per second badge adapts to tight horizontal spacing'
  );
  assert(
    headerCode.includes('xl:inline') && headerCode.includes('sm:inline xl:hidden'),
    'Context usage meter uses tiered responsive widths'
  );
}

// ----------------------------------------------------
// Test 6: Left Section Protection
// ----------------------------------------------------
console.log('[Test 6] Left section has shrink-0 and min-w-0');
{
  assert(
    headerCode.includes('{/* Left: Project Folder Picker, Sidebar Toggle & OMP Status */}'),
    'Left section comment anchor exists'
  );
  assert(
    headerCode.includes('gap-2 lg:gap-2.5 app-no-drag shrink-0 min-w-0'),
    'Left section container has shrink-0 and min-w-0'
  );
}

console.log(`\n====================================================`);
console.log(`HeaderBar Layout Verification: ${passed} passed, ${failed} failed.`);
console.log(`====================================================\n`);

if (failed > 0) {
  process.exit(1);
}
