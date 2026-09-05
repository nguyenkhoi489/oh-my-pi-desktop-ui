import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { HeaderBar } from './components/HeaderBar';
import { ProjectTree } from './components/Sidebar/ProjectTree';
import { ProjectGroupList } from './components/Sidebar/ProjectGroupList';
import { SubagentHub } from './components/Sidebar/SubagentHub';
import { CanvasContainer } from './components/Canvas/CanvasContainer';
import { AgentPanel } from './components/AgentPanel/AgentPanel';
import { OmnibarModal } from './components/Modals/OmnibarModal';
import { PermissionModal } from './components/Modals/PermissionModal';
import { OmpRequiredModal } from './components/Modals/OmpRequiredModal';
import { SettingsModal } from './components/Modals/SettingsModal';
import { ToastStack } from './components/Notifications/ToastStack';
import { useOmpRpc } from './hooks/useOmpRpc';
import { useWorkspace } from './hooks/useWorkspace';
import { ThemeMode, FileDiffItem, WorkspaceFile, InspectorTab, ProjectItem, GitStatusResult, ChatFileAttachment } from './types';
import { InspectorPanel } from './components/Inspector/InspectorPanel';
import { OpsModal } from './components/Modals/OpsModal';
import { CommitModal } from './components/Modals/CommitModal';
import { useI18n } from './i18n/I18nProvider';
import { UnsavedChangesModal } from './components/Canvas/UnsavedChangesModal';
import { SessionStatsPanel } from './components/HeaderBar/SessionStatsPanel';
import { useResizable } from './hooks/useResizable';

