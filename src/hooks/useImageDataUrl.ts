import { useEffect, useState } from 'react';

const dataUrlCache = new Map<string, string>();

const isDirectlyRenderable = (src: string): boolean =>
  /^(blob:|data:|https?:)/.test(src);

// Resolve image path on disk to data URL via IPC (preserves blob:/data:/http)
export function useImageDataUrl(src: string): string {
  const [resolved, setResolved] = useState<string>(() => {
    if (!src) return '';
    if (isDirectlyRenderable(src)) return src;
    return dataUrlCache.get(src) || '';
  });

  useEffect(() => {
    if (!src) {
      setResolved('');
      return;
    }
    if (isDirectlyRenderable(src)) {
      setResolved(src);
      return;
    }
    const cached = dataUrlCache.get(src);
    if (cached) {
      setResolved(cached);
      return;
    }

    let cancelled = false;
    setResolved('');
    window.electronAPI
      ?.readImageAsDataUrl?.(src)
      .then((res) => {
        if (cancelled) return;
        if (res?.success && res.dataUrl) {
          dataUrlCache.set(src, res.dataUrl);
          setResolved(res.dataUrl);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [src]);

  return resolved;
}
