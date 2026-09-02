import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import type { ForeignSessionCandidate, ImportSessionResult } from './types.ts';

// Chuyển đường dẫn thư mục làm việc thành tên thư mục lưu session của OMP
export function sanitizeCwdToSessionDirName(cwd: string): string {
  const normalized = path.resolve(cwd);
  const trimmed = normalized.replace(/^[/\\]+/, '').replace(/[/\\]+/g, '-').replace(/:/g, '-');
  return `-${trimmed}`;
}

// Lấy đường dẫn thư mục lưu session OMP cho một project
export function getOmpSessionDir(targetCwd?: string): string {
  const baseDir = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.omp', 'agent');
  const sessionsBase = path.join(baseDir, 'sessions');
  if (!targetCwd) {
    return sessionsBase;
  }
  return path.join(sessionsBase, sanitizeCwdToSessionDirName(targetCwd));
}

// Cắt ngắn văn bản để làm tiêu đề hoặc preview
function truncateText(text: string, maxLength = 80): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength - 1) + '…';
}

// Quét các session Claude Code từ thư mục ~/.claude
export async function scanClaudeSessions(configDir?: string): Promise<ForeignSessionCandidate[]> {
  const root = configDir || process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const candidates: ForeignSessionCandidate[] = [];

  if (!fs.existsSync(root)) {
    return candidates;
  }

  // Đọc metadata từ history.jsonl nếu có
  const historyMap = new Map<string, { created?: number; modified?: number; title?: string; firstMessage?: string }>();
  const historyFile = path.join(root, 'history.jsonl');
  if (fs.existsSync(historyFile)) {
    try {
      const historyLines = fs.readFileSync(historyFile, 'utf-8').split('\n');
      for (const line of historyLines) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line);
          const sId = item.sessionId || item.session_id;
          if (sId) {
            const ts = typeof item.timestamp === 'number' ? item.timestamp : (item.ts ? Number(item.ts) : undefined);
            const msg = item.display || item.firstMessage || item.message;
            historyMap.set(sId, {
              created: ts,
              modified: ts,
              title: item.title || (msg ? truncateText(String(msg), 60) : undefined),
              firstMessage: msg ? String(msg) : undefined,
            });
          }
        } catch {
          // Bỏ qua dòng lỗi
        }
      }
    } catch {
      // Bỏ qua lỗi đọc file history
    }
  }

  // Đọc danh sách project mapping từ .claude.json nếu có
  const projectMapping = new Map<string, string>();
  const claudeJsonPath = path.join(root, '.claude.json');
  if (fs.existsSync(claudeJsonPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(claudeJsonPath, 'utf-8'));
      if (config && typeof config.projects === 'object') {
        for (const realPath of Object.keys(config.projects)) {
          if (path.isAbsolute(realPath)) {
            const slug = realPath.replace(/^[/\\]+/, '').replace(/[/\\]+/g, '-');
            projectMapping.set(`-${slug}`, realPath);
            projectMapping.set(slug, realPath);
          }
        }
      }
    } catch {
      // Bỏ qua lỗi đọc config
    }
  }

  const projectDirsToCheck = ['projects', '.projects'];
  for (const sub of projectDirsToCheck) {
    const projectsRoot = path.join(root, sub);
    if (!fs.existsSync(projectsRoot)) continue;

    let projectEntries: fs.Dirent[] = [];
    try {
      projectEntries = fs.readdirSync(projectsRoot, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const pEntry of projectEntries) {
      if (!pEntry.isDirectory()) continue;
      const projectFolderPath = path.join(projectsRoot, pEntry.name);
      const mappedCwd = projectMapping.get(pEntry.name) || (pEntry.name.startsWith('-') ? pEntry.name.replace(/-/g, '/') : undefined);

      let sessionFiles: fs.Dirent[] = [];
      try {
        sessionFiles = fs.readdirSync(projectFolderPath, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const sFile of sessionFiles) {
        if (!sFile.isFile() || !sFile.name.endsWith('.jsonl')) continue;
        const filePath = path.join(projectFolderPath, sFile.name);
        const rawId = path.basename(sFile.name, '.jsonl');

        try {
          const stat = fs.statSync(filePath);
          const historyMeta = historyMap.get(rawId);

          let detectedCwd = mappedCwd;
          let title = historyMeta?.title;
          let firstMessage = historyMeta?.firstMessage;
          let messageCount = 0;
          let detectedCreated = historyMeta?.created || stat.birthtimeMs || stat.ctimeMs || stat.mtimeMs;
          let detectedModified = Math.max(historyMeta?.modified || 0, stat.mtimeMs);

          // Đọc mẫu vài dòng đầu và cuối để trích xuất title, cwd và first message nếu thiếu
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content.split('\n');

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            messageCount++;
            if (messageCount > 500 && title && detectedCwd && firstMessage) {
              // Đã có đủ metadata cơ bản, dừng đọc sớm
              break;
            }

            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.cwd && !detectedCwd) {
                detectedCwd = String(parsed.cwd);
              }
              if (parsed.type === 'custom-title' && parsed.customTitle && !title) {
                title = String(parsed.customTitle);
              }
              if (parsed.type === 'ai-title' && parsed.aiTitle && !title) {
                title = String(parsed.aiTitle);
              }
              if (!firstMessage) {
                if (parsed.type === 'user' && parsed.message?.content) {
                  const c = parsed.message.content;
                  if (typeof c === 'string') {
                    firstMessage = c.replace(/<[^>]+>/g, '').trim();
                    if (!title && firstMessage) title = truncateText(firstMessage, 50);
                  } else if (Array.isArray(c)) {
                    const textPart = c.find((p: any) => p.type === 'text' && p.text);
                    if (textPart) {
                      firstMessage = textPart.text.replace(/<[^>]+>/g, '').trim();
                      if (!title && firstMessage) title = truncateText(firstMessage, 50);
                    }
                  }
                } else if (parsed.lastPrompt) {
                  firstMessage = String(parsed.lastPrompt).trim();
                  if (!title && firstMessage) title = truncateText(firstMessage, 50);
                }
              }
            } catch {
              // Bỏ qua dòng json lỗi
            }
          }

          candidates.push({
            source: 'claude',
            id: rawId,
            path: filePath,
            cwd: detectedCwd,
            title: title || 'Claude Session',
            created: new Date(detectedCreated).toISOString(),
            modified: new Date(detectedModified).toISOString(),
            firstMessage: firstMessage ? truncateText(firstMessage, 120) : undefined,
            messageCount,
          });
        } catch {
          // Bỏ qua file unreadable
        }
      }
    }
  }

  return candidates;
}

