import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  calculateResizedWidth,
  clampWidth,
  loadPersistedWidth,
  savePersistedWidth,
} from '../utils/resizable';

export interface UseResizableOptions {
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number | (() => number);
  storageKey?: string;
  direction?: 'left' | 'right';
}

export interface UseResizableReturn {
  width: number;
  isDragging: boolean;
  startResize: (e: React.MouseEvent) => void;
  resetWidth: () => void;
  setWidth: (width: number) => void;
}

export function useResizable({
  initialWidth = 480,
  minWidth = 340,
  maxWidth,
  storageKey = 'omp_right_sidebar_width',
  direction = 'left',
}: UseResizableOptions = {}): UseResizableReturn {
  const getResolvedMaxWidth = useCallback(() => {
    if (typeof maxWidth === 'function') {
      return maxWidth();
    }
    if (typeof maxWidth === 'number') {
      return maxWidth;
    }
    // Default: reserve at least 450px for center stage
    if (typeof window !== 'undefined') {
      return Math.max(minWidth, window.innerWidth - 450);
    }
    return 1200;
  }, [maxWidth, minWidth]);

  const [width, setWidth] = useState<number>(() =>
    loadPersistedWidth(storageKey, initialWidth, minWidth, getResolvedMaxWidth())
  );
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const startDragRef = useRef<{ startX: number; startWidth: number; resolvedMax: number }>({
    startX: 0,
    startWidth: width,
    resolvedMax: 1200,
  });
  const latestWidthRef = useRef<number>(width);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    latestWidthRef.current = width;
  }, [width]);

  // Update bounds when window resizes
  useEffect(() => {
    const handleWindowResize = () => {
      const currentMax = getResolvedMaxWidth();
      setWidth((prev) => {
        const clamped = clampWidth(prev, minWidth, currentMax);
        latestWidthRef.current = clamped;
        return clamped;
      });
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [getResolvedMaxWidth, minWidth]);

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const currentMax = getResolvedMaxWidth();
      startDragRef.current = {
        startX: e.clientX,
        startWidth: latestWidthRef.current,
        resolvedMax: currentMax,
      };

      setIsDragging(true);
    },
    [getResolvedMaxWidth]
  );

  const resetWidth = useCallback(() => {
    const resetVal = clampWidth(initialWidth, minWidth, getResolvedMaxWidth());
    latestWidthRef.current = resetVal;
    setWidth(resetVal);
    savePersistedWidth(storageKey, resetVal);
  }, [initialWidth, minWidth, getResolvedMaxWidth, storageKey]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentX = e.clientX;
      const newWidth = calculateResizedWidth({
        startWidth: startDragRef.current.startWidth,
        startX: startDragRef.current.startX,
        currentX,
        minWidth,
        maxWidth: startDragRef.current.resolvedMax,
        direction,
      });

      latestWidthRef.current = newWidth;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setWidth(newWidth);
      });
    };

    const handleMouseUp = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setIsDragging(false);
      savePersistedWidth(storageKey, latestWidthRef.current);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, minWidth, direction, storageKey]);

  return {
    width,
    isDragging,
    startResize,
    resetWidth,
    setWidth,
  };
}
