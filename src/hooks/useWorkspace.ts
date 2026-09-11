import { useState, useCallback, useRef } from 'react';
import { WorkspaceFile, ActiveCanvasTab } from '../types';
import { DEMO_WORKSPACE_FILES } from '../mock/demoData';
interface UseWorkspaceOptions {
  onProcessStarted?: () => void | Promise<void>;
}

export function useWorkspace(options?: UseWorkspaceOptions) {
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI);
  const [workspacePath, setWorkspacePath] = useState<string>(
    isElectron ? '' : '~/Projects/omp-demo'
  );
  const [workspaceName, setWorkspaceName] = useState<string>(
    isElectron ? 'No workspace opened' : 'omp-demo'
  );
  const [files, setFiles] = useState<WorkspaceFile[]>(
    isElectron ? [] : DEMO_WORKSPACE_FILES
  );
  const [selectedFile, setSelectedFile] = useState<WorkspaceFile | null>(
    isElectron ? null : (DEMO_WORKSPACE_FILES[0]?.children?.[0]?.children?.[0] || null)
  );
  const selectedFileRef = useRef<WorkspaceFile | null>(selectedFile);
  selectedFileRef.current = selectedFile;
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


  const openFolderDialog = useCallback(async (customPath?: string, opts?: { isSessionSwitch?: boolean }) => {
    if (window.electronAPI) {
      const folderPath = customPath || (await window.electronAPI.selectFolder());
      if (folderPath) {
        setWorkspacePath(folderPath);
        const name = folderPath.split('/').filter(Boolean).pop() || 'workspace';
        setWorkspaceName(name);
        
        // Start engine in parallel with directory scan to reduce latency
        const startPromise = window.electronAPI.startOmpProcess(folderPath);

        const dirFiles = await window.electronAPI.readDirectory(folderPath);
        setFiles(dirFiles);

        const firstFile = findFirstFile(dirFiles);
        if (firstFile) {
          try {
            const content = await window.electronAPI.readFile(firstFile.path);
            setSelectedFile(firstFile);
            setFileContent(content);
          } catch {
            setSelectedFile(firstFile);
            setFileContent('');
          }
        }

        const startRes = await startPromise;
        if (startRes?.success) {
          if (!opts?.isSessionSwitch) {
            await options?.onProcessStarted?.();
          }
        } else {
          console.warn('[useWorkspace] OMP engine failed to start for workspace:', folderPath);
        }
      }
    }
  }, [options]);

  const selectFile = useCallback(async (file: WorkspaceFile) => {
    if (file.isDirectory) return;
    setActiveTab('editor');
    if (window.electronAPI) {
      try {
        const content = await window.electronAPI.readFile(file.path);
        setSelectedFile(file);
        setFileContent(content);
      } catch (err) {
        console.error('[useWorkspace] Failed to read file:', file.path, err);
        setSelectedFile(file);
        setFileContent('');
      }
    } else {
      setSelectedFile(file);
      setFileContent(`// Opened file: ${file.relativePath}\nexport const demo = true;`);
    }
  }, []);

  const findFileByPath = (tree: WorkspaceFile[], targetPath: string): WorkspaceFile | null => {
    for (const item of tree) {
      if (item.path === targetPath) return item;
      if (item.children && item.children.length > 0) {
        const found = findFileByPath(item.children, targetPath);
        if (found) return found;
      }
    }
    return null;
  };

  const refreshFiles = useCallback(async () => {
    if (window.electronAPI && workspacePath) {
      try {
        const dirFiles = await window.electronAPI.readDirectory(workspacePath);
        setFiles(dirFiles);

        setSelectedFile((currentSelected) => {
          if (!currentSelected) return null;
          const stillExists = findFileByPath(dirFiles, currentSelected.path);
          if (!stillExists) {
            setFileContent('');
            return null;
          }
          return stillExists;
        });
      } catch (err) {
        console.error('[useWorkspace] Failed to refresh files:', err);
      }
    }
  }, [workspacePath]);

  const saveFileContent = useCallback(async (filePath: string, content: string): Promise<boolean> => {
    if (!filePath) return false;
    if (window.electronAPI) {
      try {
        const success = await window.electronAPI.saveFile(filePath, content);
        if (success) {
          if (selectedFileRef.current?.path === filePath) {
            setFileContent(content);
          }
          return true;
        }
        return false;
      } catch (err) {
        console.error('[useWorkspace] Failed to save file:', filePath, err);
        return false;
      }
    } else {
      // Mock save in browser mode
      if (selectedFileRef.current?.path === filePath) {
        setFileContent(content);
      }
      return true;
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
    refreshFiles,
    saveFileContent,
  };
}