// Quét các session Codex từ thư mục ~/.codex
export async function scanCodexSessions(codexDir?: string): Promise<ForeignSessionCandidate[]> {
  const root = codexDir || path.join(os.homedir(), '.codex');
  const candidates: ForeignSessionCandidate[] = [];

  if (!fs.existsSync(root)) {
    return candidates;
  }

  // Quét đệ quy thư mục sessions
  const sessionsDir = path.join(root, 'sessions');
  const filesToScan: string[] = [];

  function collectJsonlFiles(dir: string, depth = 0) {
    if (depth > 5 || !fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          collectJsonlFiles(full, depth + 1);
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          filesToScan.push(full);
        }
      }
    } catch {
      // Bỏ qua lỗi đọc thư mục
    }
  }

  collectJsonlFiles(sessionsDir);

  // Đọc thêm index nếu có
  const titleMap = new Map<string, string>();
  const indexFile = path.join(root, 'session_index.jsonl');
  if (fs.existsSync(indexFile)) {
    try {
      const lines = fs.readFileSync(indexFile, 'utf-8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line);
          if (item.id && item.title) {
            titleMap.set(item.id, item.title);
          }
        } catch {}
      }
    } catch {}
  }

  for (const filePath of filesToScan) {
    try {
      const stat = fs.statSync(filePath);
      const rawId = path.basename(filePath, '.jsonl');

      let detectedCwd: string | undefined;
      let title = titleMap.get(rawId);
      let firstMessage: string | undefined;
      let messageCount = 0;
      let createdTs = stat.birthtimeMs || stat.mtimeMs;
      let modifiedTs = stat.mtimeMs;

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        messageCount++;

        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.timestamp) {
            const t = Date.parse(parsed.timestamp);
            if (!isNaN(t)) {
              if (t < createdTs) createdTs = t;
              if (t > modifiedTs) modifiedTs = t;
            }
          }
          if (parsed.type === 'session_meta' && parsed.payload) {
            if (parsed.payload.cwd) detectedCwd = parsed.payload.cwd;
            if (parsed.payload.id) rawId;
          }
          if (parsed.type === 'turn_context' && parsed.payload?.cwd && !detectedCwd) {
            detectedCwd = parsed.payload.cwd;
          }
          if (parsed.type === 'event_msg' && parsed.payload) {
            if (parsed.payload.type === 'thread_name_updated' && parsed.payload.thread_name) {
              title = parsed.payload.thread_name;
            }
            if (parsed.payload.type === 'user_message' && parsed.payload.message && !firstMessage) {
              firstMessage = String(parsed.payload.message).trim();
              if (!title) title = truncateText(firstMessage, 50);
            }
          }
          if (parsed.type === 'response_item' && parsed.payload?.type === 'message') {
            if (parsed.payload.role === 'user' && !firstMessage && parsed.payload.content) {
              const textObj = Array.isArray(parsed.payload.content)
                ? parsed.payload.content.find((c: any) => c.text || c.input_text)
                : null;
              if (textObj) {
                firstMessage = String(textObj.text || textObj.input_text).trim();
                if (!title) title = truncateText(firstMessage, 50);
              }
            }
          }
        } catch {
          // Bỏ qua dòng json lỗi
        }
      }

      candidates.push({
        source: 'codex',
        id: rawId,
        path: filePath,
        cwd: detectedCwd,
        title: title || 'Codex Session',
        created: new Date(createdTs).toISOString(),
        modified: new Date(modifiedTs).toISOString(),
        firstMessage: firstMessage ? truncateText(firstMessage, 120) : undefined,
        messageCount,
      });
    } catch {
      // Bỏ qua file unreadable
    }
  }

  return candidates;
}

