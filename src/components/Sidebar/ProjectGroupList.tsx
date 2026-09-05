import React, { useState, useMemo } from 'react';
import {
  Folder,
  FolderGit2,
  ChevronDown,
  ChevronRight,
  Plus,
  Pin,
  Trash2,
  MessageSquare,
  LoaderCircle,
  FolderPlus,
  Download,
} from 'lucide-react';
import { ProjectItem, OmpSessionInfo, OmpAgentStatus } from '../../types';
import { formatRelativeTime } from './ThreadList';
import { useI18n } from '../../i18n/I18nProvider';

export interface RuntimeStateSnapshot {
  runtimeId: string;
  projectId: string;
  sessionPath?: string;
  status: OmpAgentStatus;
  attention?: boolean;
  lastActiveAt?: number;
}

export interface ProjectGroupListProps {
  projects: ProjectItem[];
  activeProjectId?: string | null;
  activeProjectPath?: string | null;
  sessions: OmpSessionInfo[];
  activeSessionPath?: string | null;
  activeSessionName?: string;
  currentStatus?: OmpAgentStatus;
  runtimeStates?: Record<string, RuntimeStateSnapshot>;
  onSelectProject?: (project: ProjectItem) => void;
  onAddProject?: () => void;
  onRemoveProject?: (id: string) => void;
  onTogglePinProject?: (id: string) => void;
  onSelectSession?: (sessionPath: string, projectId?: string) => void;
  onNewSession?: (projectId?: string) => void;
  onDeleteSession?: (path: string) => Promise<boolean>;
  onRenameSession?: (name: string) => Promise<boolean>;
  onExportSession?: () => Promise<unknown>;
}

