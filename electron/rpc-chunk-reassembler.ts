/**
 * RPC Chunk Reassembler for OMP RPC Protocol
 * 
 * Handles reassembly of chunked RPC frames emitted by OMP when payload size
 * exceeds maxFrameBytes (1MB). Each rpc_chunk frame carries:
 * - chunkId: string
 * - index: number (0..count-1)
 * - count: number (total chunks)
 * - byteLength: number (total byte length of reassembled UTF-8 buffer)
 * - data: string (base64 encoded byte chunk)
 * 
 * Pure TypeScript module with no Electron dependencies.
 */

import type { OmpFrame, RpcChunkFrame } from './omp-rpc-types.ts';

interface PendingChunkGroup {
  count: number;
  byteLength: number;
  parts: (Buffer | null)[];
  receivedCount: number;
  createdAt: number;
}

export interface RpcChunkReassemblerOptions {
  maxReassembledBytes?: number;
  chunkTimeoutMs?: number;
}

export class RpcChunkReassembler {
  private pending = new Map<string, PendingChunkGroup>();
  private maxReassembledBytes: number;
  private chunkTimeoutMs: number;

  constructor(options: RpcChunkReassemblerOptions = {}) {
    // Default 64MB matching ReadyFrame.maxReassembledFrameBytes
    this.maxReassembledBytes = options.maxReassembledBytes ?? 67108864;
    // Timeout for incomplete chunk sets: 60s
    this.chunkTimeoutMs = options.chunkTimeoutMs ?? 60000;
  }

  public setMaxReassembledBytes(maxBytes: number): void {
    if (typeof maxBytes === 'number' && maxBytes > 0) {
      this.maxReassembledBytes = maxBytes;
    }
  }

  public getMaxReassembledBytes(): number {
    return this.maxReassembledBytes;
  }

  public push(chunk: unknown): OmpFrame | null {
    if (!chunk || typeof chunk !== 'object') return null;
    const c = chunk as Partial<RpcChunkFrame>;
    if (c.type !== 'rpc_chunk') return null;

    if (
      typeof c.chunkId !== 'string' ||
      !c.chunkId ||
      typeof c.index !== 'number' ||
      typeof c.count !== 'number' ||
      typeof c.data !== 'string'
    ) {
      return null;
    }

    const { chunkId, index, count, byteLength, data } = c;

    if (count <= 0 || index < 0 || index >= count) {
      return null;
    }

    if (typeof byteLength === 'number' && byteLength > this.maxReassembledBytes) {
      console.warn(
        `[RpcChunkReassembler] Chunk group ${chunkId} byteLength (${byteLength}) exceeds maxReassembledBytes (${this.maxReassembledBytes})`
      );
      this.pending.delete(chunkId);
      return null;
    }

    this.pruneStale();

    let group = this.pending.get(chunkId);
    if (!group) {
      group = {
        count,
        byteLength: typeof byteLength === 'number' ? byteLength : 0,
        parts: new Array(count).fill(null),
        receivedCount: 0,
        createdAt: Date.now(),
      };
      this.pending.set(chunkId, group);
    }

    let decodedBuffer: Buffer;
    try {
      decodedBuffer = Buffer.from(data, 'base64');
    } catch (err) {
      console.warn(`[RpcChunkReassembler] Failed to decode base64 chunk ${index} for ${chunkId}:`, err);
      return null;
    }

    if (group.parts[index] === null) {
      group.parts[index] = decodedBuffer;
      group.receivedCount++;
    }

    if (group.receivedCount === group.count) {
      this.pending.delete(chunkId);
      try {
        const fullBuffer = Buffer.concat(group.parts as Buffer[]);
        const jsonStr = fullBuffer.toString('utf-8');
        const parsed = JSON.parse(jsonStr);
        if (parsed && typeof parsed === 'object') {
          return parsed as OmpFrame;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[RpcChunkReassembler] Failed to parse reassembled JSON for ${chunkId}:`, msg);
      }
    }

    return null;
  }

  public reset(): void {
    this.pending.clear();
  }

  public getPendingCount(): number {
    return this.pending.size;
  }

  private pruneStale(): void {
    const now = Date.now();
    for (const [chunkId, group] of this.pending.entries()) {
      if (now - group.createdAt > this.chunkTimeoutMs) {
        this.pending.delete(chunkId);
      }
    }
  }
}
