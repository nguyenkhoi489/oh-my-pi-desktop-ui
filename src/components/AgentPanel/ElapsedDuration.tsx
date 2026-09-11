import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { formatDuration } from '../../utils/timeFormat';

interface ElapsedDurationProps {
  turnStartedAt?: number | null;
  className?: string;
}

// Leaf component tu quan ly timer 200ms ma khong lam re-render cha
export const ElapsedDuration = React.memo<ElapsedDurationProps>(({
  turnStartedAt,
  className = 'flex items-center gap-1 text-[11px] font-mono text-slate-400 dark:text-zinc-500',
}) => {
  const [elapsed, setElapsed] = useState<number>(0);

  useEffect(() => {
    if (!turnStartedAt || turnStartedAt <= 0) {
      setElapsed(0);
      return;
    }

    setElapsed(Math.max(0, Date.now() - turnStartedAt));
    const timer = setInterval(() => {
      setElapsed(Math.max(0, Date.now() - turnStartedAt));
    }, 200);

    return () => clearInterval(timer);
  }, [turnStartedAt]);

  if (!turnStartedAt || turnStartedAt <= 0) return null;

  return (
    <span className={className}>
      <Clock className="w-3 h-3 shrink-0" />
      <span>{formatDuration(elapsed)}</span>
    </span>
  );
});