export function App() {
  const [theme, setTheme] = useState<ThemeMode>('light');
  const { t } = useI18n();
  const [isOmnibarOpen, setIsOmnibarOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isStatsPanelOpen, setIsStatsPanelOpen] = useState<boolean>(false);
  const [isOmpModalOpen, setIsOmpModalOpen] = useState<boolean>(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState<boolean>(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState<boolean>(false);
  const {
    width: rightSidebarWidth,
    isDragging: isRightSidebarDragging,
    startResize: startRightSidebarResize,
    resetWidth: resetRightSidebarWidth,
  } = useResizable({
    initialWidth: 480,
    minWidth: 340,
    storageKey: 'omp_right_sidebar_width',
    direction: 'left',
  });
  type SidebarOrigin = 'manual' | 'manual_closed' | 'auto_diff' | 'auto_browser' | 'auto_subagent' | null;
  const sidebarOriginRef = useRef<SidebarOrigin>(null);
  const userClosedInspectorRef = useRef<boolean>(false);
  const prevActiveDiffRef = useRef<FileDiffItem | null>(null);
  const prevHasActiveSubagentsRef = useRef<boolean>(false);
  const [centerView, setCenterView] = useState<'chat' | 'workbench'>('chat');
  const [rightSidebarView, setRightSidebarView] = useState<'agent' | 'inspector'>('inspector');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('changes');
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [gitStatus, setGitStatus] = useState<GitStatusResult | null>(null);
  const [browserUrl, setBrowserUrl] = useState<string>('http://localhost:5173');
  const [browserUrlNonce, setBrowserUrlNonce] = useState<number>(0);

  const handleOpenBrowser = useCallback((targetUrl: string) => {
    if (targetUrl) {
      setBrowserUrl(targetUrl);
      setBrowserUrlNonce((prev) => prev + 1);
    }
    setCenterView('chat');
    setIsRightSidebarOpen(true);
    setRightSidebarView('inspector');
    setInspectorTab('browser');
    sidebarOriginRef.current = 'auto_browser';
  }, []);

  // Handle open browser requests from in-app links or electron host window
  useEffect(() => {
    const handleOpenInAppBrowserEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ url?: string }>;
      if (customEvent.detail?.url) {
        handleOpenBrowser(customEvent.detail.url);
      }
    };
    window.addEventListener('omp:open-in-app-browser', handleOpenInAppBrowserEvent);
    return () => window.removeEventListener('omp:open-in-app-browser', handleOpenInAppBrowserEvent);
  }, [handleOpenBrowser]);

  useEffect(() => {
    if (!window.electronAPI?.onOpenInAppBrowser) return;
    return window.electronAPI.onOpenInAppBrowser((url) => {
      handleOpenBrowser(url);
    });
  }, [handleOpenBrowser]);

  // Keyboard shortcut: Cmd+Shift+B opens Browser tab in Inspector
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsRightSidebarOpen(true);
        setRightSidebarView('inspector');
        setInspectorTab('browser');
        sidebarOriginRef.current = 'manual';
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  // Sync theme class on HTML root element
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
  }, [theme]);

  const [isOpsModalOpen, setIsOpsModalOpen] = useState(false);
  const [opsModalInitialTab, setOpsModalInitialTab] = useState<'engine' | 'processes' | 'worktrees' | 'extensions' | 'agents' | 'storage' | 'ssh' | 'grievances'>('engine');
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false);
  const [isEditorDirty, setIsEditorDirty] = useState<boolean>(false);
  const [editorDraftContent, setEditorDraftContent] = useState<string | null>(null);
  const [pendingFileToSelect, setPendingFileToSelect] = useState<WorkspaceFile | null>(null);
  const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState<boolean>(false);
  // Load initial theme from settings
  useEffect(() => {
    const initSettings = async () => {
      try {
        if (window.electronAPI?.getSettings) {
          const settings = await window.electronAPI.getSettings();
          if (settings?.theme) {
            setTheme(settings.theme);
          }
        } else {
          const raw = localStorage.getItem('omp_settings');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.theme) {
              setTheme(parsed.theme);
            }
          } else {
            const legacy = localStorage.getItem('omp_theme');
            if (legacy === 'light' || legacy === 'dark') {
              setTheme(legacy);
            }
          }
        }
      } catch (err) {
        console.warn('[App] Failed to load initial settings:', err);
      }
    };
    initSettings();
  }, []);

  const handleThemeChange = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    if (window.electronAPI?.setSettings) {
      window.electronAPI.setSettings({ theme: newTheme }).catch(() => {});
    } else {
      try {
        const raw = localStorage.getItem('omp_settings');
        const obj = raw ? JSON.parse(raw) : {};
        localStorage.setItem('omp_settings', JSON.stringify({ ...obj, theme: newTheme }));
        localStorage.setItem('omp_theme', newTheme);
      } catch {}
    }
  };

  const toggleTheme = () => {
    handleThemeChange(theme === 'light' ? 'dark' : 'light');
  };

  const toggleLeftSidebar = () => {
    setIsLeftSidebarOpen((prev) => !prev);
  };

  const toggleRightSidebar = () => {
    setIsRightSidebarOpen((prev) => {
      const next = !prev;
      if (!next) {
        userClosedInspectorRef.current = true;
        sidebarOriginRef.current = 'manual_closed';
      } else {
        userClosedInspectorRef.current = false;
        sidebarOriginRef.current = 'manual';
      }
      return next;
    });
  };

  // Stable callbacks to avoid breaking React.memo of ProjectTree/AgentPanel
  const collapseRightSidebar = useCallback(() => {
    userClosedInspectorRef.current = true;
    sidebarOriginRef.current = 'manual_closed';
    setIsRightSidebarOpen(false);
  }, []);
  const handleCloseInspector = useCallback(() => {
    userClosedInspectorRef.current = true;
    sidebarOriginRef.current = 'manual_closed';
    setIsRightSidebarOpen(false);
  }, []);

  const {
    status,
    installStatus,
    isCheckingInstall,
    checkInstallation,
    setCustomPath,
    browseBinaryFile,
    messages,
    currentThinking,
    activeToolCalls,
    currentStreamText,
    activeDiff,
    activeUiRequest,
    uiRequestQueue,
    respondUiSelect,
    respondUiConfirm,
    respondUiInput,
    dismissUiRequest,
    availableModels,
    selectedModel,
    thinkingLevel,
    changeModel,
    changeThinkingLevel,
    refreshModels,
    refreshEngineState,
    sessions,
    activeSessionPath,
    refreshSessions,
    switchSession,
    newSession,
    branchFromMessage,
    renameSession,
    deleteSession,
    exportSession,
    engineState,
    subagents,
    sendMessage,
    steer,
    abortAndPrompt,
    followUpQueue,
    followUp,
    acceptDiff,
    rejectDiff,
    notifications,
    dismissNotification,
    pushNotification,
    engineStatuses,
    engineWidgets,
    contextUsage,
    tokensPerSecond,
    getSessionStats,
    getGlobalUsage,
    getGlobalStats,
    getUsageHistory,
    getUsageClients,
    invalidateUsage,
    startStatsDashboard,
    stopStatsDashboard,
    getStatsDashboardStatus,
    openExternal,
    getEngineConfig,
    setEngineConfigValue,
    resetEngineConfigValue,
    getEngineConfigPath,
    approvalMode,
    setApprovalMode,
    compact,
    isCompacting,
    autoCompactionEnabled,
    setAutoCompaction,
    availableCommands,
    todoPhases,
    todos,
    retryState,
    abortRetry,
    repairSession,
    getLastAssistantText,
    listSshHosts,
    addSshHost,
    removeSshHost,
    listGrievances,
    cleanGrievances,
    pushGrievances,
    isSpeaking,
    startSay,
    stopSay,
    activeRuntimeId,
    runtimeStates,
    switchRuntime,
    resetChat,
  } = useOmpRpc();

  // Principle #1: When app loads, if OMP is not installed, open the Requirement Modal
  useEffect(() => {
    if (installStatus && !installStatus.installed) {
      setIsOmpModalOpen(true);
    } else if (installStatus?.installed) {
      setIsOmpModalOpen(false);
    }
  }, [installStatus]);

  // 1. Theo doi su kien activeDiff de auto-open va auto-collapse
  useEffect(() => {
    const hadDiff = !!prevActiveDiffRef.current;
    const hasDiff = !!activeDiff;
    prevActiveDiffRef.current = activeDiff;

    if (hasDiff && !hadDiff) {
      // Co diff moi -> tu dong mo Changes tab neu user chua chu dong dong
      if (sidebarOriginRef.current !== 'manual_closed') {
        setIsRightSidebarOpen(true);
        setRightSidebarView('inspector');
        setInspectorTab('changes');
        sidebarOriginRef.current = 'auto_diff';
      }
    } else if (!hasDiff && hadDiff) {
      // Diff da duyet xong hoac da clear -> neu he thong tu mo thi tu dong thu gon
      if (sidebarOriginRef.current === 'auto_diff') {
        setIsRightSidebarOpen(false);
        sidebarOriginRef.current = null;
      }
    }
  }, [activeDiff]);

  // 2. Theo doi su kien subagents de auto-open va auto-collapse
  useEffect(() => {
    const hasActiveSubagents = Array.isArray(subagents) && subagents.some(
      (s) => s.status === 'running' || s.status === 'started'
    );
    const hadActiveSubagents = prevHasActiveSubagentsRef.current;
    prevHasActiveSubagentsRef.current = hasActiveSubagents;

    if (hasActiveSubagents && !hadActiveSubagents) {
      // Subagent bat dau chay -> tu dong mo Subagents tab neu user chua chu dong dong
      if (sidebarOriginRef.current !== 'manual_closed' && !activeDiff) {
        setIsRightSidebarOpen(true);
        setRightSidebarView('inspector');
        setInspectorTab('subagents');
        sidebarOriginRef.current = 'auto_subagent';
      }
    } else if (!hasActiveSubagents && hadActiveSubagents) {
      // Subagents da hoan tat -> neu la auto_subagent va khong co diff thi tu dong thu gon sau 1.2s
      if (sidebarOriginRef.current === 'auto_subagent' && !activeDiff) {
        const timer = setTimeout(() => {
          setIsRightSidebarOpen((isOpen) => {
            if (sidebarOriginRef.current === 'auto_subagent') {
              sidebarOriginRef.current = null;
              return false;
            }
            return isOpen;
          });
        }, 1200);
        return () => clearTimeout(timer);
      }
    }
  }, [subagents, activeDiff]);

  // 3. Reset co manual_closed khi engine tro ve idle hoan toan
  useEffect(() => {
    if (status === 'idle' && !activeDiff && (!subagents || subagents.length === 0)) {
      if (sidebarOriginRef.current === 'manual_closed') {
        sidebarOriginRef.current = null;
        userClosedInspectorRef.current = false;
      }
    }
  }, [status, activeDiff, subagents]);

  const handleProcessStarted = useCallback(async () => {
    await resetChat(false);
    refreshEngineState();
    refreshModels();
    refreshSessions();
  }, [resetChat, refreshEngineState, refreshModels, refreshSessions]);
  const handleSpeakLastAssistantText = useCallback(async () => {
    if (isSpeaking) {
      await stopSay();
      return;
    }
    const text = await getLastAssistantText();
    if (!text || !text.trim()) {
      pushNotification(t('tts.empty'), 'info');
      return;
    }
    const res = await startSay(text);
    if (!res.success) {
      if (res.missingModel) {
        pushNotification(
          t('tts.missingModel'),
          'warning',
          {
            label: t('tts.openOpsCenter'),
            onClick: () => {
              setOpsModalInitialTab('engine');
              setIsOpsModalOpen(true);
            },
          }
        );
      } else {
        pushNotification(res.error || t('tts.error'), 'error');
      }
    }
  }, [isSpeaking, stopSay, getLastAssistantText, pushNotification, startSay, t]);

  const handleStopSpeaking = useCallback(async () => {
    await stopSay();
  }, [stopSay]);


  const {
    workspacePath,
    workspaceName,
    files,
    selectedFile,
    fileContent,
    activeTab,
    setActiveTab,
    artifacts,
    selectedArtifactId,
    selectArtifact,
    reloadArtifact,
    invalidateArtifactByPath,
    openFolderDialog,
    selectFile,
    refreshFiles,
    saveFileContent,
  } = useWorkspace({
    onProcessStarted: handleProcessStarted,
  });

  const handleSelectFileWithGuard = useCallback((file: WorkspaceFile) => {
    if (file.isDirectory) return;
    if (selectedFile?.path === file.path) return;

    if (isEditorDirty) {
      setPendingFileToSelect(file);
      setIsUnsavedModalOpen(true);
    } else {
      selectFile(file);
      setCenterView('workbench');
      setActiveTab('editor');
    }
  }, [isEditorDirty, selectedFile, selectFile, setActiveTab]);

  const handleSaveAndContinue = useCallback(async () => {
    if (selectedFile) {
      const contentToSave = editorDraftContent ?? fileContent;
      if (contentToSave !== null) {
        await saveFileContent(selectedFile.path, contentToSave);
      }
    }
    setIsEditorDirty(false);
    setEditorDraftContent(null);
    setIsUnsavedModalOpen(false);
    if (pendingFileToSelect) {
      selectFile(pendingFileToSelect);
      setPendingFileToSelect(null);
      setCenterView('workbench');
      setActiveTab('editor');
    }
  }, [selectedFile, editorDraftContent, fileContent, saveFileContent, pendingFileToSelect, selectFile, setActiveTab]);

  const handleDiscardAndContinue = useCallback(() => {
    setIsEditorDirty(false);
    setEditorDraftContent(null);
    setIsUnsavedModalOpen(false);
    if (pendingFileToSelect) {
      selectFile(pendingFileToSelect);
      setPendingFileToSelect(null);
      setCenterView('workbench');
      setActiveTab('editor');
    }
  }, [pendingFileToSelect, selectFile]);

  const handleCancelSwitchFile = useCallback(() => {
    setPendingFileToSelect(null);
    setIsUnsavedModalOpen(false);
  }, []);
  const loadProjects = useCallback(async () => {
    if (window.electronAPI?.listProjects) {
      try {
        const res = await window.electronAPI.listProjects();
        if (res.success && res.projects) {
          setProjects(res.projects);
          refreshSessions();
        }
      } catch (err) {
        console.warn('[App] Failed to load projects:', err);
      }
    }
  }, [refreshSessions]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Sync active workspace into projects catalog
  useEffect(() => {
    if (workspacePath && window.electronAPI?.addProject) {
      window.electronAPI.addProject(workspacePath, workspaceName).then((res) => {
        if (res.success) {
          loadProjects();
        }
      }).catch(() => {});
    }
  }, [workspacePath, workspaceName, loadProjects]);

  const refreshGitStatus = useCallback(async () => {
    if (workspacePath && window.electronAPI?.getCommitStatus) {
      try {
        const res = await window.electronAPI.getCommitStatus(workspacePath);
        setGitStatus(res);
      } catch (err) {
        console.warn('[App] Failed to fetch git status:', err);
      }
    } else {
      setGitStatus(null);
    }
  }, [workspacePath]);

  useEffect(() => {
    refreshGitStatus();
  }, [refreshGitStatus, status, activeDiff]);

  const [isFloatingDismissed, setIsFloatingDismissed] = useState<boolean>(false);

  useEffect(() => {
    setIsFloatingDismissed(false);
  }, [activeDiff]);

  // Floating changes card reflects active pending session diffs (gitStatus used for branch & commits)
  const floatingChanges = useMemo(() => {
    if (isFloatingDismissed || !activeDiff) {
      return null;
    }

    const count = 1;
    const insertions = activeDiff.additions || 0;
    const deletions = activeDiff.deletions || 0;

    if (count <= 0 && insertions <= 0 && deletions <= 0) {
      return null;
    }

    return {
      filesChanged: count,
      insertions,
      deletions,
      onReview: () => {
        setIsRightSidebarOpen(true);
        setRightSidebarView('inspector');
        setInspectorTab('changes');
        sidebarOriginRef.current = 'manual';
      },
      onDismiss: () => {
        setIsFloatingDismissed(true);
      },
    };
  }, [activeDiff, isFloatingDismissed]);
  // Aggregate unique attachments across current session messages for Artifacts Overview
  const sessionSources = useMemo(() => {
    const map = new Map<string, ChatFileAttachment>();
    for (const msg of messages) {
      if (Array.isArray(msg.files)) {
        for (const file of msg.files) {
          if (file.path && !map.has(file.path)) {
            map.set(file.path, file);
          }
        }
      }
    }
    return Array.from(map.values());
  }, [messages]);


  const handleAddProject = useCallback(async () => {
    if (window.electronAPI?.selectFolder) {
      const selected = await window.electronAPI.selectFolder();
      if (selected) {
        await resetChat(false);
        if (window.electronAPI.addProject) {
          await window.electronAPI.addProject(selected);
          await loadProjects();
          await refreshSessions();
        }
        openFolderDialog(selected);
      }
    }
  }, [openFolderDialog, loadProjects, resetChat, refreshSessions]);

  const handleSelectProject = useCallback(async (project: ProjectItem) => {
    if (project.path !== workspacePath) {
      await resetChat(false);
      openFolderDialog(project.path);
    }
  }, [workspacePath, resetChat, openFolderDialog]);

  const handleRemoveProject = useCallback(async (id: string) => {
    if (window.electronAPI?.removeProject) {
      await window.electronAPI.removeProject(id);
      await loadProjects();
      await refreshSessions();
    }
  }, [loadProjects, refreshSessions]);

  const handleTogglePinProject = useCallback(async (id: string) => {
    if (window.electronAPI?.togglePinProject) {
      await window.electronAPI.togglePinProject(id);
      await loadProjects();
      await refreshSessions();
    }
  }, [loadProjects, refreshSessions]);
  const handleOpenFolder = useCallback(async (customPath?: string) => {
    await resetChat(false);
    await openFolderDialog(customPath);
  }, [resetChat, openFolderDialog]);

  const handleSelectSessionFromGroup = useCallback(
    async (sessionPath: string, projectId?: string) => {
      if (projectId) {
        const project = projects.find((p) => p.id === projectId);
        if (project && project.path !== workspacePath) {
          await openFolderDialog(project.path);
        }
      }
      const foundRuntime = Object.values(runtimeStates).find((rt) => rt.sessionPath === sessionPath);
      if (foundRuntime && foundRuntime.runtimeId !== activeRuntimeId) {
        await switchRuntime(foundRuntime.runtimeId);
      } else {
        await switchSession(sessionPath);
      }
    },
    [projects, workspacePath, openFolderDialog, runtimeStates, activeRuntimeId, switchRuntime, switchSession]
  );

  const handleNewSessionForProject = useCallback(
    async (projectId?: string) => {
      if (projectId) {
        const project = projects.find((p) => p.id === projectId);
        if (project && project.path !== workspacePath) {
          await openFolderDialog(project.path);
        }
      }
      await newSession();
    },
    [projects, workspacePath, openFolderDialog, newSession]
  );


  // Auto-switch Visual Diff tab when a new pending diff arrives
  const prevDiffIdRef = useRef<string | null>(activeDiff?.id ?? null);
  useEffect(() => {
    if (!activeDiff) {
      prevDiffIdRef.current = null;
    }
  }, [activeDiff]);

  // Refresh ProjectTree when engine creates/deletes a file or after accept/reject of create/delete ops
  const prevDiffRef = useRef<FileDiffItem | null>(null);
  useEffect(() => {
    if (!activeDiff) {
      prevDiffRef.current = null;
      return;
    }
    const prev = prevDiffRef.current;
    prevDiffRef.current = activeDiff;

    const isNewDiff = prev?.id !== activeDiff.id;
    const leftPending = Boolean(prev && prev.id === activeDiff.id && prev.status === 'pending' && activeDiff.status !== 'pending');
    if (!isNewDiff && !leftPending) return;

    invalidateArtifactByPath(activeDiff.filePath);

    if (activeDiff.op === 'create' || activeDiff.op === 'delete') {
      refreshFiles();
    }
  }, [activeDiff, refreshFiles, invalidateArtifactByPath]);

  const handleRestartEngine = async () => {
    if (window.electronAPI) {
      if (workspacePath) {
        await window.electronAPI.startOmpProcess(workspacePath);
      } else {
        await checkInstallation();
      }
      await refreshModels();
      await refreshEngineState();
    }
  };
  // Attachment request from file tree to composer (nonce to re-trigger same path)
  const [attachmentRequest, setAttachmentRequest] = useState<{ path: string; nonce: number } | null>(
    null
  );

  const handleAddToChat = useCallback((file: WorkspaceFile) => {
    setAttachmentRequest((prev) => ({ path: file.relativePath, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  const handleDeleteFile = useCallback(
    async (file: WorkspaceFile) => {
      if (!window.electronAPI?.deleteFile) return;
      const ok = await window.electronAPI.deleteFile(file.path);
      if (ok) {
        await refreshFiles();
      } else {
        pushNotification(t('app.deleteFileError', { fileName: file.name }), 'error');
      }
    },
    [refreshFiles, pushNotification, t]
  );

  const handleOpenFileByPath = useCallback(
    (targetPath: string) => {
      const findInTree = (tree: WorkspaceFile[]): WorkspaceFile | null => {
        for (const item of tree) {
          if (
            item.path === targetPath ||
            item.relativePath === targetPath ||
            item.path.endsWith(targetPath)
          ) {
            return item;
          }
          if (item.children) {
            const found = findInTree(item.children);
            if (found) return found;
          }
        }
        return null;
      };

      const found = findInTree(files);
      const isAbsolute = targetPath.startsWith('/');
      const fullPath = !isAbsolute && workspacePath ? `${workspacePath}/${targetPath}` : targetPath;
      const targetFile: WorkspaceFile = found || {
        path: fullPath,
        relativePath: targetPath,
        name: targetPath.split('/').pop() || targetPath,
        isDirectory: false,
      };
      handleSelectFileWithGuard(targetFile);
    },
    [files, workspacePath, handleSelectFileWithGuard]
  );

  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  // Handle open file/session requests from model via host tools
  useEffect(() => {
    if (!window.electronAPI?.onHostOpenRequest) return;
    return window.electronAPI.onHostOpenRequest((request) => {
      if (request.kind === 'file') {
        handleOpenFileByPath(request.target);
        return;
      }
      const session = sessionsRef.current.find((s) => s.id === request.target || s.path === request.target);
      if (session) switchSession(session.path);
    });
  }, [handleOpenFileByPath, switchSession]);


  // Keyboard shortcut listener: ⌘+K (Omnibar), ⌘+B (Left Sidebar), ⌘+J (Right Sidebar), ⌘+Enter (Accept Diff)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘+K: Omnibar
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOmnibarOpen((prev) => !prev);
      }
      // ⌘+B: Toggle Left Sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setIsLeftSidebarOpen((prev) => !prev);
      }
      // ⌘+J: Toggle Right Agent Panel
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        setIsRightSidebarOpen((prev) => !prev);
      }
      // ⌘+` or ⌘+~: Toggle Terminal Canvas Tab
      if ((e.metaKey || e.ctrlKey) && (e.key === '`' || e.key === '~')) {
        e.preventDefault();
        setActiveTab((prev) => (prev === 'terminal' ? 'diff' : 'terminal'));
      }
      // ⌘+Enter to accept diff
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && activeDiff && activeDiff.status === 'pending') {
        e.preventDefault();
        acceptDiff();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDiff, acceptDiff]);
  const isCurrentToolApproval = activeUiRequest
    ? activeUiRequest.isToolApproval ||
      (activeUiRequest.method === 'select' &&
        Array.isArray(activeUiRequest.options) &&
        activeUiRequest.options.length === 2 &&
        activeUiRequest.options.includes('Approve') &&
        activeUiRequest.options.includes('Deny'))
    : false;

  const handleApproveTool = useCallback(
    (id: string) => {
      respondUiSelect(id, 'Approve');
    },
    [respondUiSelect]
  );

  const handleDenyTool = useCallback(
    (id: string) => {
      respondUiSelect(id, 'Deny');
    },
    [respondUiSelect]
  );


  return (
    <div className="h-screen w-screen flex flex-col bg-background text-slate-900 dark:text-zinc-100 overflow-hidden font-sans">
      {/* 1. macOS Header & Titlebar */}
      <HeaderBar
        workspaceName={workspaceName}
        hasWorkspace={Boolean(workspacePath)}
        onOpenFolder={handleOpenFolder}
        status={status}
        installStatus={installStatus}
        onOpenInstallModal={() => setIsOmpModalOpen(true)}
        selectedModel={selectedModel}
        availableModels={availableModels}
        thinkingLevel={thinkingLevel}
        onSelectModel={changeModel}
        onSelectThinkingLevel={changeThinkingLevel}
        onOpenOmnibar={() => setIsOmnibarOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
        isLeftSidebarOpen={isLeftSidebarOpen}
        onToggleLeftSidebar={toggleLeftSidebar}
        isRightSidebarOpen={isRightSidebarOpen}
        onToggleRightSidebar={toggleRightSidebar}
        contextUsage={contextUsage}
        tokensPerSecond={tokensPerSecond}
        onGetSessionStats={getSessionStats}
        onGetGlobalUsage={getGlobalUsage}
        onGetGlobalStats={getGlobalStats}
        onGetUsageHistory={getUsageHistory}
        onGetUsageClients={getUsageClients}
        onInvalidateUsage={invalidateUsage}
        onStartStatsDashboard={startStatsDashboard}
        onStopStatsDashboard={stopStatsDashboard}
        onGetStatsDashboardStatus={getStatsDashboardStatus}
        onOpenExternal={openExternal}
        approvalMode={approvalMode}
        onSelectApprovalMode={setApprovalMode}
        isCompacting={isCompacting}
        autoCompactionEnabled={autoCompactionEnabled}
        onCompact={compact}
        onSetAutoCompaction={setAutoCompaction}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        onOpenOpsModal={() => setIsOpsModalOpen(true)}

        onCopyLastAssistantText={getLastAssistantText}
        isSpeaking={isSpeaking}
        onSpeakLastAssistantText={handleSpeakLastAssistantText}
        onStopSpeaking={handleStopSpeaking}
        centerView={centerView}
        onToggleCenterView={setCenterView}
      />
      {/* 2. Main 3-Column Layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Sidebar: File Tree & Sessions */}
        <div
          className={`bg-panel border-r border-border flex flex-col shrink-0 select-none transition-all duration-200 overflow-hidden ${
            isLeftSidebarOpen ? 'w-60 opacity-100' : 'w-0 opacity-0 border-r-0 pointer-events-none'
          }`}
        >
          <div className="w-60 h-full flex flex-col">
            <ProjectGroupList
              projects={projects}
              activeProjectId={projects.find((p) => p.path === workspacePath)?.id}
              activeProjectPath={workspacePath}
              sessions={sessions}
              activeSessionPath={activeSessionPath}
              activeSessionName={engineState?.sessionName}
              currentStatus={status}
              runtimeStates={runtimeStates}
              onSelectProject={handleSelectProject}
              onAddProject={handleAddProject}
              onRemoveProject={handleRemoveProject}
              onTogglePinProject={handleTogglePinProject}
              onSelectSession={handleSelectSessionFromGroup}
              onNewSession={handleNewSessionForProject}
              onDeleteSession={deleteSession}
              onRenameSession={renameSession}
              onExportSession={exportSession}
            />
            <ProjectTree
              files={files}
              selectedFile={selectedFile}
              onSelectFile={handleSelectFileWithGuard}
              onReload={refreshFiles}
              onAddToChat={handleAddToChat}
              onDeleteFile={handleDeleteFile}
            />
            <SubagentHub subagents={subagents} />
          </div>
        </div>

        {/* Center Stage: Chat or Workbench */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
          {centerView === 'chat' ? (
            <AgentPanel
              messages={messages}
              currentThinking={currentThinking}
              activeToolCalls={activeToolCalls}
              currentStreamText={currentStreamText}
              status={status}
              contextUsage={contextUsage}
              engineStatuses={engineStatuses}
              engineWidgets={engineWidgets}
              workspaceFiles={files}
              workspacePath={workspacePath || undefined}
              projectName={workspaceName}
              gitBranch={gitStatus?.branch}
              availableCommands={availableCommands}
              todoPhases={todoPhases}
              todos={todos}
              pendingToolApproval={isCurrentToolApproval ? activeUiRequest : null}
              toolApprovalQueueLength={uiRequestQueue.length}
              onApproveTool={handleApproveTool}
              onDenyTool={handleDenyTool}
              onSendMessage={sendMessage}
              onSteerMessage={steer}
              onAbortAndPrompt={abortAndPrompt}
              onFollowUpMessage={followUp}
              followUpQueue={followUpQueue}
              onBranchSession={branchFromMessage}
              onOpenFile={handleOpenFileByPath}
              onOpenBrowser={handleOpenBrowser}
              externalAttachment={attachmentRequest}
              retryState={retryState}
              onAbortRetry={abortRetry}
              onRepairSession={repairSession}
              floatingChanges={floatingChanges}
              availableModels={availableModels}
              selectedModel={selectedModel}
              onSelectModel={changeModel}
              thinkingLevel={thinkingLevel}
              onSelectThinkingLevel={changeThinkingLevel}
              approvalMode={approvalMode}
              onSelectApprovalMode={setApprovalMode}
              onOpenStatsPanel={() => setIsStatsPanelOpen(true)}
            />
          ) : (
            <CanvasContainer
              activeTab={activeTab}
              onSelectTab={setActiveTab}
              diff={activeDiff}
              onAcceptDiff={acceptDiff}
              onRejectDiff={rejectDiff}
              selectedFile={selectedFile}
              fileContent={fileContent}
              onSaveFile={saveFileContent}
              onDirtyChange={setIsEditorDirty}
              onDraftChange={setEditorDraftContent}
              theme={theme}
              artifacts={artifacts}
              selectedArtifactId={selectedArtifactId}
              onSelectArtifact={selectArtifact}
              onReloadArtifact={reloadArtifact}
              workspacePath={workspacePath}
              availableModels={availableModels}
              selectedModel={selectedModel}
              onCommitSuccess={async () => {
                await refreshFiles();
              }}
              onOpenCommitModal={() => setIsCommitModalOpen(true)}
              isCommitDisabled={!workspacePath}
            />
          )}
        </div>
        {/* Right Copilot / Inspector Panel */}
        <div
          className={`bg-panel border-l border-border flex flex-col shrink-0 select-none relative overflow-hidden ${
            isRightSidebarDragging ? 'transition-none' : 'transition-all duration-200'
          } ${
            isRightSidebarOpen
              ? 'opacity-100'
              : 'opacity-0 border-l-0 pointer-events-none'
          }`}
          style={{ width: isRightSidebarOpen ? `${rightSidebarWidth}px` : 0 }}
        >
          {/* Resize Handle */}
          {isRightSidebarOpen && (
            <div
              onMouseDown={startRightSidebarResize}
              onDoubleClick={resetRightSidebarWidth}
              className="absolute left-0 top-0 bottom-0 w-2 -translate-x-1 cursor-col-resize z-30 group flex items-center justify-center hover:bg-codex-accent/40 active:bg-codex-accent transition-colors"
              title={t('inspector.resizeHandle')}
            >
              <div className="w-0.5 h-8 rounded-full bg-transparent group-hover:bg-codex-accent/80 transition-colors" />
            </div>
          )}

          <div className="h-full flex flex-col" style={{ width: `${rightSidebarWidth}px` }}>
            {rightSidebarView === 'inspector' ? (
              <InspectorPanel
                isOpen={isRightSidebarOpen}
                onClose={handleCloseInspector}
                onExpandCanvas={() => setCenterView((prev) => (prev === 'workbench' ? 'chat' : 'workbench'))}
                activeTab={inspectorTab}
                onTabChange={setInspectorTab}
                initialBrowserUrl={browserUrl}
                browserUrlNonce={browserUrlNonce}
                diffFiles={activeDiff ? [activeDiff] : []}
                onAcceptDiff={acceptDiff}
                onRejectDiff={rejectDiff}
                contextUsage={contextUsage}
                tokensPerSecond={tokensPerSecond}
                onRefreshStats={getSessionStats}
                model={selectedModel ? selectedModel.name || selectedModel.id : undefined}
                workspacePath={workspacePath || undefined}
                onSendUrlToChat={(browserUrl) => {
                  setCenterView('chat');
                  setAttachmentRequest({
                    path: browserUrl,
                    nonce: Date.now(),
                  });
                }}
                theme={theme}
                sources={sessionSources}
                subagents={subagents}
              />
            ) : (
              <AgentPanel
                messages={messages}
                currentThinking={currentThinking}
                activeToolCalls={activeToolCalls}
                currentStreamText={currentStreamText}
                status={status}
                contextUsage={contextUsage}
                engineStatuses={engineStatuses}
                engineWidgets={engineWidgets}
                workspaceFiles={files}
                workspacePath={workspacePath || undefined}
                availableCommands={availableCommands}
                todoPhases={todoPhases}
                todos={todos}
                pendingToolApproval={isCurrentToolApproval ? activeUiRequest : null}
                toolApprovalQueueLength={uiRequestQueue.length}
                onApproveTool={handleApproveTool}
                onDenyTool={handleDenyTool}
                onSendMessage={sendMessage}
                onSteerMessage={steer}
                onAbortAndPrompt={abortAndPrompt}
                onFollowUpMessage={followUp}
                followUpQueue={followUpQueue}
                onBranchSession={branchFromMessage}
                onCollapsePanel={collapseRightSidebar}
                onOpenFile={handleOpenFileByPath}
                onOpenBrowser={handleOpenBrowser}
                externalAttachment={attachmentRequest}
                retryState={retryState}
                onAbortRetry={abortRetry}
                onRepairSession={repairSession}
                availableModels={availableModels}
                selectedModel={selectedModel}
                onSelectModel={changeModel}
                thinkingLevel={thinkingLevel}
                onSelectThinkingLevel={changeThinkingLevel}
                approvalMode={approvalMode}
                onSelectApprovalMode={setApprovalMode}
                onOpenStatsPanel={() => setIsStatsPanelOpen(true)}
              />
            )}
          </div>
        </div>
      </div>
      {/* Fullscreen transparent overlay while resizing to prevent webview/monaco mouse event interception */}
      {isRightSidebarDragging && (
        <div className="fixed inset-0 z-50 cursor-col-resize select-none pointer-events-auto bg-transparent" />
      )}

      {/* 3. Global Modals */}
      <OmnibarModal
        isOpen={isOmnibarOpen}
        onClose={() => setIsOmnibarOpen(false)}
        onSubmit={(prompt) => sendMessage(prompt)}
        availableCommands={availableCommands}
      />

      <PermissionModal
        request={!isCurrentToolApproval ? activeUiRequest : null}
        queueLength={uiRequestQueue.length}
        onRespondSelect={respondUiSelect}
        onRespondConfirm={respondUiConfirm}
        onRespondInput={respondUiInput}
        onDismiss={dismissUiRequest}
      />

      {/* Principle #1: OMP Required Installation Modal */}
      <OmpRequiredModal
        isOpen={isOmpModalOpen}
        installStatus={installStatus}
        isChecking={isCheckingInstall}
        onRecheck={checkInstallation}
        onContinueDemo={() => setIsOmpModalOpen(false)}
        onSelectCustomFile={browseBinaryFile}
        onSetCustomPath={setCustomPath}
      />

      {/* 4. Settings Modal (Phase 7) */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        theme={theme}
        onThemeChange={handleThemeChange}
        installStatus={installStatus}
        onSelectBinaryFile={browseBinaryFile}
        onSetCustomBinaryPath={setCustomPath}
        availableModels={availableModels}
        onRefreshModels={refreshModels}
        thinkingLevel={thinkingLevel}
        onSelectThinkingLevel={changeThinkingLevel}
        onRestartEngine={handleRestartEngine}
        isEngineRunning={Boolean(workspacePath) || status !== 'idle'}
        getEngineConfig={getEngineConfig}
        setEngineConfigValue={setEngineConfigValue}
        resetEngineConfigValue={resetEngineConfigValue}
        getEngineConfigPath={getEngineConfigPath}
      />


      {/* 5. Ops & Maintenance Modal (Phase 9) */}
      <OpsModal
        isOpen={isOpsModalOpen}
        onClose={() => setIsOpsModalOpen(false)}
        initialTab={opsModalInitialTab}
        onRestartEngine={handleRestartEngine}
        status={status}
        onOpenCommitModal={() => {
          setIsOpsModalOpen(false);
          setActiveTab('commit');
        }}
        listSshHosts={listSshHosts}
        addSshHost={addSshHost}
        removeSshHost={removeSshHost}
        listGrievances={listGrievances}
        cleanGrievances={cleanGrievances}
        pushGrievances={pushGrievances}
      />
      {/* 6. Session & Global Stats Panel */}
      {isStatsPanelOpen && (
        <SessionStatsPanel
          isOpen={isStatsPanelOpen}
          onClose={() => setIsStatsPanelOpen(false)}
          onRefresh={getSessionStats}
          contextUsage={contextUsage}
          isCompacting={isCompacting}
          autoCompactionEnabled={autoCompactionEnabled}
          onCompact={compact}
          onSetAutoCompaction={setAutoCompaction}
          onGetGlobalUsage={getGlobalUsage}
          onGetGlobalStats={getGlobalStats}
          onGetUsageHistory={getUsageHistory}
          onGetUsageClients={getUsageClients}
          onInvalidateUsage={invalidateUsage}
          onStartStatsDashboard={startStatsDashboard}
          onStopStatsDashboard={stopStatsDashboard}
          onGetStatsDashboardStatus={getStatsDashboardStatus}
          onOpenExternal={openExternal}
        />
      )}
      {/* Commit Assistant Modal (Phase 14) */}
      <CommitModal
        isOpen={isCommitModalOpen}
        onClose={() => setIsCommitModalOpen(false)}
        workspacePath={workspacePath || undefined}
        availableModels={availableModels}
        selectedModel={selectedModel}
      />
      {/* Unsaved Changes Guard Modal (Phase 3) */}
      <UnsavedChangesModal
        isOpen={isUnsavedModalOpen}
        fileName={selectedFile?.name || ''}
        onSave={handleSaveAndContinue}
        onDiscard={handleDiscardAndContinue}
        onCancel={handleCancelSwitchFile}
      />
      {/* 4. Notification Toast Stack */}
      <ToastStack
        notifications={notifications}
        onDismiss={dismissNotification}
      />
    </div>
  );
}

export default App;
