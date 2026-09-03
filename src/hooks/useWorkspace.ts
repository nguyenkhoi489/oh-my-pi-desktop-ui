import { useState, useCallback, useEffect, useRef } from 'react';
import { WorkspaceFile, ActiveCanvasTab, ArtifactDocument } from '../types';
import { DEMO_WORKSPACE_FILES, DEMO_ARTIFACTS } from '../mock/demoData';
import { discoverWorkspaceArtifacts } from '../utils/artifactDiscovery';

interface UseWorkspaceOptions {
  onProcessStarted?: () => void;
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

  // Artifacts & Plans dynamic state
  const [artifacts, setArtifacts] = useState<ArtifactDocument[]>(
    isElectron ? [] : DEMO_ARTIFACTS
  );
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>(
    isElectron ? '' : DEMO_ARTIFACTS[0]?.id || ''
  );
  const hydratingRef = useRef<Set<string>>(new Set());

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

  // Reload selected artifact when not loaded or marked for reload
  useEffect(() => {
    const api = window.electronAPI;
    if (!api || !selectedArtifactId) return;
    const target = artifacts.find((a) => a.id === selectedArtifactId);
    if (!target || target.isLoaded || !target.path || hydratingRef.current.has(target.id)) return;

    const targetId = target.id;
    hydratingRef.current.add(targetId);
    api
      .readFile(target.path)
      .catch((err) => {
        console.error('[useWorkspace] Failed to read artifact content:', target.path, err);
        return '';
      })
      .then((content) => {
        setArtifacts((prev) =>
          prev.map((item) => (item.id === targetId ? { ...item, content, isLoaded: true } : item))
        );
      })
      .finally(() => hydratingRef.current.delete(targetId));
  }, [selectedArtifactId, artifacts]);

  // Update artifacts list when file tree changes, keep content but mark for reload
  const syncArtifactsFromFiles = useCallback((dirFiles: WorkspaceFile[]) => {
    if (!isElectron) {
      setArtifacts(DEMO_ARTIFACTS);
      setSelectedArtifactId((prev) => prev || DEMO_ARTIFACTS[0]?.id || '');
      return;
    }

    const discovered = discoverWorkspaceArtifacts(dirFiles);
    setArtifacts((prevArtifacts) => {
      const prevMap = new Map(prevArtifacts.map((a) => [a.id, a]));
      return discovered.map((item) => {
        const existing = prevMap.get(item.id);
        return existing?.isLoaded ? { ...item, content: existing.content } : item;
      });
    });
    setSelectedArtifactId((prevId) =>
      discovered.some((a) => a.id === prevId) ? prevId : discovered[0]?.id || ''
    );
  }, [isElectron]);

  const selectArtifact = useCallback((id: string) => {
    setSelectedArtifactId(id);
  }, []);

  const markArtifactStale = useCallback((predicate: (art: ArtifactDocument) => boolean) => {
    setArtifacts((prev) =>
      prev.map((item) => (item.isLoaded && predicate(item) ? { ...item, isLoaded: false } : item))
    );
  }, []);

  const reloadArtifact = useCallback((id?: string) => {
    const targetId = id || selectedArtifactId;
    if (!targetId) return;
    markArtifactStale((art) => art.id === targetId);
  }, [selectedArtifactId, markArtifactStale]);

  // Called when engine writes file so corresponding artifact is reloaded
  const invalidateArtifactByPath = useCallback((filePath: string) => {
    markArtifactStale((art) => art.path === filePath);
  }, [markArtifactStale]);

  const openFolderDialog = useCallback(async () => {
    if (window.electronAPI) {
      const folderPath = await window.electronAPI.selectFolder();
      if (folderPath) {
        setWorkspacePath(folderPath);
        const name = folderPath.split('/').filter(Boolean).pop() || 'workspace';
        setWorkspaceName(name);
        
        // Start engine in parallel with directory scan to reduce latency
        const startPromise = window.electronAPI.startOmpProcess(folderPath);

        const dirFiles = await window.electronAPI.readDirectory(folderPath);
        setFiles(dirFiles);
        syncArtifactsFromFiles(dirFiles);

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
          options?.onProcessStarted?.();
        } else {
          console.warn('[useWorkspace] OMP engine failed to start for workspace:', folderPath);
        }
      }
    }
  }, [options, syncArtifactsFromFiles]);

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
        syncArtifactsFromFiles(dirFiles);

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
  }, [workspacePath, syncArtifactsFromFiles]);

  const saveFileContent = useCallback(async (filePath: string, content: string): Promise<boolean> => {
    if (!filePath) return false;
    if (window.electronAPI) {
      try {
        const success = await window.electronAPI.saveFile(filePath, content);
        if (success) {
          if (selectedFileRef.current?.path === filePath) {
            setFileContent(content);
          }
          invalidateArtifactByPath(filePath);
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
      invalidateArtifactByPath(filePath);
      return true;
    }
  }, [invalidateArtifactByPath]);

  return {
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
  };
}
