import type Database from "better-sqlite3";
import type { InsertedEvent, EventListener } from "./insert.js";
import type { EventType } from "./types.js";

type Db = InstanceType<typeof Database>;

interface RegisterOpts {
  taskId?: string;
  types?: EventType[];
  timeoutMs: number;
}

interface Waiter {
  db: Db;
  sessionId: string;
  taskId: string | undefined;
  types: EventType[] | undefined;
  resolve: (event: InsertedEvent | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

function matchesWaiter(waiter: Waiter, event: InsertedEvent): boolean {
  if (waiter.taskId !== undefined && event.taskId !== waiter.taskId) return false;
  if (waiter.types !== undefined && !waiter.types.includes(event.type)) return false;
  return true;
}

function advanceCursor(db: Db, sessionId: string, eventId: number): void {
  db.prepare(
    "UPDATE agent_sessions SET last_event_id = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(eventId, sessionId);
}

export class WaiterRegistry {
  readonly #waiters = new Set<Waiter>();

  register(db: Db, sessionId: string, opts: RegisterOpts): Promise<InsertedEvent | null> {
    return new Promise<InsertedEvent | null>((resolve) => {
      const waiter: Waiter = {
        db,
        sessionId,
        taskId: opts.taskId,
        types: opts.types,
        resolve,
        timer: setTimeout(() => {
          this.#waiters.delete(waiter);
          resolve(null);
        }, opts.timeoutMs),
      };
      this.#waiters.add(waiter);
    });
  }

  readonly listener: EventListener = (event: InsertedEvent): void => {
    for (const waiter of this.#waiters) {
      if (matchesWaiter(waiter, event)) {
        clearTimeout(waiter.timer);
        this.#waiters.delete(waiter);
        advanceCursor(waiter.db, waiter.sessionId, event.id);
        waiter.resolve(event);
      }
    }
  };

  size(): number {
    return this.#waiters.size;
  }
}
