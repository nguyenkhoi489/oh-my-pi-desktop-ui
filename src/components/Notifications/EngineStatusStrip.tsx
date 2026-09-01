import React, { useState } from 'react';
import { Activity, ChevronDown, ChevronRight, Terminal } from 'lucide-react';
import { OmpEngineStatusEntry, OmpWidgetEntry } from '../../types';

interface EngineStatusStripProps {
  statuses?: OmpEngineStatusEntry[];
  widgets?: OmpWidgetEntry[];
}

export const EngineStatusStrip: React.FC<EngineStatusStripProps> = ({
  statuses = [],
  widgets = [],
}) => {
  const [collapsedWidgets, setCollapsedWidgets] = useState<Record<string, boolean>>({});

  const hasStatuses = statuses.length > 0;
  const hasWidgets = widgets.length > 0;

  if (!hasStatuses && !hasWidgets) {
    return null;
  }

  const toggleWidget = (key: string) => {
    setCollapsedWidgets((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 bg-surface/60 border-t border-border select-none shrink-0 animate-in fade-in duration-150">
      {/* 1. Status Entries (setStatus) */}
      {hasStatuses && (
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-1 text-[11px] font-medium text-slate-400 dark:text-zinc-500 mr-0.5 shrink-0">
            <Activity className="w-3.5 h-3.5 text-codex-accent animate-pulse" />
            <span className="uppercase text-[10px] tracking-wider font-semibold">Status:</span>
          </div>

          {statuses.map((item) => (
            <div
              key={item.key}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-highlight border border-border text-[11px] text-slate-700 dark:text-zinc-300 max-w-full"
            >
              {item.key !== 'default' && (
                <span className="font-semibold text-slate-500 dark:text-zinc-400 font-mono text-[10px]">
                  {item.key}:
                </span>
              )}
              <span className="truncate">{item.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* 2. Widget Blocks (setWidget) */}
      {hasWidgets && (
        <div className="space-y-1">
          {widgets.map((widget) => {
            const isCollapsed = Boolean(collapsedWidgets[widget.key]);
            return (
              <div
                key={widget.key}
                className="rounded-md border border-border bg-panel overflow-hidden text-[11px]"
              >
                <button
                  type="button"
                  onClick={() => toggleWidget(widget.key)}
                  className="w-full flex items-center justify-between px-2 py-1 bg-surface hover:bg-surface-highlight text-slate-600 dark:text-zinc-300 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-1.5 font-mono text-[10px] font-medium text-slate-500 dark:text-zinc-400 truncate">
                    <Terminal className="w-3 h-3 text-codex-accent shrink-0" />
                    <span>{widget.key}</span>
                    <span className="text-slate-400 dark:text-zinc-500">
                      ({widget.lines.length} lines)
                    </span>
                  </div>
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                </button>

                {!isCollapsed && (
                  <div className="p-2 font-mono text-[10.5px] leading-relaxed max-h-28 overflow-y-auto bg-black/5 dark:bg-black/30 text-slate-800 dark:text-zinc-200 divide-y divide-border/30">
                    {widget.lines.map((line, idx) => (
                      <div key={idx} className="whitespace-pre-wrap py-0.5">
                        {line}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
