import type { InsertedEvent } from "../events/insert.js";

export interface Sendable {
  send(data: string): void;
}

interface BroadcastPayload {
  event: string;
  task_id: string | null;
  entity_ids: string[];
}

const GLOBAL_SENTINEL = "_global";

function extractEntityIds(payload: Record<string, unknown>): string[] {
  const candidates = [payload["subtask_id"], payload["entity_id"]];
  return candidates.filter((v): v is string => typeof v === "string");
}

function toPayload(event: InsertedEvent): BroadcastPayload {
  return {
    event: event.type,
    task_id: event.taskId === GLOBAL_SENTINEL ? null : event.taskId,
    entity_ids: extractEntityIds(event.payload),
  };
}

/**
 * S6: repo-scoped broadcaster. Each repo has its own subscriber set.
 * attachClient and detachClient require repoRoot.
 * listener(event, repoRoot) broadcasts only to clients subscribed to that repo.
 *
 * REQ-R-02
 */
export class BroadcastManager {
  readonly #clientsByRepo = new Map<string, Set<Sendable>>();

  /**
   * Register a WebSocket client as a subscriber for a specific repo.
   * @param ws - The client socket
   * @param repoRoot - Normalized repo root path (from normalizeRepoPath)
   */
  attachClient(ws: Sendable, repoRoot = ""): void {
    let set = this.#clientsByRepo.get(repoRoot);
    if (!set) {
      set = new Set<Sendable>();
      this.#clientsByRepo.set(repoRoot, set);
    }
    set.add(ws);
  }

  /**
   * Remove a WebSocket client from its repo's subscriber set.
   */
  detachClient(ws: Sendable, repoRoot = ""): void {
    const set = this.#clientsByRepo.get(repoRoot);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) {
      this.#clientsByRepo.delete(repoRoot);
    }
  }

  /**
   * Return the number of connected clients.
   * @param repoRoot - If provided, count only clients for that repo.
   *                   If omitted, return the global total.
   */
  clientCount(repoRoot?: string): number {
    if (repoRoot !== undefined) {
      return this.#clientsByRepo.get(repoRoot)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.#clientsByRepo.values()) {
      total += set.size;
    }
    return total;
  }

  /**
   * S5/S6: Broadcast to all clients subscribed to the given repoRoot.
   * Clients subscribed to a different repo do NOT receive this event.
   */
  readonly listener = (event: InsertedEvent, repoRoot: string): void => {
    const clients = this.#clientsByRepo.get(repoRoot);
    if (!clients || clients.size === 0) return;

    const message = JSON.stringify(toPayload(event));
    for (const client of clients) {
      try {
        client.send(message);
      } catch {
        // A broken socket must not interrupt delivery to siblings
      }
    }
  };
}
