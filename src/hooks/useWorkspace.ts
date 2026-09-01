import { useState, useCallback } from 'react';
import { WorkspaceFile, ActiveCanvasTab } from '../types';
import { DEMO_WORKSPACE_FILES } from '../mock/demoData';

export function useWorkspace() {
  const [workspacePath, setWorkspacePath] = useState<string>('~/Projects/omp-demo');
  const [workspaceName, setWorkspaceName] = useState<string>('omp-demo');
  const [files, setFiles] = useState<WorkspaceFile[]>(DEMO_WORKSPACE_FILES);
  const [selectedFile, setSelectedFile] = useState<WorkspaceFile | null>(
    DEMO_WORKSPACE_FILES[0].children?.[0].children?.[0] || null
  );
  const [fileContent, setFileContent] = useState<string>('');
  const [activeTab, setActiveTab] = useState<ActiveCanvasTab>('diff');

  const findFirstFile = (tree: WorkspaceFile[]): WorkspaceFile | null => {
    for (const item of tree) {
      if (!item.isDirectory) return item;
      if (item.children && item.children.length > 0) {
        const found = findFirstFile(item.children);
        if (found) return found;
      }
    }
    return null;
  };

  const openFolderDialog = useCallback(async () => {
    if (window.electronAPI) {
      const folderPath = await window.electronAPI.selectFolder();
      if (folderPath) {
        setWorkspacePath(folderPath);
        const name = folderPath.split('/').pop() || 'workspace';
        setWorkspaceName(name);
        
        const dirFiles = await window.electronAPI.readDirectory(folderPath);
        setFiles(dirFiles);

        const firstFile = findFirstFile(dirFiles);
        if (firstFile) {
          setSelectedFile(firstFile);
          try {
            const content = await window.electronAPI.readFile(firstFile.path);
            setFileContent(content);
          } catch {
            setFileContent('');
          }
        }
        
        // Notify OMP backend to switch workspace
        await window.electronAPI.startOmpProcess(folderPath);
      }
    }
  }, []);

  const selectFile = useCallback(async (file: WorkspaceFile) => {
    if (file.isDirectory) return;
    setSelectedFile(file);
    setActiveTab('editor');

    if (window.electronAPI) {
      const content = await window.electronAPI.readFile(file.path);
      setFileContent(content);
    } else {
      // Mock content for demo
      setFileContent(`// Opened file: ${file.relativePath}\nexport const demo = true;`);
    }
  }, []);

  return {
    workspacePath,
    workspaceName,
    files,
    selectedFile,
    fileContent,
    activeTab,
    setActiveTab,
    openFolderDialog,
    selectFile,
  };
}
