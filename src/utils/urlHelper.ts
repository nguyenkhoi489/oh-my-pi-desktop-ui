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
