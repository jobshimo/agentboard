/**
 * src/events/insert.ts
 *
 * Appends an event row to the events table.
 *
 * Contract:
 *   - Validates the event type against the canonical EventType enum; rejects
 *     unknown types with a thrown error (per event-queue.md §event type enum).
 *   - Does NOT open its own transaction. Callers wrap domain writes in
 *     BEGIN IMMEDIATE and include insertEvent inside that transaction.
 *   - Calls notifyWaiters (stub until S6) and broadcastWs (stub until S5)
 *     after the row is inserted so the hooks are in place for later slices.
 */

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

/**
 * Stub: wakes in-memory waiters registered for this event.
 * Replaced in S6 (events/wait.ts) with the real WaiterRegistry.
 */
function notifyWaiters(_event: InsertEventOpts & { id: number }): void {
  // S6 will wire the real implementation here
}

/**
 * Stub: broadcasts the event to all connected WebSocket clients.
 * Replaced in S5 (server/ws.ts) with the real BroadcastManager.
 */
function broadcastWs(_event: InsertEventOpts & { id: number }): void {
  // S5 will wire the real implementation here
}

/**
 * Appends an event to the events table and invokes downstream hooks.
 *
 * Throws if `opts.type` is not one of the 10 canonical event types.
 * Must be called within the caller's open transaction.
 */
export function insertEvent(db: Db, opts: InsertEventOpts): number {
  if (!isValidEventType(opts.type)) {
    throw new Error(`unknown event type: "${opts.type}"`);
  }

  const result = db.prepare(`
    INSERT INTO events (task_id, type, payload, origin)
    VALUES (?, ?, ?, ?)
  `).run(opts.taskId, opts.type, JSON.stringify(opts.payload), opts.origin);

  const id = Number(result.lastInsertRowid);

  notifyWaiters({ ...opts, id });
  broadcastWs({ ...opts, id });

  return id;
}
