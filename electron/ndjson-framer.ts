/**
 * NDJSON Framer for OMP RPC Protocol
 * 
 * Provides robust stream framing, chunk reassembly, and error resilience:
 * - Buffers incomplete chunks until a newline is received
 * - Parses batches of newline-delimited JSON frames
 * - Safely handles and diverts non-JSON raw lines (e.g. stderr/native logs)
 * - Guards against buffer exhaustion by enforcing maxFrameBytes
 * - Pure TypeScript/JS module with NO Electron dependencies
 */

import type { OmpFrame } from './omp-rpc-types';

export interface NdjsonFramerOptions {
  /** Maximum allowed size in bytes for a single frame line (default: 1048576 / 1MB) */
  maxFrameBytes?: number;
  /** Callback triggered when a non-JSON line or unparseable text is received */
  onRawLine?: (line: string) => void;
  /** Callback triggered on frame error or size violation */
  onError?: (error: Error, raw: string) => void;
}

export class NdjsonFramer {
  private buffer = '';
  private maxFrameBytes: number;
  private onRawLine?: (line: string) => void;
  private onError?: (error: Error, raw: string) => void;

  constructor(options: NdjsonFramerOptions = {}) {
    this.maxFrameBytes = options.maxFrameBytes ?? 1048576; // 1MB default
    this.onRawLine = options.onRawLine;
    this.onError = options.onError;
  }

  /**
   * Appends incoming chunk data and returns all complete parsed frames.
   * Unfinished lines remain in the buffer for subsequent chunks.
   */
  public push(chunk: string): OmpFrame[] {
    if (!chunk) return [];

    this.buffer += chunk;

    // Check if buffer without newlines exceeds safety threshold
    if (!this.buffer.includes('\n')) {
      const pendingBytes = this.getByteLength(this.buffer);
      if (pendingBytes > this.maxFrameBytes) {
        const discarded = this.buffer;
        this.buffer = '';
        const err = new Error(
          `Buffer exceeded maxFrameBytes (${this.maxFrameBytes}) without newline delimiter`
        );
        this.onError?.(err, discarded);
        this.onRawLine?.(discarded);
      }
      return [];
    }

    const lines = this.buffer.split('\n');
    // The last element is either empty (if ended with \n) or an incomplete partial frame
    this.buffer = lines.pop() ?? '';

    const frames: OmpFrame[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const lineBytes = this.getByteLength(trimmed);
      if (lineBytes > this.maxFrameBytes) {
        const err = new Error(
          `Frame size (${lineBytes} bytes) exceeded maxFrameBytes (${this.maxFrameBytes})`
        );
        this.onError?.(err, trimmed);
        this.onRawLine?.(trimmed);
        continue;
      }

      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') {
          frames.push(parsed as OmpFrame);
        } else {
          // Valid JSON primitive like "hello" or 123, but not an RPC object
          this.onRawLine?.(trimmed);
        }
      } catch {
        // Non-JSON line (e.g. native startup banner, debug output)
        this.onRawLine?.(trimmed);
      }
    }

    return frames;
  }

  /**
   * Encodes a command or frame object into a single NDJSON line with trailing newline.
   */
  public encode(frame: unknown): string {
    return JSON.stringify(frame) + '\n';
  }

  /**
   * Clears any accumulated incomplete buffer.
   */
  public reset(): void {
    this.buffer = '';
  }

  /**
   * Returns current pending unparsed buffer content.
   */
  public getPendingBuffer(): string {
    return this.buffer;
  }

  /**
   * Returns configured maxFrameBytes limit.
   */
  public getMaxFrameBytes(): number {
    return this.maxFrameBytes;
  }

  /**
   * Updates maxFrameBytes (e.g. dynamically negotiated from ready frame).
   */
  public setMaxFrameBytes(maxBytes: number): void {
    if (maxBytes > 0) {
      this.maxFrameBytes = maxBytes;
    }
  }

  private getByteLength(str: string): number {
    if (typeof Buffer !== 'undefined') {
      return Buffer.byteLength(str, 'utf8');
    }
    return new TextEncoder().encode(str).length;
  }
}
