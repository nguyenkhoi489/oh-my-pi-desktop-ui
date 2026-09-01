import fs from 'fs';
import path from 'path';
import os from 'os';

export interface RpcFrameLogEntry {
  timestamp: string;
  dir: 'in' | 'out';
  frame: unknown;
}

/**
 * RpcFrameLogger records all inbound and outbound NDJSON frames
 * to disk for protocol debugging, analytics, and schema verification.
 * 
 * Designed to be completely fail-silent so disk I/O issues never crash the bridge.
 */
export class RpcFrameLogger {
  private logFilePath: string;

  constructor(customLogPath?: string) {
    if (customLogPath) {
      this.logFilePath = customLogPath;
    } else {
      let logsDir = '';
      try {
        if (process.versions?.electron) {
          // Dynamic require to prevent crash when loaded in pure Node tests
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const electron = require('electron');
          if (electron?.app?.getPath) {
            logsDir = electron.app.getPath('logs');
          }
        }
      } catch {
        // Ignored, will use fallback
      }

      if (!logsDir) {
        logsDir = path.join(os.homedir(), '.omp-agent', 'logs');
      }
      this.logFilePath = path.join(logsDir, 'rpc-frames.ndjson');
    }
  }

  /**
   * Returns current log file path.
   */
  public getLogPath(): string {
    return this.logFilePath;
  }

  /**
   * Truncates or resets the log file (called when starting a new engine session).
   */
  public truncate(): void {
    try {
      const dir = path.dirname(this.logFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.logFilePath, '', 'utf-8');
    } catch (err) {
      // Fail-silent
      console.warn('[RpcFrameLogger] Failed to truncate log file:', err);
    }
  }

  /**
   * Logs a single frame with direction and timestamp.
   */
  public log(dir: 'in' | 'out', frame: unknown): void {
    try {
      const entry: RpcFrameLogEntry = {
        timestamp: new Date().toISOString(),
        dir,
        frame,
      };
      const dirPath = path.dirname(this.logFilePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      fs.appendFileSync(this.logFilePath, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (err) {
      // Fail-silent
    }
  }
}
