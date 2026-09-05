import * as fs from 'node:fs/promises';
import path from 'node:path';
import type { OmpSessionInfo } from './types.ts';
import { getProfileSessionDir } from './profile-paths.ts';

const HEADER_CHUNK_BYTES = 8192;

interface ParsedHeader {
  title?: string;
  sessionId?: string;
  timestamp?: string;
  updatedAt?: string;
  hasValidHeader: boolean;
}

export async function parseSessionHeader(filePath: string): Promise<ParsedHeader> {
  let fileHandle: fs.FileHandle | null = null;
  try {
    fileHandle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(HEADER_CHUNK_BYTES);
    const { bytesRead } = await fileHandle.read(buffer, 0, HEADER_CHUNK_BYTES, 0);
    const text = buffer.toString('utf-8', 0, bytesRead);
    const lines = text.split('\n');

    let title = '';
    let updatedAt: string | undefined;
    let sessionId = '';
    let timestamp = '';
    let hasValidHeader = false;

    for (let i = 0; i < Math.min(lines.length, 6); i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        if (parsed.type === 'title') {
          hasValidHeader = true;
          if (typeof parsed.title === 'string' && parsed.title.trim()) {
            title = parsed.title.trim();
          }
          if (parsed.updatedAt) {
            updatedAt = String(parsed.updatedAt);
          }
        } else if (parsed.type === 'session') {
          hasValidHeader = true;
          if (parsed.id) {
            sessionId = String(parsed.id);
          }
          if (parsed.timestamp) {
            timestamp = String(parsed.timestamp);
          }
          if (!title && typeof parsed.title === 'string' && parsed.title.trim()) {
            title = parsed.title.trim();
          }
        }
      } catch {
        // Line might be incomplete chunk or not JSON
      }
    }

    return { title: title || undefined, sessionId: sessionId || undefined, timestamp: timestamp || undefined, updatedAt, hasValidHeader };
  } catch {
    return { hasValidHeader: false };
  } finally {
    if (fileHandle) {
      await fileHandle.close().catch(() => {});
    }
  }
}

export async function indexProjectSessions(
  projectId: string,
  projectPath: string,
  profile?: string,
  customSessionDir?: string
): Promise<OmpSessionInfo[]> {
  let canonicalPath: string;
  try {
    canonicalPath = await fs.realpath(projectPath);
  } catch {
    canonicalPath = path.resolve(projectPath);
  }

  const sessionDir = customSessionDir || getProfileSessionDir(profile, canonicalPath);
  const dirStat = await fs.stat(sessionDir).catch(() => null);
  if (!dirStat || !dirStat.isDirectory()) {
    return [];
  }

  const entries = await fs.readdir(sessionDir, { withFileTypes: true });
  const jsonlEntries = entries.filter((e) => e.isFile() && e.name.endsWith('.jsonl'));

  const results: OmpSessionInfo[] = [];
  const chunkSize = 20;

  for (let i = 0; i < jsonlEntries.length; i += chunkSize) {
    const chunk = jsonlEntries.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map(async (entry) => {
        const fullPath = path.join(sessionDir, entry.name);
        try {
          const [header, stat] = await Promise.all([
            parseSessionHeader(fullPath),
            fs.stat(fullPath),
          ]);

          if (!header.hasValidHeader) {
            return null;
          }

          const fallbackDate = stat.mtime.toISOString();
          const timestamp = header.timestamp || fallbackDate;
          const updatedAt = header.updatedAt || timestamp;
          const sessionId = header.sessionId || path.basename(entry.name, '.jsonl');
          const title = header.title || 'New Session';

          const session: OmpSessionInfo = {
            path: fullPath,
            id: sessionId,
            title,
            timestamp,
            updatedAt,
            active: false,
            projectId,
            projectPath: canonicalPath,
          };
          return session;
        } catch {
          return null;
        }
      })
    );

    for (const item of chunkResults) {
      if (item) {
        results.push(item);
      }
    }
  }

  results.sort((a, b) => {
    const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return timeB - timeA;
  });

  return results;
}
