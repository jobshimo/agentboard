import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../db/migrate.js";
import { pollEvents } from "../poll.js";
import { insertEvent } from "../insert.js";

type Db = InstanceType<typeof Database>;

function makeDb(): Db {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

function seedSession(db: Db, id: string, lastEventId = 0): void {
  db.prepare(
    `INSERT INTO agent_sessions (id, last_event_id, connected_at, last_seen)
     VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  ).run(id, lastEventId);
}

function seedTask(db: Db, id: string): void {
  db.prepare(
    `INSERT INTO tasks (id, type, title, workflow_id, workflow_snapshot)
     VALUES (?, 'local', 'Task', 'wf', '{}')`,
  ).run(id);
}

describe("pollEvents", () => {
  let db: Db;

  beforeEach(() => {
    db = makeDb();
  });

  it("returns events with id > cursor, ordered ASC", () => {
    seedTask(db, "T-1");
    seedSession(db, "S-1", 0);

    insertEvent(db, { taskId: "T-1", type: "comment_added", payload: { body: "a" }, origin: "human" });
    insertEvent(db, { taskId: "T-1", type: "comment_added", payload: { body: "b" }, origin: "human" });

    const { events, cursor } = pollEvents(db, "S-1");

    expect(events).toHaveLength(2);
    expect(events[0].payload).toEqual({ body: "a" });
    expect(events[1].payload).toEqual({ body: "b" });
    expect(cursor).toBe(events[1].id);
  });

  it("advances the session cursor after polling", () => {
    seedTask(db, "T-1");
    seedSession(db, "S-1", 0);
    insertEvent(db, { taskId: "T-1", type: "comment_added", payload: {}, origin: "human" });

    const { cursor } = pollEvents(db, "S-1");

    const row = db.prepare("SELECT last_event_id FROM agent_sessions WHERE id = ?").get("S-1") as { last_event_id: number };
    expect(row.last_event_id).toBe(cursor);
  });

  it("returns empty array and unchanged cursor when no new events", () => {
    seedTask(db, "T-1");
    seedSession(db, "S-1", 5);

    const { events, cursor } = pollEvents(db, "S-1");

    expect(events).toHaveLength(0);
    expect(cursor).toBe(5);
  });

  it("filters by taskId when specified", () => {
    seedTask(db, "T-1");
    seedTask(db, "T-2");
    seedSession(db, "S-1", 0);

    insertEvent(db, { taskId: "T-1", type: "comment_added", payload: {}, origin: "human" });
    insertEvent(db, { taskId: "T-2", type: "comment_added", payload: {}, origin: "human" });

    const { events } = pollEvents(db, "S-1", "T-1");

    expect(events).toHaveLength(1);
    expect(events[0].taskId).toBe("T-1");
  });

  it("two sessions read independently and do not interfere", () => {
    seedTask(db, "T-1");
    seedSession(db, "S-1", 0);
    seedSession(db, "S-2", 0);

    insertEvent(db, { taskId: "T-1", type: "comment_added", payload: {}, origin: "human" });
    insertEvent(db, { taskId: "T-1", type: "comment_added", payload: {}, origin: "human" });
    insertEvent(db, { taskId: "T-1", type: "comment_added", payload: {}, origin: "human" });

    const r1 = pollEvents(db, "S-1");
    // Advance S-2 past first event manually
    db.prepare("UPDATE agent_sessions SET last_event_id = ? WHERE id = 'S-2'").run(r1.events[0].id);

    const r2 = pollEvents(db, "S-2");

    expect(r1.events).toHaveLength(3);
    expect(r2.events).toHaveLength(2);
  });

  it("cursor stays unchanged when taskId filter returns nothing", () => {
    seedTask(db, "T-1");
    seedTask(db, "T-2");
    seedSession(db, "S-1", 0);

    insertEvent(db, { taskId: "T-2", type: "comment_added", payload: {}, origin: "human" });

    const { events, cursor } = pollEvents(db, "S-1", "T-1");

    expect(events).toHaveLength(0);
    // Cursor stays at 0 — no events matched the filter so nothing to advance to
    expect(cursor).toBe(0);
  });
});
