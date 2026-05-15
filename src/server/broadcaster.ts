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

export class BroadcastManager {
  readonly #clients = new Set<Sendable>();

  attachClient(ws: Sendable): void {
    this.#clients.add(ws);
  }

  detachClient(ws: Sendable): void {
    this.#clients.delete(ws);
  }

  clientCount(): number {
    return this.#clients.size;
  }

  readonly listener = (event: InsertedEvent): void => {
    const message = JSON.stringify(toPayload(event));
    for (const client of this.#clients) {
      try {
        client.send(message);
      } catch {
        // A broken socket must not interrupt delivery to siblings
      }
    }
  };
}
