import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../db/migrate.js";
import { runEventGc } from "../gc.js";

type Db = InstanceType<typeof Database>;

function makeDb(): Db {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

function seedTask(db: Db, id: string): void {
  db.prepare(
    `INSERT INTO tasks (id, type, title, workflow_id, workflow_snapshot)
     VALUES (?, 'local', 'Task', 'wf', '{}')`,
  ).run(id);
}

function seedSession(db: Db, id: string, lastEventId: number, lastSeenDaysAgo: number): void {
  db.prepare(
    `INSERT INTO agent_sessions (id, last_event_id, connected_at, last_seen)
     VALUES (?, ?, CURRENT_TIMESTAMP, datetime('now', ?))`,
  ).run(id, lastEventId, `-${lastSeenDaysAgo} days`);
}

function insertRawEvent(db: Db, taskId: string): number {
  const r = db
    .prepare(`INSERT INTO events (task_id, type, payload, origin) VALUES (?, 'comment_added', '{}', 'human')`)
    .run(taskId);
  return Number(r.lastInsertRowid);
}

function eventCount(db: Db): number {
  return (db.prepare("SELECT COUNT(*) as c FROM events").get() as { c: number }).c;
}

function eventCountForTask(db: Db, taskId: string): number {
  return (db.prepare("SELECT COUNT(*) as c FROM events WHERE task_id = ?").get(taskId) as { c: number }).c;
}

function sessionCount(db: Db): number {
  return (db.prepare("SELECT COUNT(*) as c FROM agent_sessions").get() as { c: number }).c;
}

describe("runEventGc", () => {
  let db: Db;
  const opts = { zombieThresholdMs: 30 * 24 * 60 * 60 * 1000, perTaskBackstop: 10000 };

  beforeEach(() => {
    db = makeDb();
  });

  it("deletes events consumed by all active sessions (mechanism A)", () => {
    seedTask(db, "T-1");
    seedSession(db, "S-1", 0, 1); // active, cursor at 0
    seedSession(db, "S-2", 0, 1); // active, cursor at 0

    const id1 = insertRawEvent(db, "T-1");
    const id2 = insertRawEvent(db, "T-1");

    // Both sessions advance past id2
    db.prepare("UPDATE agent_sessions SET last_event_id = ?").run(id2);

    const report = runEventGc(db, opts);

    expect(eventCount(db)).toBe(0);
    expect(report.eventsDeleted).toBeGreaterThanOrEqual(2);
  });

  it("does not delete events that active sessions have not yet consumed", () => {
    seedTask(db, "T-1");
    seedSession(db, "S-1", 0, 1); // cursor at 0 — hasn't consumed anything
    seedSession(db, "S-2", 0, 1);

    insertRawEvent(db, "T-1");
    insertRawEvent(db, "T-1");

    runEventGc(db, opts);

    expect(eventCount(db)).toBe(2);
  });

  it("excludes zombie sessions from consumed-by-all calculation (mechanism B)", () => {
    seedTask(db, "T-1");
    // Zombie: last_seen 40 days ago, cursor still at 0
    seedSession(db, "zombie", 0, 40);
    // Active session that consumed up to the last event
    const id = insertRawEvent(db, "T-1");
    seedSession(db, "active", id, 1);

    const report = runEventGc(db, opts);

    // Zombie should be deleted
    expect(sessionCount(db)).toBe(1);
    expect(report.zombiesDeleted).toBe(1);
    // Events below active session's cursor are purged
    expect(eventCount(db)).toBe(0);
  });

  it("removes zombie sessions (mechanism B) when no active sessions remain", () => {
    seedTask(db, "T-1");
    seedSession(db, "zombie-only", 0, 60);
    insertRawEvent(db, "T-1");

    const report = runEventGc(db, opts);

    expect(sessionCount(db)).toBe(0);
    expect(report.zombiesDeleted).toBe(1);
  });

  it("trims per-task backstop (mechanism C)", () => {
    const backstop = 10;
    const customOpts = { ...opts, perTaskBackstop: backstop };
    seedTask(db, "T-1");

    // Insert backstop + 5 events (15 total)
    for (let i = 0; i < backstop + 5; i++) {
      insertRawEvent(db, "T-1");
    }

    const report = runEventGc(db, customOpts);

    expect(eventCountForTask(db, "T-1")).toBe(backstop);
    expect(report.backstopDeleted).toBeGreaterThanOrEqual(5);
  });

  it("backstop only trims from the named task, not from others", () => {
    const backstop = 5;
    const customOpts = { ...opts, perTaskBackstop: backstop };
    seedTask(db, "T-1");
    seedTask(db, "T-2");

    for (let i = 0; i < backstop + 3; i++) {
      insertRawEvent(db, "T-1");
    }
    for (let i = 0; i < 3; i++) {
      insertRawEvent(db, "T-2");
    }

    runEventGc(db, customOpts);

    expect(eventCountForTask(db, "T-1")).toBe(backstop);
    expect(eventCountForTask(db, "T-2")).toBe(3); // untouched
  });

  it("is idempotent — running twice produces the same result", () => {
    seedTask(db, "T-1");
    seedSession(db, "S-1", 0, 1);
    const id = insertRawEvent(db, "T-1");
    db.prepare("UPDATE agent_sessions SET last_event_id = ?").run(id);

    runEventGc(db, opts);
    const r2 = runEventGc(db, opts);

    expect(eventCount(db)).toBe(0);
    expect(r2.eventsDeleted).toBe(0); // nothing left to delete
  });

  it("returns a GcReport with deletion counts", () => {
    seedTask(db, "T-1");
    seedSession(db, "S-1", 0, 1);
    const id = insertRawEvent(db, "T-1");
    db.prepare("UPDATE agent_sessions SET last_event_id = ?").run(id);

    const report = runEventGc(db, opts);

    expect(typeof report.eventsDeleted).toBe("number");
    expect(typeof report.zombiesDeleted).toBe("number");
    expect(typeof report.backstopDeleted).toBe("number");
  });
});
