// Utilities for calculating resizable sidebar dimensions

export interface CalculateResizeOptions {
  startWidth: number;
  startX: number;
  currentX: number;
  minWidth: number;
  maxWidth: number;
  direction?: 'left' | 'right';
}

/**
 * Clamp width between [minWidth, maxWidth]
 */
export function clampWidth(width: number, minWidth: number, maxWidth: number): number {
  const safeMax = Math.max(minWidth, maxWidth);
  return Math.min(Math.max(width, minWidth), safeMax);
}

/**
 * Calculate new width based on start position and current mouse cursor
 */
export function calculateResizedWidth({
  startWidth,
  startX,
  currentX,
  minWidth,
  maxWidth,
  direction = 'left',
}: CalculateResizeOptions): number {
  // For right sidebar, moving cursor left (startX > currentX) expands width
  const delta = direction === 'left' ? startX - currentX : currentX - startX;
  const rawWidth = startWidth + delta;
  return clampWidth(rawWidth, minWidth, maxWidth);
}

/**
 * Read persisted width from localStorage
 */
export function loadPersistedWidth(
  storageKey: string | undefined,
  defaultWidth: number,
  minWidth: number,
  maxWidth: number
): number {
  if (!storageKey || typeof window === 'undefined' || !window.localStorage) {
    return clampWidth(defaultWidth, minWidth, maxWidth);
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return clampWidth(defaultWidth, minWidth, maxWidth);
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return clampWidth(parsed, minWidth, maxWidth);
    }
  } catch {
    // Ignore localStorage read errors
  }

  return clampWidth(defaultWidth, minWidth, maxWidth);
}

/**
 * Save width to localStorage
 */
export function savePersistedWidth(storageKey: string | undefined, width: number): void {
  if (!storageKey || typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, String(Math.round(width)));
  } catch {
    // Ignore localStorage write errors
  }
}
