/**
 * GC integration test: zombie session pruning preserves active sessions,
 * events are pruned correctly, and registry stays consistent.
 *
 * W5: cross-cutting integration tests — gc-integration
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrate.js";
import { runEventGc } from "../events/gc.js";
import { insertEvent } from "../events/insert.js";

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

function seedActiveSession(db: Db, id: string, cursor = 0): void {
  db.prepare(
    `INSERT INTO agent_sessions (id, last_event_id, connected_at, last_seen, active)
     VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`,
  ).run(id, cursor);
}

function seedZombieSession(db: Db, id: string, daysOld: number): void {
  db.prepare(
    `INSERT INTO agent_sessions (id, last_event_id, connected_at, last_seen, active)
     VALUES (?, 0, datetime('now', '-' || ? || ' days'), datetime('now', '-' || ? || ' days'), 0)`,
  ).run(id, daysOld, daysOld);
}

function countSessions(db: Db): number {
  return (db.prepare("SELECT COUNT(*) as c FROM agent_sessions").get() as { c: number }).c;
}

function countEvents(db: Db): number {
  return (db.prepare("SELECT COUNT(*) as c FROM events").get() as { c: number }).c;
}

describe("GC integration", () => {
  let db: Db;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  it("deletes zombie sessions older than threshold", () => {
    seedZombieSession(db, "zombie-1", 10); // 10 days old
    seedZombieSession(db, "zombie-2", 5);  // 5 days old

    const report = runEventGc(db, {
      zombieThresholdMs: 3 * 24 * 60 * 60 * 1000, // 3 days
      perTaskBackstop: 100,
    });

    expect(report.zombiesDeleted).toBe(2);
    expect(countSessions(db)).toBe(0);
  });

  it("preserves active sessions below the threshold", () => {
    seedActiveSession(db, "active-1"); // last_seen = now

    const report = runEventGc(db, {
      zombieThresholdMs: 3 * 24 * 60 * 60 * 1000, // 3 days
      perTaskBackstop: 100,
    });

    expect(report.zombiesDeleted).toBe(0);
    expect(countSessions(db)).toBe(1);
  });

  it("deletes events already consumed by all sessions", () => {
    seedTask(db, "T-1");
    seedActiveSession(db, "sess-1", 0);

    // Insert 3 events
    const id1 = insertEvent(db, { taskId: "T-1", type: "comment_added", payload: {}, origin: "agent" });
    const id2 = insertEvent(db, { taskId: "T-1", type: "comment_added", payload: {}, origin: "agent" });
    insertEvent(db, { taskId: "T-1", type: "comment_added", payload: {}, origin: "agent" });

    expect(countEvents(db)).toBe(3);

    // Advance session cursor to id2 (consumed events 1 and 2)
    db.prepare("UPDATE agent_sessions SET last_event_id = ? WHERE id = ?").run(id2, "sess-1");

    const report = runEventGc(db, {
      zombieThresholdMs: 7 * 24 * 60 * 60 * 1000,
      perTaskBackstop: 100,
    });

    // Events with id <= id2 should be deleted (2 events)
    expect(report.eventsDeleted).toBe(2);
    expect(countEvents(db)).toBe(1);
  });

  it("trims per-task backstop when event count exceeds limit", () => {
    seedTask(db, "T-1");
    seedActiveSession(db, "sess-1");

    // Insert 15 events for the same task
    for (let i = 0; i < 15; i++) {
      insertEvent(db, { taskId: "T-1", type: "comment_added", payload: { i }, origin: "agent" });
    }

    expect(countEvents(db)).toBe(15);

    const report = runEventGc(db, {
      zombieThresholdMs: 7 * 24 * 60 * 60 * 1000,
      perTaskBackstop: 10, // keep max 10
    });

    // 15 - 10 = 5 events should be trimmed
    expect(report.backstopDeleted).toBe(5);
    expect(countEvents(db)).toBe(10);
  });

  it("does not prune active sessions that are below threshold", () => {
    seedActiveSession(db, "sess-active");
    seedZombieSession(db, "sess-zombie", 8);

    const report = runEventGc(db, {
      zombieThresholdMs: 3 * 24 * 60 * 60 * 1000,
      perTaskBackstop: 100,
    });

    expect(report.zombiesDeleted).toBe(1);
    expect(countSessions(db)).toBe(1); // active session remains
  });
});
