// Utilities for commit message and argument flags in Commit Assistant

export interface CommitRunOptions {
  dryRun?: boolean;
  context?: string;
  model?: string;
  push?: boolean;
  noChangelog?: boolean;
  legacy?: boolean;
  editedMessage?: string;
  cwd?: string;
}

// Strip ANSI escape codes from string
export function stripAnsi(text: string): string {
  if (!text) return '';
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

// Build argv parameter list for `omp commit`
export function buildCommitArgs(opts: CommitRunOptions, dryRun: boolean): string[] {
  const args = ['commit'];
  if (dryRun) {
    args.push('--dry-run');
  } else if (opts.push) {
    args.push('--push');
  }
  if (opts.noChangelog) {
    args.push('--no-changelog');
  }
  if (opts.legacy) {
    args.push('--legacy');
  }
  if (opts.context && opts.context.trim()) {
    args.push('-c', opts.context.trim());
  }
  if (opts.model && opts.model.trim()) {
    args.push('-m', opts.model.trim());
  }
  return args;
}

// Extract proposed commit message from omp commit output
export function parseCommitMessage(output: string): string {
  if (!output) return '';
  const clean = stripAnsi(output);

  // Priority 1 marker: "Generated commit message:"
  const genMarker = 'Generated commit message:';
  const genIdx = clean.indexOf(genMarker);
  if (genIdx !== -1) {
    const messagePart = clean.slice(genIdx + genMarker.length).trim();
    if (messagePart) {
      return messagePart;
    }
  }

  // Priority 2 marker: "● Proposed commit:"
  const propMarker = '● Proposed commit:';
  const propIdx = clean.indexOf(propMarker);
  if (propIdx !== -1) {
    const after = clean.slice(propIdx + propMarker.length);
    const lines = after.split('\n');
    const msgLines: string[] = [];
    let capturing = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('●') || trimmed.startsWith('')) {
        if (capturing) break;
        continue;
      }
      if (!capturing && trimmed) {
        capturing = true;
      }
      if (capturing) {
        msgLines.push(line.startsWith('  ') ? line.slice(2) : line);
      }
    }
    const result = msgLines.join('\n').trim();
    if (result) {
      return result;
    }
  }

  return clean.trim();
}
