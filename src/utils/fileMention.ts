import type { WorkspaceFile } from '../types/index.ts';

export function buildMessageWithFileMentions(text: string, files: string[]): string {
  const trimmed = text.trim();
  const uniqueFiles = Array.from(
    new Set(files.map((f) => f.trim()).filter((f) => f.length > 0))
  );

  if (uniqueFiles.length === 0) {
    return trimmed;
  }

  const tokensToAppend: string[] = [];
  for (const file of uniqueFiles) {
    const token = `@${file}`;
    if (!trimmed.includes(token)) {
      tokensToAppend.push(token);
    }
  }

  if (tokensToAppend.length === 0) {
    return trimmed;
  }

  return trimmed ? `${trimmed} ${tokensToAppend.join(' ')}` : tokensToAppend.join(' ');
}

export function flattenWorkspaceFiles(tree: WorkspaceFile[]): WorkspaceFile[] {
  const result: WorkspaceFile[] = [];
  const traverse = (items: WorkspaceFile[]) => {
    for (const item of items) {
      if (!item.isDirectory) {
        result.push(item);
      }
      if (item.children && item.children.length > 0) {
        traverse(item.children);
      }
    }
  };
  traverse(tree);
  return result;
}
