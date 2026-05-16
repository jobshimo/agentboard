import type Database from "better-sqlite3";
import type { InsertedEvent } from "./insert.js";

type Db = InstanceType<typeof Database>;

interface EventRow {
  id: number;
  task_id: string;
  type: string;
  payload: string;
  origin: string;
}

interface PollResult {
  events: InsertedEvent[];
  cursor: number;
}

function toInsertedEvent(row: EventRow): InsertedEvent {
  return {
    id: row.id,
    taskId: row.task_id,
    type: row.type as InsertedEvent["type"],
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    origin: row.origin as InsertedEvent["origin"],
  };
}

function readCursor(db: Db, sessionId: string): number {
  const row = db
    .prepare("SELECT last_event_id FROM agent_sessions WHERE id = ?")
    .get(sessionId) as { last_event_id: number } | undefined;
  return row?.last_event_id ?? 0;
}

function advanceCursor(db: Db, sessionId: string, newCursor: number): void {
  db.prepare(
    "UPDATE agent_sessions SET last_event_id = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(newCursor, sessionId);
}

export function pollEvents(db: Db, sessionId: string, taskId?: string): PollResult {
  const cursor = readCursor(db, sessionId);

  const rows = taskId
    ? (db
        .prepare(
          "SELECT * FROM events WHERE id > ? AND task_id = ? ORDER BY id ASC",
        )
        .all(cursor, taskId) as EventRow[])
    : (db
        .prepare("SELECT * FROM events WHERE id > ? ORDER BY id ASC")
        .all(cursor) as EventRow[]);

  const events = rows.map(toInsertedEvent);

  if (events.length > 0) {
    const last = events[events.length - 1];
    if (!last) return { events: [], cursor };
    const newCursor = last.id;
    advanceCursor(db, sessionId, newCursor);
    return { events, cursor: newCursor };
  }

  return { events: [], cursor };
}
