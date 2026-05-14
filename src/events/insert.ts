import type Database from "better-sqlite3";
import { isValidEventType } from "./types.js";
import type { EventType, EventOrigin } from "./types.js";

type Db = InstanceType<typeof Database>;

export interface InsertEventOpts {
  taskId: string;
  type: EventType;
  payload: Record<string, unknown>;
  origin: EventOrigin;
}

export interface InsertedEvent extends InsertEventOpts {
  id: number;
}

export type EventListener = (event: InsertedEvent) => void;

export interface InsertEventHooks {
  listeners?: readonly EventListener[];
}

export function insertEvent(
  db: Db,
  opts: InsertEventOpts,
  hooks: InsertEventHooks = {},
): number {
  if (!isValidEventType(opts.type)) {
    throw new Error(`unknown event type: "${opts.type}"`);
  }

  const result = db
    .prepare(
      `INSERT INTO events (task_id, type, payload, origin) VALUES (?, ?, ?, ?)`,
    )
    .run(opts.taskId, opts.type, JSON.stringify(opts.payload), opts.origin);

  const id = Number(result.lastInsertRowid);
  const event: InsertedEvent = { ...opts, id };

  for (const listener of hooks.listeners ?? []) {
    listener(event);
  }

  return id;
}