// Quét toàn bộ session candidates từ Claude và Codex
export async function listImportCandidates(
  source?: 'claude' | 'codex',
  currentCwd?: string
): Promise<ForeignSessionCandidate[]> {
  const results: ForeignSessionCandidate[] = [];

  if (!source || source === 'claude') {
    const claudeList = await scanClaudeSessions();
    results.push(...claudeList);
  }

  if (!source || source === 'codex') {
    const codexList = await scanCodexSessions();
    results.push(...codexList);
  }

  // Sắp xếp theo modified mới nhất trước
  results.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

  return results;
}

// Chuyển đổi nội dung session Claude thành các bản ghi OMP session jsonl
export function convertClaudeSessionToOmp(
  content: string,
  candidate: ForeignSessionCandidate,
  targetCwd: string
): { ompJsonl: string; sessionId: string; title: string } {
  const lines = content.split('\n');
  const newSessionId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  let title = candidate.title || 'Imported Claude Session';

  const outputRecords: any[] = [];

  // Tạo header OMP
  outputRecords.push({
    type: 'title',
    v: 1,
    title,
    updatedAt: candidate.modified || nowIso,
    pad: ' '.repeat(160),
  });

  outputRecords.push({
    type: 'session',
    version: 3,
    id: newSessionId,
    timestamp: candidate.created || nowIso,
    cwd: targetCwd,
  });

  outputRecords.push({
    type: 'custom',
    customType: 'foreign_session_import',
    data: {
      source: 'claude',
      sourceId: candidate.id,
      sourcePath: candidate.path,
      originalCwd: candidate.cwd,
      importedAt: nowIso,
    },
    id: crypto.randomUUID().slice(0, 8),
    parentId: null,
    timestamp: candidate.created || nowIso,
  });

  let prevId: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed);
      const recordTimestamp = parsed.timestamp || nowIso;
      const recordId = (parsed.uuid || crypto.randomUUID()).slice(0, 8);

      if (parsed.type === 'custom-title' && parsed.customTitle) {
        title = String(parsed.customTitle);
        outputRecords[0].title = title;
      } else if (parsed.type === 'ai-title' && parsed.aiTitle) {
        title = String(parsed.aiTitle);
        outputRecords[0].title = title;
      }

      if (parsed.type === 'user' && parsed.message) {
        outputRecords.push({
          type: 'message',
          id: recordId,
          parentId: prevId,
          timestamp: recordTimestamp,
          message: {
            role: 'user',
            content: parsed.message.content || '',
          },
        });
        prevId = recordId;
      } else if (parsed.type === 'assistant' || (parsed.message && parsed.message.role === 'assistant')) {
        outputRecords.push({
          type: 'message',
          id: recordId,
          parentId: prevId,
          timestamp: recordTimestamp,
          message: {
            role: 'assistant',
            content: parsed.message.content || '',
            model: parsed.message.model || parsed.model,
          },
        });
        prevId = recordId;
      } else if (parsed.type === 'tool_use') {
        outputRecords.push({
          type: 'custom',
          customType: 'tool_execution_start',
          id: recordId,
          parentId: prevId,
          timestamp: recordTimestamp,
          data: {
            toolCallId: parsed.id || recordId,
            toolName: parsed.name,
            args: parsed.input,
          },
        });
        prevId = recordId;
      } else if (parsed.type === 'tool_result') {
        outputRecords.push({
          type: 'message',
          id: recordId,
          parentId: prevId,
          timestamp: recordTimestamp,
          message: {
            role: 'toolResult',
            toolCallId: parsed.tool_use_id || parsed.toolCallId || recordId,
            toolName: parsed.name || 'tool',
            content: parsed.content || '',
          },
        });
        prevId = recordId;
      }
    } catch {
      // Bỏ qua dòng json lỗi
    }
  }

  const ompJsonl = outputRecords.map((r) => JSON.stringify(r)).join('\n') + '\n';
  return { ompJsonl, sessionId: newSessionId, title };
}

