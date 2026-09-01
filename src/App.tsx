import React, { useState, useEffect } from 'react';
import { HeaderBar } from './components/HeaderBar';
import { ProjectTree } from './components/Sidebar/ProjectTree';
import { ThreadList } from './components/Sidebar/ThreadList';
import { CanvasContainer } from './components/Canvas/CanvasContainer';
import { AgentPanel } from './components/AgentPanel/AgentPanel';
import { OmnibarModal } from './components/Modals/OmnibarModal';
import { PermissionModal } from './components/Modals/PermissionModal';
import { OmpRequiredModal } from './components/Modals/OmpRequiredModal';
import { useOmpRpc } from './hooks/useOmpRpc';
import { useWorkspace } from './hooks/useWorkspace';
import { ThemeMode } from './types';

export function App() {
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [isOmnibarOpen, setIsOmnibarOpen] = useState<boolean>(false);
  const [isOmpModalOpen, setIsOmpModalOpen] = useState<boolean>(false);

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

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

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
    pendingPermission,
    selectedModel,
    setSelectedModel,
    sendMessage,
    respondPermission,
    acceptDiff,
    rejectDiff,
  } = useOmpRpc();

  // Principle #1: When app loads, if OMP is not installed, open the Requirement Modal
  useEffect(() => {
    if (installStatus && !installStatus.installed) {
      setIsOmpModalOpen(true);
    } else if (installStatus?.installed) {
      setIsOmpModalOpen(false);
    }
  }, [installStatus]);

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
  } = useWorkspace();

  // Keyboard shortcut listener: ⌘+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOmnibarOpen((prev) => !prev);
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
        onSelectModel={setSelectedModel}
        onOpenOmnibar={() => setIsOmnibarOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* 2. Main 3-Column Layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Sidebar: File Tree & Sessions */}
        <div className="w-60 bg-panel border-r border-border flex flex-col shrink-0 select-none">
          <ProjectTree
            files={files}
            selectedFile={selectedFile}
            onSelectFile={selectFile}
          />
          <ThreadList onNewThread={() => {}} />
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
        <AgentPanel
          messages={messages}
          currentThinking={currentThinking}
          activeToolCalls={activeToolCalls}
          currentStreamText={currentStreamText}
          status={status}
          onSendMessage={sendMessage}
        />
      </div>

      {/* 3. Global Modals */}
      <OmnibarModal
        isOpen={isOmnibarOpen}
        onClose={() => setIsOmnibarOpen(false)}
        onSubmit={(prompt) => sendMessage(prompt)}
      />

      <PermissionModal
        request={pendingPermission}
        onRespond={respondPermission}
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
    </div>
  );
}

export default App;
