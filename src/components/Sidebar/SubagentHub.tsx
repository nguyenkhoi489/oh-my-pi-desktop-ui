import React, { useState, useMemo } from 'react';
import { Bot, Cpu, Loader2 } from 'lucide-react';
import { OmpSubagentInfo } from '../../types';
import { SubagentTranscript } from '../AgentPanel/SubagentTranscript';

interface SubagentHubProps {
  subagents?: OmpSubagentInfo[];
  onSelectSubagent?: (subagent: OmpSubagentInfo) => void;
}

export const SubagentHub: React.FC<SubagentHubProps> = ({ subagents = [], onSelectSubagent }) => {
  const [selectedSubagentId, setSelectedSubagentId] = useState<string | null>(null);

  const activeSelectedSubagent = useMemo(() => {
    if (!selectedSubagentId) return null;
    return subagents.find((s) => s.id === selectedSubagentId) || { id: selectedSubagentId, agent: 'task', status: 'completed' } as OmpSubagentInfo;
  }, [selectedSubagentId, subagents]);

  if (!subagents || subagents.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col border-t border-border p-2.5 bg-panel shrink-0 max-h-[35%] overflow-hidden animate-in fade-in duration-200">
      <div className="flex items-center justify-between px-1.5 py-1 mb-1.5 text-[11px] font-bold text-slate-400 dark:text-zinc-500 tracking-wider uppercase shrink-0">
        <div className="flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5 text-codex-accent" />
          <span>Subagents</span>
        </div>
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {subagents.length} active
        </span>
      </div>

      <div className="space-y-1.5 overflow-y-auto min-h-0 flex-1 pr-0.5">
        {subagents.map((subagent) => {
          const isRunning = subagent.status === 'running' || subagent.status === 'started';
          const handleClick = () => {
            setSelectedSubagentId(subagent.id);
            onSelectSubagent?.(subagent);
          };
          return (
            <div
              key={subagent.id}
              onClick={handleClick}
              className="flex flex-col gap-1 p-2 rounded-lg bg-surface border border-border hover:border-blue-500/50 hover:bg-surface-highlight text-slate-900 dark:text-zinc-100 shadow-xs select-none cursor-pointer transition-all group"
              title="Nhấn để xem transcript chi tiết"
            >
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <Bot className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400 shrink-0" />
                  <span className="font-semibold truncate text-[12px] leading-tight">
                    {subagent.id}
                  </span>
                  {subagent.agent && subagent.agent !== subagent.id && (
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">
                      ({subagent.agent})
                    </span>
                  )}
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                    isRunning
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                      : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20'
                  }`}
                >
                  {isRunning && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                  {subagent.status}
                </span>
              </div>

              {subagent.description && subagent.description !== subagent.id && (
                <div className="text-[11.5px] text-slate-600 dark:text-zinc-300 line-clamp-2 leading-snug">
                  {subagent.description}
                </div>
              )}

              {subagent.progressText && (
                <div className="text-[11px] text-slate-400 dark:text-zinc-400 flex items-center gap-1 truncate pt-0.5">
                  <span className="w-1 h-1 rounded-full bg-blue-500 shrink-0" />
                  <span className="truncate">{subagent.progressText}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Transcript Drawer */}
      <SubagentTranscript
        subagent={activeSelectedSubagent}
        isOpen={Boolean(activeSelectedSubagent)}
        onClose={() => setSelectedSubagentId(null)}
      />
    </div>
  );
};
