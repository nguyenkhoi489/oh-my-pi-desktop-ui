export interface FollowUpQueueItem {
  id: string;
  content: string;
  files?: string[];
  timestamp: number;
}

// Engine maintains queue; drop oldest items consumed by engine per queuedMessageCount
export function reconcileFollowUpQueue(
  queue: FollowUpQueueItem[],
  engineQueuedCount: number
): { queue: FollowUpQueueItem[]; consumedIds: string[] } {
  const keep = Math.max(0, Math.min(queue.length, Math.floor(engineQueuedCount)));
  if (keep === queue.length) return { queue, consumedIds: [] };
  const consumed = queue.slice(0, queue.length - keep);
  return { queue: queue.slice(queue.length - keep), consumedIds: consumed.map((item) => item.id) };
}
