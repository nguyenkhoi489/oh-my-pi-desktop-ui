import type { WorkspaceFile, ArtifactDocument, ArtifactType } from '../types/index.ts';

export const MAX_WORKSPACE_ARTIFACTS = 50;

const IGNORED_DIRS: Record<string, true> = {
  node_modules: true,
  '.git': true,
  dist: true,
  build: true,
  out: true,
  'dist-electron': true,
  release: true,
  '.next': true,
  '.agentkit': true,
  '.agents': true,
  '.claude': true,
  '.omp': true,
  '.github': true,
  '.vscode': true,
  coverage: true,
};

type ArtifactBucket = 'docs' | 'plans' | 'root' | 'other';

function normalizePath(relativePath: string): string {
  return relativePath.toLowerCase().replace(/\\/g, '/');
}

// Nhận diện loại artifact từ đường dẫn tương đối
export function detectArtifactType(relativePath: string): ArtifactType | null {
  const normalized = normalizePath(relativePath);
  const filename = normalized.split('/').pop() || '';

  if (normalized.endsWith('.html') || normalized.endsWith('.htm')) {
    return 'html';
  }

  if (normalized.endsWith('.svg')) {
    return 'svg';
  }

  if (normalized.endsWith('.md') || normalized.endsWith('.markdown')) {
    const isPlanFile = filename === 'plan.md' || /^phase-\d+/.test(filename);
    if (normalized.startsWith('plans/') || normalized.includes('/plans/') || isPlanFile) {
      return 'plan';
    }
    return 'markdown';
  }

  return null;
}

function bucketOf(relativePath: string): ArtifactBucket {
  const normalized = normalizePath(relativePath);
  if (normalized.startsWith('docs/')) return 'docs';
  if (normalized.startsWith('plans/')) return 'plans';
  if (!normalized.includes('/')) return 'root';
  return 'other';
}

// Tách và loại bỏ khối YAML frontmatter ở đầu markdown
export function stripMarkdownFrontmatter(content: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(content);
  return match ? content.slice(match[0].length) : content;
}

function isDatedPlan(title: string): boolean {
  return /^plans\/\d/.test(normalizePath(title));
}

// Plan có prefix ngày xếp trước và mới nhất lên đầu; journals/reports/templates xếp sau
function comparePlans(a: ArtifactDocument, b: ArtifactDocument): number {
  const datedA = isDatedPlan(a.title);
  const datedB = isDatedPlan(b.title);
  if (datedA !== datedB) return datedA ? -1 : 1;
  return datedA ? b.title.localeCompare(a.title) : a.title.localeCompare(b.title);
}

// Quét cây thư mục và trích xuất danh sách artifact
export function discoverWorkspaceArtifacts(
  tree: WorkspaceFile[],
  maxCount: number = MAX_WORKSPACE_ARTIFACTS
): ArtifactDocument[] {
  const buckets: Record<ArtifactBucket, ArtifactDocument[]> = {
    docs: [],
    plans: [],
    root: [],
    other: [],
  };

  function traverse(nodes: WorkspaceFile[]) {
    for (const node of nodes) {
      if (node.isDirectory) {
        if (!IGNORED_DIRS[node.name] && node.children && node.children.length > 0) {
          traverse(node.children);
        }
        continue;
      }

      const relPath = node.relativePath || node.name;
      const type = detectArtifactType(relPath);
      if (!type) continue;

      buckets[bucketOf(relPath)].push({
        id: `ws-${relPath.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        title: relPath,
        type,
        content: '',
        path: node.path,
        isLoaded: false,
        description: `Workspace: ${relPath}`,
        language: type === 'html' ? 'html' : type === 'svg' ? 'xml' : 'markdown',
      });
    }
  }

  traverse(tree);

  const byTitle = (a: ArtifactDocument, b: ArtifactDocument) => a.title.localeCompare(b.title);
  buckets.docs.sort(byTitle);
  buckets.root.sort(byTitle);
  buckets.other.sort(byTitle);
  buckets.plans.sort(comparePlans);

  // Giữ chỗ cho docs/root/other trước, phần còn lại dành cho plans mới nhất
  const nonPlans = [...buckets.docs, ...buckets.root, ...buckets.other].slice(0, maxCount);
  const keptPlans = buckets.plans.slice(0, Math.max(0, maxCount - nonPlans.length));
  const kept = new Set([...nonPlans, ...keptPlans]);

  return [...buckets.docs, ...buckets.plans, ...buckets.root, ...buckets.other].filter((a) => kept.has(a));
}
