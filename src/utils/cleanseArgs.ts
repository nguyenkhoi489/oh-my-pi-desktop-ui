// Command line arguments utility for Cleanse Runner

export interface CleanseRunOptions {
  request?: string;
  agents?: number;
  model?: string;
  tests?: boolean;
  all?: boolean;
  cwd?: string;
}

export { stripAnsi } from '../../shared/text/strip-ansi.ts';

// Build argv parameter list for `omp cleanse`
export function buildCleanseArgs(opts?: CleanseRunOptions): string[] {
  const args = ['cleanse'];
  if (!opts) {
    args.push('--all');
    return args;
  }

  const req = opts.request?.trim();
  if (req) {
    args.push(req);
  }

  if (typeof opts.agents === 'number' && opts.agents > 0) {
    args.push('-n', String(Math.floor(opts.agents)));
  }

  if (opts.model && opts.model.trim()) {
    args.push('-m', opts.model.trim());
  }

  if (opts.tests) {
    args.push('-t');
  }

  if (opts.all) {
    args.push('--all');
  } else if (!req) {
    // Automatically enable --all when request is empty to avoid TTY prompt
    args.push('--all');
  }

  return args;
}
