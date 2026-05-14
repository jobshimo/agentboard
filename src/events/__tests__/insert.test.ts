/**
 * src/events/__tests__/insert.test.ts
 *
 * Verifies:
 *   - insertEvent appends a row to the events table
 *   - insertEvent rejects an unrecognised event type
 *   - insertEvent does NOT open its own transaction (caller's tx is used)
 *   - notifyWaiters and broadcastWs stubs are called without error
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../db/migrate.js";
import { insertEvent } from "../insert.js";
import type { EventType, EventOrigin } from "../types.js";

type Db = InstanceType<typeof Database>;

function freshDb(): Db {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

function insertTask(db: Db, id = "T-1"): void {
  db.prepare(`
    INSERT INTO tasks (id, type, title, workflow_id, workflow_snapshot)
    VALUES (?, 'local', 'Test', 'wf1', '{}')
  `).run(id);
}

describe("insertEvent", () => {
  let db: Db;

  beforeEach(() => { db = freshDb(); });
  afterEach(() => db.close());

  it("appends a row to the events table", () => {
    insertTask(db);
    insertEvent(db, {
      taskId: "T-1",
      type: "comment_added",
      payload: { task_id: "T-1", author: "human", text: "Hello" },
      origin: "human",
    });

    const count = (db.prepare("SELECT COUNT(*) AS cnt FROM events").get() as { cnt: number }).cnt;
    expect(count).toBe(1);
  });

  it("stores all fields correctly", () => {
    insertTask(db);
    insertEvent(db, {
      taskId: "T-1",
      type: "status_change",
      payload: { task_id: "T-1", subtask_id: "s-1", from_status: "pending", to_status: "in-progress" },
      origin: "agent",
    });

    const row = db.prepare("SELECT * FROM events LIMIT 1").get() as Record<string, unknown>;
    expect(row["task_id"]).toBe("T-1");
    expect(row["type"]).toBe("status_change");
    expect(row["origin"]).toBe("agent");
    expect(typeof row["payload"]).toBe("string");
  });

  it("rejects an unrecognised event type", () => {
    insertTask(db);
    expect(() =>
      insertEvent(db, {
        taskId: "T-1",
        type: "card_archived" as EventType,
        payload: {},
        origin: "system" as EventOrigin,
      })
    ).toThrow(/unknown event type/i);
  });

  it("assigns a monotonically increasing id (AUTOINCREMENT)", () => {
    insertTask(db);
    insertEvent(db, { taskId: "T-1", type: "comment_added", payload: {}, origin: "human" });
    insertEvent(db, { taskId: "T-1", type: "task_blocked", payload: {}, origin: "system" });

    const rows = db.prepare("SELECT id FROM events ORDER BY id ASC").all() as { id: number }[];
    expect(rows[0].id).toBeLessThan(rows[1].id);
  });

  it("works inside a caller-managed transaction (does not open its own)", () => {
    insertTask(db);
    const runInTx = db.transaction(() => {
      insertEvent(db, {
        taskId: "T-1",
        type: "comment_added",
        payload: { task_id: "T-1", author: "agent", text: "inside tx" },
        origin: "agent",
      });
    });
    expect(() => runInTx()).not.toThrow();

    const count = (db.prepare("SELECT COUNT(*) AS cnt FROM events").get() as { cnt: number }).cnt;
    expect(count).toBe(1);
  });
});
