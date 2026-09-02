/**
 * Verification Suite: Workspace Artifacts & Plan Dynamic Hydration
 *
 * Verifies:
 * 1. detectArtifactType:
 *    - Recognizes .html / .htm as 'html'
 *    - Recognizes .svg as 'svg'
 *    - Recognizes plans markdown and phase-*.md as 'plan'
 *    - Recognizes other .md files as 'markdown'
 *    - Rejects non-artifact files (.ts, .json, .css, etc.)
 * 2. discoverWorkspaceArtifacts:
 *    - Correctly discovers files from nested workspace tree
 *    - Ignores node_modules, .git, dist, build, .agentkit
 *    - Sorts with priority: docs/ -> plans/ -> root -> other
 *    - Generates unique clean IDs and proper metadata
 *    - Respects MAX_WORKSPACE_ARTIFACTS cap, keeps non-plan files and newest plans
 *    - stripMarkdownFrontmatter removes leading YAML block only
 * 3. Type contracts and invariants
 */

import { detectArtifactType, discoverWorkspaceArtifacts, stripMarkdownFrontmatter, MAX_WORKSPACE_ARTIFACTS } from '../src/utils/artifactDiscovery.ts';

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

async function runVerification() {
  console.log('=== Starting Workspace Artifacts Dynamic Hydration Verification ===\n');

  // ----------------------------------------------------
  // Test 1: detectArtifactType classification
  // ----------------------------------------------------
  console.log('[Test 1] detectArtifactType classification...');

  assert(detectArtifactType('docs/architecture-overview.html') === 'html', 'docs/*.html classified as html');
  assert(detectArtifactType('public/index.htm') === 'html', '*.htm classified as html');
  assert(detectArtifactType('assets/diagram.svg') === 'svg', '*.svg classified as svg');
  assert(detectArtifactType('plans/260902-1955/plan.md') === 'plan', 'plans/**/plan.md classified as plan');
  assert(detectArtifactType('plans/phase-01-init.md') === 'plan', 'plans/phase-*.md classified as plan');
  assert(detectArtifactType('src/features/phase-02.md') === 'plan', 'phase-*.md anywhere classified as plan');
  assert(detectArtifactType('docs/README.md') === 'markdown', 'docs/README.md classified as markdown');
  assert(detectArtifactType('README.md') === 'markdown', 'root README.md classified as markdown');
  assert(detectArtifactType('docs/planning-notes.md') === 'markdown', 'planning-notes.md is not a plan');
  assert(detectArtifactType('docs/phases.md') === 'markdown', 'phases.md without number is not a plan');
  assert(detectArtifactType('src/App.tsx') === null, 'tsx file returns null');
  assert(detectArtifactType('package.json') === null, 'json file returns null');
  assert(detectArtifactType('styles/main.css') === null, 'css file returns null');

  // ----------------------------------------------------
  // Test 2: discoverWorkspaceArtifacts tree traversal
  // ----------------------------------------------------
  console.log('\n[Test 2] discoverWorkspaceArtifacts tree traversal...');

  const mockTree = [
    {
      name: 'docs',
      path: '/workspace/docs',
      relativePath: 'docs',
      isDirectory: true,
      children: [
        {
          name: 'architecture-overview.html',
          path: '/workspace/docs/architecture-overview.html',
          relativePath: 'docs/architecture-overview.html',
          isDirectory: false,
        },
        {
          name: 'guide.md',
          path: '/workspace/docs/guide.md',
          relativePath: 'docs/guide.md',
          isDirectory: false,
        },
      ],
    },
    {
      name: 'plans',
      path: '/workspace/plans',
      relativePath: 'plans',
      isDirectory: true,
      children: [
        {
          name: 'plan.md',
          path: '/workspace/plans/plan.md',
          relativePath: 'plans/plan.md',
          isDirectory: false,
        },
        {
          name: 'phase-01-core.md',
          path: '/workspace/plans/phase-01-core.md',
          relativePath: 'plans/phase-01-core.md',
          isDirectory: false,
        },
      ],
    },
    {
      name: 'node_modules',
      path: '/workspace/node_modules',
      relativePath: 'node_modules',
      isDirectory: true,
      children: [
        {
          name: 'ignored.html',
          path: '/workspace/node_modules/pkg/ignored.html',
          relativePath: 'node_modules/pkg/ignored.html',
          isDirectory: false,
        },
      ],
    },
    {
      name: '.agents',
      path: '/workspace/.agents',
      relativePath: '.agents',
      isDirectory: true,
      children: [
        {
          name: 'SKILL.md',
          path: '/workspace/.agents/skills/git/SKILL.md',
          relativePath: '.agents/skills/git/SKILL.md',
          isDirectory: false,
        },
        {
          name: 'plan.md',
          path: '/workspace/.agents/plan.md',
          relativePath: '.agents/plan.md',
          isDirectory: false,
        },
      ],
    },
    {
      name: '.claude',
      path: '/workspace/.claude',
      relativePath: '.claude',
      isDirectory: true,
      children: [
        {
          name: 'notes.md',
          path: '/workspace/.claude/notes.md',
          relativePath: '.claude/notes.md',
          isDirectory: false,
        },
      ],
    },
    {
      name: 'README.md',
      path: '/workspace/README.md',
      relativePath: 'README.md',
      isDirectory: false,
    },
    {
      name: 'logo.svg',
      path: '/workspace/logo.svg',
      relativePath: 'logo.svg',
      isDirectory: false,
    },
  ];

  const artifacts = discoverWorkspaceArtifacts(mockTree);
  assert(Array.isArray(artifacts), 'discoverWorkspaceArtifacts returns an array');
  assert(artifacts.length === 6, `Expected 6 artifacts, got ${artifacts.length}`);

  // Check that node_modules files were ignored
  assert(!artifacts.some((a) => a.title.includes('node_modules')), 'node_modules files must be ignored');

  // Check that tooling dot-folders were ignored
  assert(!artifacts.some((a) => a.title.startsWith('.agents/')), '.agents files must be ignored');
  assert(!artifacts.some((a) => a.title.startsWith('.claude/')), '.claude files must be ignored');

  // Check priority sorting: docs/ before plans/ before root
  const firstDocIndex = artifacts.findIndex((a) => a.title.startsWith('docs/'));
  const firstPlanIndex = artifacts.findIndex((a) => a.title.startsWith('plans/'));
  const firstRootIndex = artifacts.findIndex((a) => !a.title.includes('/'));

  assert(firstDocIndex < firstPlanIndex, 'docs/ artifacts sorted before plans/');
  assert(firstPlanIndex < firstRootIndex, 'plans/ artifacts sorted before root artifacts');

  // Verify structure of discovered items
  const archArtifact = artifacts.find((a) => a.title === 'docs/architecture-overview.html');
  assert(Boolean(archArtifact), 'docs/architecture-overview.html found in artifacts');
  assert(archArtifact.type === 'html', 'docs/architecture-overview.html has type html');
  assert(archArtifact.isLoaded === false, 'Discovered artifact initially has isLoaded = false');
  assert(archArtifact.path === '/workspace/docs/architecture-overview.html', 'Artifact carries correct absolute path');
  assert(archArtifact.id === 'ws-docs_architecture-overview_html', 'Artifact has clean sanitized id');

  // ----------------------------------------------------
  // Test 3: Cap limits (Scale discipline)
  // ----------------------------------------------------
  console.log('\n[Test 3] Scale discipline and cap bounds...');

  assert(typeof MAX_WORKSPACE_ARTIFACTS === 'number' && MAX_WORKSPACE_ARTIFACTS > 0, 'MAX_WORKSPACE_ARTIFACTS exported');
  
  // Generate 100 fake items
  const largeTree = [];
  for (let i = 0; i < 100; i++) {
    largeTree.push({
      name: `item-${i}.html`,
      path: `/workspace/item-${i}.html`,
      relativePath: `item-${i}.html`,
      isDirectory: false,
    });
  }

  const capped = discoverWorkspaceArtifacts(largeTree, 25);
  assert(capped.length === 25, `discoverWorkspaceArtifacts respects custom maxCount (25), got ${capped.length}`);

  const defaultCapped = discoverWorkspaceArtifacts(largeTree);
  assert(defaultCapped.length === MAX_WORKSPACE_ARTIFACTS, `discoverWorkspaceArtifacts respects default maxCount (${MAX_WORKSPACE_ARTIFACTS})`);

  // Workspace with many plans: root/docs files must survive, newest plans win
  const planChildren = [];
  for (let i = 0; i < 80; i++) {
    const day = String(i).padStart(2, '0');
    planChildren.push({
      name: `plan.md`,
      path: `/workspace/plans/2609${day}-feature/plan.md`,
      relativePath: `plans/2609${day}-feature/plan.md`,
      isDirectory: false,
    });
  }
  const manyPlansTree = [
    { name: 'plans', path: '/workspace/plans', relativePath: 'plans', isDirectory: true, children: planChildren },
    { name: 'plans-extra', path: '/workspace/plans/journals', relativePath: 'plans/journals', isDirectory: true, children: [
      { name: 'day-1.md', path: '/workspace/plans/journals/day-1.md', relativePath: 'plans/journals/day-1.md', isDirectory: false },
    ] },
    { name: 'docs', path: '/workspace/docs', relativePath: 'docs', isDirectory: true, children: [
      { name: 'overview.html', path: '/workspace/docs/overview.html', relativePath: 'docs/overview.html', isDirectory: false },
    ] },
    { name: 'README.md', path: '/workspace/README.md', relativePath: 'README.md', isDirectory: false },
    { name: 'assets', path: '/workspace/assets', relativePath: 'assets', isDirectory: true, children: [
      { name: 'logo.svg', path: '/workspace/assets/logo.svg', relativePath: 'assets/logo.svg', isDirectory: false },
    ] },
  ];
  const manyPlans = discoverWorkspaceArtifacts(manyPlansTree, 20);
  assert(manyPlans.length === 20, `cap applies with many plans, got ${manyPlans.length}`);
  assert(manyPlans.some((a) => a.title === 'README.md'), 'root README.md survives cap when plans overflow');
  assert(manyPlans.some((a) => a.title === 'assets/logo.svg'), 'other-dir svg survives cap when plans overflow');
  assert(manyPlans[0].title === 'docs/overview.html', 'docs/ still listed first');
  assert(manyPlans[1].title === 'plans/260979-feature/plan.md', 'newest plan listed first among plans');
  assert(!manyPlans.some((a) => a.title === 'plans/260900-feature/plan.md'), 'oldest plan dropped by cap');
  const planTitles = manyPlans.filter((a) => a.title.startsWith('plans/')).map((a) => a.title);
  assert(planTitles.length === 17, `plans fill remaining slots after non-plan files, got ${planTitles.length}`);
  assert(!planTitles.includes('plans/journals/day-1.md'), 'undated plans/ subfolders rank after dated plans');
  const wideCap = discoverWorkspaceArtifacts(manyPlansTree, 200);
  const wideTitles = wideCap.map((a) => a.title);
  assert(wideTitles.indexOf('plans/journals/day-1.md') > wideTitles.indexOf('plans/260900-feature/plan.md'), 'undated plans listed after oldest dated plan');

  // ----------------------------------------------------
  // Test 4: Markdown frontmatter stripping
  // ----------------------------------------------------
  console.log('\n[Test 4] stripMarkdownFrontmatter...');

  const withFm = '---\nphase: 1\ntitle: "X"\n---\n# Heading\nBody';
  assert(stripMarkdownFrontmatter(withFm) === '# Heading\nBody', 'leading YAML frontmatter removed');
  assert(stripMarkdownFrontmatter('# Heading\n---\nrule') === '# Heading\n---\nrule', 'content without frontmatter untouched');
  assert(stripMarkdownFrontmatter('---\r\na: 1\r\n---\r\nBody') === 'Body', 'CRLF frontmatter removed');
  assert(stripMarkdownFrontmatter('') === '', 'empty content stays empty');

  console.log(`\n🎉 All ${passed} tests passed successfully!`);
}

runVerification().catch((err) => {
  console.error('\n❌ Verification suite failed:', err);
  process.exit(1);
});
