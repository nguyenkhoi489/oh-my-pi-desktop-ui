import { tm } from '../shared/i18n/index.ts';

// chrome: is only used to open chrome://extensions from the browser relay guide
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'chrome:']);

export type ExternalUrlValidation =
  | { valid: true; url: string }
  | { valid: false; error: string };

// Reject anything but http(s)/chrome before shell.openExternal
export function validateExternalUrl(url: unknown): ExternalUrlValidation {
  if (typeof url !== 'string' || !url.trim()) {
    return { valid: false, error: tm('electron.main.invalidUrl') };
  }
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return { valid: false, error: tm('electron.main.unsupportedProtocol', { protocol: parsed.protocol }) };
    }
    return { valid: true, url: trimmed };
  } catch {
    return { valid: false, error: tm('electron.main.invalidUrl') };
  }
}
