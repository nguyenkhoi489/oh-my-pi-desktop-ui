import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import electronPkg from 'electron';
import type { ProjectItem } from './types.ts';

export class ProjectsStore {
  private filePath: string;
  private projects: ProjectItem[] = [];
  private initPromise: Promise<void>;
  private mutationQueue: Promise<unknown> = Promise.resolve();

  constructor(customFilePath?: string) {
    if (customFilePath) {
      this.filePath = customFilePath;
    } else {
      try {
        const pkgObj = typeof electronPkg === 'object' && electronPkg !== null ? (electronPkg as Record<string, unknown>) : undefined;
        const defaultObj = pkgObj && typeof pkgObj.default === 'object' && pkgObj.default !== null ? (pkgObj.default as Record<string, unknown>) : undefined;
        const electronApp = (pkgObj?.app || defaultObj?.app) as { getPath?: (name: string) => string } | undefined;
        if (electronApp && typeof electronApp.getPath === 'function') {
          this.filePath = path.join(electronApp.getPath('userData'), 'projects.json');
        } else {
          this.filePath = path.join(os.homedir(), '.omp', 'projects.json');
        }
      } catch {
        this.filePath = path.join(os.homedir(), '.omp', 'projects.json');
      }
    }
    this.initPromise = this.load();
  }

  private async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        let hasMissingCreatedAt = false;
        this.projects = parsed
          .filter(
            (item: unknown): item is ProjectItem =>
              item !== null &&
              typeof item === 'object' &&
              typeof (item as ProjectItem).id === 'string' &&
              typeof (item as ProjectItem).name === 'string' &&
              typeof (item as ProjectItem).path === 'string'
          )
          .map((item, index) => {
            if (typeof item.createdAt !== 'number') {
              hasMissingCreatedAt = true;
            }
            return {
              ...item,
              createdAt: typeof item.createdAt === 'number' ? item.createdAt : 1000000 + index * 1000,
            };
          });
        if (hasMissingCreatedAt) {
          await this.save();
        }
        return;
      }
    } catch {
      // File missing or not valid JSON
    }
    this.projects = [];
  }

  private async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmpPath = `${this.filePath}.tmp.${Date.now()}.${randomUUID().slice(0, 6)}`;
    await fs.writeFile(tmpPath, JSON.stringify(this.projects, null, 2), 'utf-8');
    await fs.rename(tmpPath, this.filePath);
  }

  private runMutation<T>(fn: () => Promise<T>): Promise<T> {
    const run = async () => {
      await this.initPromise;
      return fn();
    };
    const next = this.mutationQueue.then(run, run);
    this.mutationQueue = next.then(() => {}, () => {});
    return next;
  }

  public async getProjects(): Promise<ProjectItem[]> {
    await this.initPromise;
    return [...this.projects].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      const diff = (a.createdAt ?? 0) - (b.createdAt ?? 0);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  }

  public async getProject(id: string): Promise<ProjectItem | undefined> {
    await this.initPromise;
    return this.projects.find((p) => p.id === id);
  }

  public async findProjectByPath(projectPath: string): Promise<ProjectItem | undefined> {
    await this.initPromise;
    let canonical: string;
    try {
      canonical = await fs.realpath(projectPath);
    } catch {
      canonical = path.resolve(projectPath);
    }
    return this.projects.find((p) => path.resolve(p.path) === canonical);
  }

  public addProject(projectPath: string, name?: string): Promise<ProjectItem> {
    return this.runMutation(async () => {
      let canonical: string;
      try {
        canonical = await fs.realpath(projectPath);
      } catch {
        canonical = path.resolve(projectPath);
      }

      const existing = this.projects.find((p) => path.resolve(p.path) === canonical);
      if (existing) {
        existing.lastOpenedAt = Date.now();
        if (typeof existing.createdAt !== 'number') {
          const maxCreatedAt = this.projects.reduce((max, p) => Math.max(max, p.createdAt ?? 0), 1000000);
          existing.createdAt = maxCreatedAt + 1000;
        }
        if (name && name.trim()) {
          existing.name = name.trim();
        }
        await this.save();
        return { ...existing };
      }

      const cleanName =
        name && name.trim()
          ? name.trim()
          : path.basename(canonical) || 'Project';

      const now = Date.now();
      const item: ProjectItem = {
        id: 'proj-' + randomUUID().slice(0, 8),
        name: cleanName,
        path: canonical,
        pinned: false,
        lastOpenedAt: now,
        createdAt: now,
      };

      this.projects.push(item);
      await this.save();
      return { ...item };
    });
  }

  public removeProject(id: string): Promise<boolean> {
    return this.runMutation(async () => {
      const idx = this.projects.findIndex((p) => p.id === id);
      if (idx === -1) {
        return false;
      }
      this.projects.splice(idx, 1);
      await this.save();
      return true;
    });
  }

  public togglePin(id: string): Promise<boolean> {
    return this.runMutation(async () => {
      const project = this.projects.find((p) => p.id === id);
      if (!project) {
        return false;
      }
      project.pinned = !project.pinned;
      await this.save();
      return true;
    });
  }

  public touchProject(id: string): Promise<boolean> {
    return this.runMutation(async () => {
      const project = this.projects.find((p) => p.id === id);
      if (!project) {
        return false;
      }
      project.lastOpenedAt = Date.now();
      await this.save();
      return true;
    });
  }
}
