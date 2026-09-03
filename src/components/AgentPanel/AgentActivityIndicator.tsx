import React from 'react';
import { RotateCw, Zap } from 'lucide-react';
import { OmpAgentStatus, ToolCall } from '../../types';
import { useI18n } from '../../i18n/I18nProvider';

interface AgentActivityIndicatorProps {
  status: OmpAgentStatus;
  activeToolCalls?: ToolCall[];
}

// Render agent activity status strip right above composer
const AgentActivityIndicatorComponent: React.FC<AgentActivityIndicatorProps> = ({
  status,
  activeToolCalls,
}) => {
  const { t } = useI18n();
  if (status === 'idle' || status === 'waiting_permission') return null;

  const runningTool =
    activeToolCalls?.find((t) => t.status === 'running') ||
    activeToolCalls?.[activeToolCalls.length - 1];

  let icon: React.ReactNode;
  let label: string;
  let tone: string;

  switch (status) {
    case 'thinking':
      icon = <span className="w-2 h-2 rounded-full bg-codex-500 animate-pulse" />;
      label = t('activity.thinking');
      tone = 'text-codex-500 dark:text-codex-400';
      break;
    case 'executing_tool':
      icon = <RotateCw className="w-3.5 h-3.5 animate-spin text-blue-500" />;
      label = runningTool ? t('activity.runningToolNamed', { name: runningTool.name }) : t('activity.runningTool');
      tone = 'text-blue-600 dark:text-blue-400';
      break;
    case 'streaming':
      icon = <Zap className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />;
      label = t('activity.generating');
      tone = 'text-emerald-600 dark:text-emerald-400';
      break;
    default:
      return null;
  }

  return (
    <div className="px-4 py-2 border-t border-border bg-surface/60 flex items-center gap-2 shrink-0 animate-fade-in">
      <span className="flex items-center justify-center w-4 shrink-0">{icon}</span>
      <span className={`text-xs font-medium truncate ${tone}`}>{label}</span>
    </div>
  );
};

export const AgentActivityIndicator = React.memo(AgentActivityIndicatorComponent);
