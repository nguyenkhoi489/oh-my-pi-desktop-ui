import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ListTodo,
  CheckCircle2,
  Circle,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import type { OmpTodoPhase, OmpTodoItem, OmpTodoStatus } from '../../types';
import { useI18n } from '../../i18n/I18nProvider';

interface TodoPanelProps {
  phases?: OmpTodoPhase[];
  todos?: OmpTodoItem[];
}

// Map todo status to icon and display style
function renderTodoStatusIcon(status: OmpTodoStatus) {
  switch (status) {
    case 'done':
    case 'completed':
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />;
    case 'in_progress':
    case 'active':
      return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0 mt-0.5" />;
    case 'blocked':
      return <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />;
    case 'cancelled':
    case 'dropped':
      return <XCircle className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0 mt-0.5" />;
    case 'pending':
    default:
      return <Circle className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0 mt-0.5" />;
  }
}

// Style text according to todo status
function getTodoTextStyle(status: OmpTodoStatus): string {
  switch (status) {
    case 'done':
    case 'completed':
      return 'text-slate-400 dark:text-zinc-500 line-through';
    case 'in_progress':
    case 'active':
      return 'text-slate-900 dark:text-zinc-100 font-medium';
    case 'blocked':
      return 'text-amber-700 dark:text-amber-400';
    case 'cancelled':
    case 'dropped':
      return 'text-slate-400 dark:text-zinc-600 line-through';
    case 'pending':
    default:
      return 'text-slate-700 dark:text-zinc-300';
  }
}

const TodoPanelComponent: React.FC<TodoPanelProps> = ({ phases = [], todos = [] }) => {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const activeTaskRef = useRef<HTMLDivElement | null>(null);
  // Normalize phases and tasks list
  const normalizedPhases = useMemo<OmpTodoPhase[]>(() => {
    if (Array.isArray(phases) && phases.length > 0) {
      return phases.filter((p) => Array.isArray(p.tasks) && p.tasks.length > 0);
    }
    if (Array.isArray(todos) && todos.length > 0) {
      const phaseMap = new Map<string, OmpTodoItem[]>();
      for (const todoItem of todos) {
        const name = typeof todoItem.phase === 'string' && todoItem.phase ? todoItem.phase : t('todos.title');
        if (!phaseMap.has(name)) {
          phaseMap.set(name, []);
        }
        phaseMap.get(name)!.push(todoItem);
      }
      return Array.from(phaseMap.entries()).map(([name, tasks]) => ({
        name,
        tasks,
      }));
    }
    return [];
  }, [phases, todos]);

  // Count total tasks and completed tasks
  const { totalTasks, completedTasks, inProgressCount } = useMemo(() => {
    let total = 0;
    let completed = 0;
    let inProgress = 0;

    for (const phase of normalizedPhases) {
      for (const task of phase.tasks) {
        total++;
        if (task.status === 'done' || task.status === 'completed') {
          completed++;
        } else if (task.status === 'in_progress' || task.status === 'active') {
          inProgress++;
        }
      }
    }

    return { totalTasks: total, completedTasks: completed, inProgressCount: inProgress };
  }, [normalizedPhases]);

  // Auto-scroll to active task when expanded
  useEffect(() => {
    if (isExpanded && inProgressCount > 0 && activeTaskRef.current) {
      activeTaskRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isExpanded, inProgressCount]);

  if (normalizedPhases.length === 0 || totalTasks === 0) {
    return null;
  }

  const progressPercentage = Math.round((completedTasks / totalTasks) * 100);

  return (
    <div className="border-b border-border bg-surface/80 backdrop-blur-sm shrink-0 select-none">
      {/* Todo progress bar header */}
      <div
        onClick={() => setIsExpanded((prev) => !prev)}
        className="px-3.5 py-2 flex items-center justify-between cursor-pointer hover:bg-surface-highlight/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ListTodo className="w-4 h-4 text-codex-accent shrink-0" />
          <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 truncate">
            {t('todos.progress')}
          </span>
          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-surface-highlight font-mono font-medium text-slate-600 dark:text-zinc-400">
            {completedTasks}/{totalTasks}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Progress bar mini */}
          <div className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-zinc-700 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <button
            type="button"
            className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
            aria-label={isExpanded ? t('todos.collapse') : t('todos.expand')}
          >
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded phases and tasks list */}
      {isExpanded && (
        <div className="px-3.5 pb-2.5 pt-0.5 max-h-48 overflow-y-auto space-y-2 border-t border-border/40 text-xs">
          {normalizedPhases.map((phase, pIdx) => (
            <div key={`phase-${pIdx}-${phase.name}`} className="space-y-1">
              {normalizedPhases.length > 1 && (
                <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider pt-1">
                  {phase.name}
                </div>
              )}
              <div className="space-y-1">
                {phase.tasks.map((task, tIdx) => {
                  const isActive = task.status === 'in_progress' || task.status === 'active';
                  return (
                    <div
                      key={`task-${pIdx}-${tIdx}-${task.id || task.content}`}
                      ref={isActive ? activeTaskRef : undefined}
                      className={`flex items-start gap-2 py-1 px-1.5 rounded-md transition-colors ${
                        isActive
                          ? 'bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-800/40'
                          : 'hover:bg-surface-highlight/40'
                      }`}
                    >
                      {renderTodoStatusIcon(task.status)}
                      <div className="flex-1 min-w-0">
                        <span className={`text-[12px] leading-snug break-words ${getTodoTextStyle(task.status)}`}>
                          {task.content}
                        </span>
                        {task.reason && (
                          <div className="text-[11px] text-amber-600 dark:text-amber-400/90 mt-0.5 italic">
                            {t('todos.reason', { reason: task.reason })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const TodoPanel = React.memo(TodoPanelComponent);
