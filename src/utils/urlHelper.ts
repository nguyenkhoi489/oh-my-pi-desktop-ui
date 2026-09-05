/**
 * URL normalization and safety utilities for In-App Browser.
 */

const SAFE_PROTOCOLS: Record<string, true> = {
  'http:': true,
  'https:': true,
  'about:': true,
};

const DANGEROUS_SCHEMES: readonly string[] = [
  'javascript:',
  'file:',
  'data:',
  'vbscript:',
];

/**
 * Checks whether a given URL string uses a safe protocol.
 * Only http:, https:, and about:blank are considered safe.
 */
export function isSafeUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed === 'about:blank') return true;

  try {
    const parsed = new URL(trimmed);
    return Boolean(SAFE_PROTOCOLS[parsed.protocol]);
  } catch {
    return false;
  }
}

/**
 * Normalizes user input into a valid, safe URL for the In-App Browser.
 * - Empty string -> about:blank
 * - Localhost or loopback IPs -> http://...
 * - Valid domains or URLs -> https://... or preserved http(s)
 * - Queries or unresolvable strings -> Google search
 * - Dangerous schemes (javascript:, file:, data:) -> sanitized via search
 */
export function normalizeUrl(input: string): string {
  if (!input || typeof input !== 'string') {
    return 'about:blank';
  }

  const trimmed = input.trim();
  if (!trimmed || trimmed === 'about:blank') {
    return 'about:blank';
  }

  // Check for dangerous schemes
  const lower = trimmed.toLowerCase();
  for (const dangerous of DANGEROUS_SCHEMES) {
    if (lower.startsWith(dangerous)) {
      return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
    }
  }

  // Check if input already has a scheme
  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme === 'http' || scheme === 'https') {
      try {
        new URL(trimmed);
        return trimmed;
      } catch {
        return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
      }
    }
    // Any other custom/unknown scheme -> route to search for safety
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }

  // Localhost, 127.0.0.1, 0.0.0.0, [::1] (with optional port and path)
  const isLocalhost =
    /^localhost(:\d+)?(\/.*)?$/i.test(trimmed) ||
    /^(127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/.*)?$/i.test(trimmed);

  if (isLocalhost) {
    return `http://${trimmed}`;
  }

  // Check if input looks like a domain name (contains a dot and valid TLD, or host:port, without whitespace)
  const hasWhitespace = /\s/.test(trimmed);
  const isDomainLike =
    !hasWhitespace &&
    /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+(:\d+)?(\/.*)?$/.test(
      trimmed
    );

  if (isDomainLike) {
    return `https://${trimmed}`;
  }

  // Fallback to search query
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

const COMMON_FILE_EXTENSIONS: Record<string, true> = {
  md: true, markdown: true, mdown: true, mkd: true,
  txt: true, text: true, log: true, rtf: true,
  ts: true, tsx: true, js: true, jsx: true, mjs: true, cjs: true,
  json: true, jsonl: true, jsonc: true, yaml: true, yml: true, toml: true, xml: true, csv: true, tsv: true,
  html: true, htm: true, css: true, scss: true, sass: true, less: true,
  py: true, pyw: true, rb: true, go: true, rs: true, c: true, cpp: true, h: true, hpp: true, cs: true, java: true, kt: true, swift: true,
  sh: true, bash: true, zsh: true, fish: true, bat: true, cmd: true, ps1: true,
  sql: true, graphql: true, gql: true, proto: true, env: true,
  png: true, jpg: true, jpeg: true, gif: true, svg: true, webp: true, bmp: true, ico: true,
  pdf: true, zip: true, tar: true, gz: true,
};
/**
 * Determines if an input target is a local file rather than a web URL.
 */
export function isLocalFileTarget(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  const trimmed = input.trim();
  if (!trimmed || trimmed === '#' || trimmed.startsWith('#')) return false;

  // 1. Explicit file:// protocol
  if (/^file:\/\//i.test(trimmed)) return true;

  // 2. Localhost URL prefixing local file paths (e.g. http://localhost:5173/Users/...)
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/(Users|home|private|var|tmp|[a-zA-Z]:)\//i.test(trimmed)) {
    return true;
  }

  // 3. Web or standard protocols (http, https, mailto, tel, etc.)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) || trimmed.startsWith('//') || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) {
    return false;
  }

  // 4. POSIX absolute path: /Users/..., /home/..., /tmp/...
  if (trimmed.startsWith('/')) {
    return true;
  }

  // 5. Windows absolute path: C:\... or C:/...
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return true;
  }

  // 6. Relative path containing directory traversal
  if (trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return true;
  }

  // 7. Path ending with a known file extension (ignoring query/hash)
  const cleanPath = trimmed.split('?')[0].split('#')[0];
  const extMatch = cleanPath.match(/\.([a-zA-Z0-9_-]+)$/);
  if (extMatch && COMMON_FILE_EXTENSIONS[extMatch[1].toLowerCase()]) {
    return true;
  }

  return false;
}

/**
 * Extracts clean filesystem path from file://, localhost-prefixed path, or raw path.
 */
export function extractFilePath(input: string): string | null {
  if (!isLocalFileTarget(input)) return null;
  const trimmed = input.trim();

  // Strip file:// prefix
  if (/^file:\/\//i.test(trimmed)) {
    const withoutScheme = trimmed.replace(/^file:\/\//i, '');
    try {
      const decoded = decodeURIComponent(withoutScheme);
      // Windows file:///C:/path -> C:/path
      return decoded.replace(/^\/([a-zA-Z]:)/, '$1');
    } catch {
      return withoutScheme.replace(/^\/([a-zA-Z]:)/, '$1');
    }
  }

  // Strip localhost URL prefix if it points to filesystem path
  const localhostMatch = trimmed.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)$/i);
  if (localhostMatch) {
    const rawPath = localhostMatch[3];
    try {
      return decodeURIComponent(rawPath);
    } catch {
      return rawPath;
    }
  }

  // Plain filesystem path
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

/**
 * Converts a filesystem path into standard file:/// URI format.
 */
export function toFileUrl(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') return 'about:blank';
  const trimmed = filePath.trim();
  if (/^file:\/\//i.test(trimmed)) return trimmed;

  const clean = extractFilePath(trimmed) || trimmed;
  if (clean.startsWith('/')) {
    return `file://${clean}`;
  }
  return `file:///${clean}`;
}