export const ProjectGroupList: React.FC<ProjectGroupListProps> = React.memo(({
  projects,
  activeProjectId,
  activeProjectPath,
  sessions,
  activeSessionPath,
  activeSessionName,
  currentStatus = 'idle',
  runtimeStates = {},
  onSelectProject,
  onAddProject,
  onRemoveProject,
  onTogglePinProject,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onExportSession,
}) => {
  const { t } = useI18n();
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});

  const toggleCollapse = (projectId: string) => {
    setCollapsedProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  // Group sessions by projectId or projectPath
  const groupedSessions = useMemo(() => {
    const map = new Map<string, OmpSessionInfo[]>();
    const unassigned: OmpSessionInfo[] = [];

    // Initialize map for existing projects
    for (const project of projects) {
      map.set(project.id, []);
    }

    for (const session of sessions) {
      let matchedProjectId: string | undefined = session.projectId;

      if (!matchedProjectId && session.projectPath) {
        const found = projects.find((p) => p.path === session.projectPath);
        if (found) matchedProjectId = found.id;
      }

      if (!matchedProjectId) {
        for (const project of projects) {
          const sanitizedDoubleDash = project.path.replace(/^[\\/]/, '').replace(/[\\/]/g, '--');
          const sanitizedSingleDash = project.path.replace(/[\\/]/g, '-');
          const homeRelativeDash = project.path.replace(/^(\/Users\/[^/]+|\/home\/[^/]+)/, '').replace(/[\\/]/g, '-');
          const projectName = project.path.split(/[\\/]/).filter(Boolean).pop();

          if (
            session.path.includes(project.path) ||
            session.path.includes(sanitizedDoubleDash) ||
            session.path.includes(sanitizedSingleDash) ||
            (homeRelativeDash && session.path.includes(homeRelativeDash)) ||
            (projectName && session.path.includes(`-${projectName}`))
          ) {
            matchedProjectId = project.id;
            break;
          }
        }
      }

      if (!matchedProjectId && (session.active || activeSessionPath === session.path) && activeProjectId) {
        matchedProjectId = activeProjectId;
      } else if (!matchedProjectId && activeProjectPath) {
        const sanitizedActive = activeProjectPath.replace(/^[\\/]/, '').replace(/[\\/]/g, '--');
        const homeRelativeActive = activeProjectPath.replace(/^(\/Users\/[^/]+|\/home\/[^/]+)/, '').replace(/[\\/]/g, '-');
        if (
          session.path.includes(activeProjectPath) ||
          session.path.includes(sanitizedActive) ||
          (homeRelativeActive && session.path.includes(homeRelativeActive))
        ) {
          matchedProjectId = activeProjectId || undefined;
        }
      }
      if (matchedProjectId && map.has(matchedProjectId)) {
        map.get(matchedProjectId)!.push(session);
      } else {
        unassigned.push(session);
      }
    }

    return { map, unassigned };
  }, [projects, sessions, activeProjectId, activeProjectPath]);

  // Determine session status (active engine or background runtime)
  const getSessionStatus = (session: OmpSessionInfo) => {
    const isActiveSession = activeSessionPath === session.path;

    if (isActiveSession && currentStatus !== 'idle') {
      return { isRunning: true, attention: false, status: currentStatus };
    }

    // Check background runtimes
    for (const rt of Object.values(runtimeStates)) {
      if (rt.sessionPath === session.path) {
        const isBusy = rt.status === 'thinking' || rt.status === 'streaming' || rt.status === 'executing_tool';
        return {
          isRunning: isBusy,
          attention: Boolean(rt.attention),
          status: rt.status,
        };
      }
    }

    return { isRunning: false, attention: false, status: 'idle' as OmpAgentStatus };
  };

  return (
    <div className="flex flex-col border-t border-border p-2 bg-panel shrink-0 select-none overflow-y-auto max-h-[50%]">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-2 py-1 mb-1 text-[11px] font-bold text-slate-400 dark:text-zinc-500 tracking-wider uppercase shrink-0">
        <div className="flex items-center gap-1.5">
          <FolderGit2 className="w-3.5 h-3.5" />
          <span>{t('projects.title')}</span>
        </div>
        {onAddProject && (
          <button
            type="button"
            onClick={onAddProject}
            className="p-1 rounded-md hover:bg-surface-highlight text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
            title={t('projects.add')}
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Project Trees */}
      <div className="space-y-1">
        {projects.map((project) => {
          const isCollapsed = Boolean(collapsedProjects[project.id]);
          const projectSessions = groupedSessions.map.get(project.id) || [];
          const isActiveProject = activeProjectId === project.id || activeProjectPath === project.path;

          return (
            <div key={project.id} className="flex flex-col rounded-md overflow-hidden">
              {/* Project Header Row */}
              <div
                className={`group flex items-center justify-between px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                  isActiveProject
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium'
                    : 'text-slate-700 dark:text-zinc-300 hover:bg-surface-highlight'
                }`}
                onClick={() => {
                  onSelectProject?.(project);
                }}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCollapse(project.id);
                    }}
                    className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <Folder className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-zinc-500" />
                  <span className="truncate">{project.name}</span>

                  {project.pinned && (
                    <Pin className="w-2.5 h-2.5 text-amber-500 fill-amber-500 shrink-0" />
                  )}
                </div>

                {/* Project Actions */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {onNewSession && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNewSession(project.id);
                      }}
                      className="p-1 rounded hover:bg-surface text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
                      title={t('projects.newSession')}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}

                  {onTogglePinProject && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePinProject(project.id);
                      }}
                      className="p-1 rounded hover:bg-surface text-slate-400 hover:text-amber-500"
                      title={project.pinned ? t('projects.unpin') : t('projects.pin')}
                    >
                      <Pin className="w-3 h-3" />
                    </button>
                  )}

                  {onRemoveProject && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveProject(project.id);
                      }}
                      className="p-1 rounded hover:bg-surface text-slate-400 hover:text-rose-500"
                      title={t('projects.remove')}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Child Sessions */}
              {!isCollapsed && (
                <div className="pl-4 pr-1 py-0.5 space-y-0.5 border-l border-border/40 ml-3">
                  {projectSessions.length === 0 ? (
                    <div className="px-2 py-1 text-[11px] text-slate-400 dark:text-zinc-500 italic">
                      {t('threads.noSessions')}
                    </div>
                  ) : (
                    projectSessions.map((session) => {
                      const isActiveSession = activeSessionPath === session.path;
                      const { isRunning, attention } = getSessionStatus(session);
                      const title = (isActiveSession && activeSessionName) || session.title || 'New Session';

                      return (
                        <div
                          key={session.path}
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelectSession?.(session.path, project.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectSession?.(session.path, project.id);
                            }
                          }}
                          className={`w-full text-left px-2 py-1 rounded flex items-center justify-between text-xs transition-colors group cursor-pointer ${
                            isActiveSession
                              ? 'bg-surface-highlight text-slate-900 dark:text-zinc-100 font-medium'
                              : 'text-slate-600 dark:text-zinc-400 hover:bg-surface-highlight/60 hover:text-slate-800 dark:hover:text-zinc-200'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {isRunning ? (
                              <LoaderCircle className="w-3 h-3 text-blue-500 animate-spin shrink-0" />
                            ) : attention ? (
                              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                            ) : (
                              <MessageSquare className="w-3 h-3 text-slate-400 shrink-0" />
                            )}
                            <span className="truncate text-[11.5px]">{title}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 ml-1 text-[10px] text-slate-400">
                            {isRunning ? (
                              <span className="text-blue-500 font-mono text-[9.5px]">
                                {t('projects.running')}
                              </span>
                            ) : (
                              <span>{formatRelativeTime(session.updatedAt)}</span>
                            )}
                            {onExportSession && isActiveSession && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onExportSession();
                                }}
                                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-highlight text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 transition-opacity cursor-pointer"
                                title={t('threads.exportHtmlTooltip')}
                              >
                                <Download className="w-3 h-3" />
                              </button>
                            )}
                            {onDeleteSession && !isActiveSession && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteSession(session.path);
                                }}
                                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition-opacity cursor-pointer"
                                title={t('threads.delete')}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Unassigned / Active Fallback Session (Chi hien thi neu la session dang chat trong cua so hien tai) */}
        {groupedSessions.unassigned.filter((s) => s.path === activeSessionPath).length > 0 && (
          <div className="pt-1">
            <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {t('projects.otherSessions')}
            </div>
            <div className="space-y-0.5 pl-1">
              {groupedSessions.unassigned.filter((s) => s.path === activeSessionPath).map((session) => {
                const isActiveSession = activeSessionPath === session.path;
                const { isRunning, attention } = getSessionStatus(session);
                const title = (isActiveSession && activeSessionName) || session.title || 'New Session';

                return (
                  <div
                    key={session.path}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectSession?.(session.path)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectSession?.(session.path);
                      }
                    }}
                    className={`w-full text-left px-2 py-1 rounded flex items-center justify-between text-xs transition-colors group cursor-pointer ${
                      isActiveSession
                        ? 'bg-surface-highlight text-slate-900 dark:text-zinc-100 font-medium'
                        : 'text-slate-600 dark:text-zinc-400 hover:bg-surface-highlight/60'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {isRunning ? (
                        <LoaderCircle className="w-3 h-3 text-blue-500 animate-spin shrink-0" />
                      ) : attention ? (
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                      ) : (
                        <MessageSquare className="w-3 h-3 text-slate-400 shrink-0" />
                      )}
                      <span className="truncate text-[11.5px]">{title}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-1 text-[10px] text-slate-400">
                      <span>{formatRelativeTime(session.updatedAt)}</span>
                      {onExportSession && isActiveSession && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onExportSession();
                          }}
                          className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-highlight text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 transition-opacity cursor-pointer"
                          title={t('threads.exportHtmlTooltip')}
                        >
                          <Download className="w-3 h-3" />
                        </button>
                      )}
                      {onDeleteSession && !isActiveSession && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSession(session.path);
                          }}
                          className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition-opacity cursor-pointer"
                          title={t('threads.delete')}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
