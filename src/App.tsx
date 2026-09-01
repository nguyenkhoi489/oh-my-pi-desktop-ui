import { useState, useEffect, useCallback, useRef } from 'react';
import { HeaderBar } from './components/HeaderBar';
import { ProjectTree } from './components/Sidebar/ProjectTree';
import { ThreadList } from './components/Sidebar/ThreadList';
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
import { ThemeMode, FileDiffItem, WorkspaceFile } from './types';

export function App() {
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [isOmnibarOpen, setIsOmnibarOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isOmpModalOpen, setIsOmpModalOpen] = useState<boolean>(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState<boolean>(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState<boolean>(true);
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
        console.warn('[App] Lỗi khi nạp cấu hình ban đầu:', err);
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
    setIsRightSidebarOpen((prev) => !prev);
  };

  // Callback ổn định để không phá React.memo của ProjectTree/AgentPanel
  const collapseLeftSidebar = useCallback(() => setIsLeftSidebarOpen(false), []);
  const collapseRightSidebar = useCallback(() => setIsRightSidebarOpen(false), []);

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
    acceptDiff,
    rejectDiff,
    notifications,
    dismissNotification,
    engineStatuses,
    engineWidgets,
    contextUsage,
    tokensPerSecond,
    getSessionStats,
    approvalMode,
    setApprovalMode,
    compact,
    isCompacting,
    autoCompactionEnabled,
    setAutoCompaction,
    availableCommands,
  } = useOmpRpc();

  // Principle #1: When app loads, if OMP is not installed, open the Requirement Modal
  useEffect(() => {
    if (installStatus && !installStatus.installed) {
      setIsOmpModalOpen(true);
    } else if (installStatus?.installed) {
      setIsOmpModalOpen(false);
    }
  }, [installStatus]);

  const handleProcessStarted = useCallback(() => {
    refreshEngineState();
    refreshModels();
    refreshSessions();
  }, [refreshEngineState, refreshModels, refreshSessions]);

  const {
    workspacePath,
    workspaceName,
    files,
    selectedFile,
    fileContent,
    activeTab,
    setActiveTab,
    openFolderDialog,
    selectFile,
    refreshFiles,
  } = useWorkspace({
    onProcessStarted: handleProcessStarted,
  });

  // Auto-switch Visual Diff tab when a new pending diff arrives
  const prevDiffIdRef = useRef<string | null>(activeDiff?.id ?? null);
  useEffect(() => {
    if (activeDiff && activeDiff.status === 'pending' && activeDiff.id !== prevDiffIdRef.current) {
      prevDiffIdRef.current = activeDiff.id;
      setActiveTab('diff');
    }
  }, [activeDiff, setActiveTab]);

  // Refresh ProjectTree when engine creates/deletes a file or after accept/reject of create/delete ops
  const prevDiffRef = useRef<FileDiffItem | null>(null);
  useEffect(() => {
    if (!activeDiff) {
      prevDiffRef.current = null;
      return;
    }
    const prev = prevDiffRef.current;
    prevDiffRef.current = activeDiff;

    // 1. When a new diff arrives with op 'create' or 'delete'
    if (prev?.id !== activeDiff.id && (activeDiff.op === 'create' || activeDiff.op === 'delete')) {
      refreshFiles();
    }

    // 2. When activeDiff status transitions away from 'pending' for create/delete ops
    if (prev && prev.id === activeDiff.id && prev.status === 'pending' && activeDiff.status !== 'pending') {
      if (activeDiff.op === 'create' || activeDiff.op === 'delete') {
        refreshFiles();
      }
    }
  }, [activeDiff, refreshFiles]);

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
      if (found) {
        selectFile(found);
      } else {
        const fullPath = workspacePath ? `${workspacePath}/${targetPath}` : targetPath;
        selectFile({
          path: fullPath,
          relativePath: targetPath,
          name: targetPath.split('/').pop() || targetPath,
          isDirectory: false,
        });
      }
    },
    [files, workspacePath, selectFile]
  );


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
        onOpenFolder={openFolderDialog}
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
        approvalMode={approvalMode}
        onSelectApprovalMode={setApprovalMode}
        isCompacting={isCompacting}
        autoCompactionEnabled={autoCompactionEnabled}
        onCompact={compact}
        onSetAutoCompaction={setAutoCompaction}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
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
            <ProjectTree
              files={files}
              selectedFile={selectedFile}
              onSelectFile={selectFile}
              onCollapseSidebar={collapseLeftSidebar}
            />
            <ThreadList
              sessions={sessions}
              activeSessionPath={activeSessionPath}
              activeSessionName={engineState?.sessionName}
              status={status}
              onSelectSession={switchSession}
              onNewThread={newSession}
              onRenameSession={renameSession}
              onDeleteSession={deleteSession}
              onExportSession={exportSession}
            />
            <SubagentHub subagents={subagents} />
          </div>
        </div>

        {/* Center Canvas: Visual Diff / Editor / Artifacts / Terminal */}
        <CanvasContainer
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          diff={activeDiff}
          onAcceptDiff={acceptDiff}
          onRejectDiff={rejectDiff}
          selectedFile={selectedFile}
          fileContent={fileContent}
          theme={theme}
        />

        {/* Right Copilot Panel: Reasoning Stepper, Tool Cards & Chat */}
        <div
          className={`bg-panel border-l border-border flex flex-col shrink-0 select-none transition-all duration-200 overflow-hidden ${
            isRightSidebarOpen ? 'w-[420px] opacity-100' : 'w-0 opacity-0 border-l-0 pointer-events-none'
          }`}
        >
          <div className="w-[420px] h-full flex flex-col">
            <AgentPanel
              messages={messages}
              currentThinking={currentThinking}
              activeToolCalls={activeToolCalls}
              currentStreamText={currentStreamText}
              status={status}
              engineStatuses={engineStatuses}
              engineWidgets={engineWidgets}
              workspaceFiles={files}
              availableCommands={availableCommands}
              pendingToolApproval={isCurrentToolApproval ? activeUiRequest : null}
              toolApprovalQueueLength={uiRequestQueue.length}
              onApproveTool={handleApproveTool}
              onDenyTool={handleDenyTool}
              onSendMessage={sendMessage}
              onBranchSession={branchFromMessage}
              onCollapsePanel={collapseRightSidebar}
              onOpenFile={handleOpenFileByPath}
            />
          </div>
        </div>
      </div>

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
        thinkingLevel={thinkingLevel}
        onSelectThinkingLevel={changeThinkingLevel}
        onRestartEngine={handleRestartEngine}
        isEngineRunning={status !== 'idle'}
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