// Chuyển đổi nội dung session Codex thành các bản ghi OMP session jsonl
export function convertCodexSessionToOmp(
  content: string,
  candidate: ForeignSessionCandidate,
  targetCwd: string
): { ompJsonl: string; sessionId: string; title: string } {
  const lines = content.split('\n');
  const newSessionId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  let title = candidate.title || 'Imported Codex Session';

  const outputRecords: any[] = [];

  outputRecords.push({
    type: 'title',
    v: 1,
    title,
    updatedAt: candidate.modified || nowIso,
    pad: ' '.repeat(160),
  });

  outputRecords.push({
    type: 'session',
    version: 3,
    id: newSessionId,
    timestamp: candidate.created || nowIso,
    cwd: targetCwd,
  });

  outputRecords.push({
    type: 'custom',
    customType: 'foreign_session_import',
    data: {
      source: 'codex',
      sourceId: candidate.id,
      sourcePath: candidate.path,
      originalCwd: candidate.cwd,
      importedAt: nowIso,
    },
    id: crypto.randomUUID().slice(0, 8),
    parentId: null,
    timestamp: candidate.created || nowIso,
  });

  let prevId: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed);
      const recordTimestamp = parsed.timestamp || nowIso;
      const recordId = crypto.randomUUID().slice(0, 8);

      if (parsed.type === 'event_msg' && parsed.payload) {
        if (parsed.payload.type === 'thread_name_updated' && parsed.payload.thread_name) {
          title = parsed.payload.thread_name;
          outputRecords[0].title = title;
        } else if (parsed.payload.type === 'user_message' && parsed.payload.message) {
          outputRecords.push({
            type: 'message',
            id: recordId,
            parentId: prevId,
            timestamp: recordTimestamp,
            message: {
              role: 'user',
              content: parsed.payload.message,
            },
          });
          prevId = recordId;
        } else if (parsed.payload.type === 'agent_message' && parsed.payload.message) {
          outputRecords.push({
            type: 'message',
            id: recordId,
            parentId: prevId,
            timestamp: recordTimestamp,
            message: {
              role: 'assistant',
              content: parsed.payload.message,
            },
          });
          prevId = recordId;
        }
      } else if (parsed.type === 'response_item' && parsed.payload) {
        if (parsed.payload.type === 'message') {
          const role = parsed.payload.role === 'assistant' ? 'assistant' : parsed.payload.role === 'user' ? 'user' : null;
          if (role && parsed.payload.content) {
            outputRecords.push({
              type: 'message',
              id: recordId,
              parentId: prevId,
              timestamp: recordTimestamp,
              message: {
                role,
                content: parsed.payload.content,
              },
            });
            prevId = recordId;
          }
        }
      }
    } catch {
      // Bỏ qua dòng json lỗi
    }
  }

  const ompJsonl = outputRecords.map((r) => JSON.stringify(r)).join('\n') + '\n';
  return { ompJsonl, sessionId: newSessionId, title };
}

// Thực hiện chuyển đổi và lưu session vào thư mục session OMP
export async function importForeignSession(
  candidate: ForeignSessionCandidate,
  targetCwd: string,
  customSessionDir?: string
): Promise<ImportSessionResult> {
  try {
    if (!fs.existsSync(candidate.path)) {
      return { success: false, error: `File session nguồn không tồn tại: ${candidate.path}` };
    }

    const rawContent = fs.readFileSync(candidate.path, 'utf-8');
    const converted =
      candidate.source === 'claude'
        ? convertClaudeSessionToOmp(rawContent, candidate, targetCwd)
        : convertCodexSessionToOmp(rawContent, candidate, targetCwd);

    const destDir = customSessionDir || getOmpSessionDir(targetCwd);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const dateSlug = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${dateSlug}_${converted.sessionId}.jsonl`;
    const destPath = path.join(destDir, filename);

    fs.writeFileSync(destPath, converted.ompJsonl, 'utf-8');

    return {
      success: true,
      sessionId: converted.sessionId,
      sessionPath: destPath,
      title: converted.title,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Chuyển đổi session thất bại',
    };
  }
}
