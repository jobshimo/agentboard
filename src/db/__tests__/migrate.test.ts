import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../migrate.js";
import { getTableNames, getIndexNames } from "./helpers.js";

describe("runMigrations", () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("applies all migrations on a fresh database", () => {
    runMigrations(db);

    const tables = getTableNames(db);
    expect(tables).toContain("tasks");
    expect(tables).toContain("subtasks");
    expect(tables).toContain("discussion_entries");
    expect(tables).toContain("events");
    expect(tables).toContain("agent_sessions");
    expect(tables).toContain("schema_migrations");
  });

  it("is idempotent — running twice does not throw or duplicate rows", () => {
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();

    const count = (
      db.prepare("SELECT COUNT(*) AS c FROM schema_migrations").get() as {
        c: number;
      }
    ).c;
    // Exactly one migration file applied (0001_init.sql)
    expect(count).toBe(1);
  });

  it("records one row per migration file in schema_migrations", () => {
    runMigrations(db);

    const rows = db
      .prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all() as { version: number }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].version).toBe(1);
  });

  it("creates required indexes", () => {
    runMigrations(db);

    const indexes = getIndexNames(db);
    expect(indexes).toContain("idx_tasks_status");
    expect(indexes).toContain("idx_tasks_workflow");
    expect(indexes).toContain("idx_subtasks_task");
    expect(indexes).toContain("idx_subtasks_status");
    expect(indexes).toContain("idx_discussion_task");
    expect(indexes).toContain("idx_events_task");
    expect(indexes).toContain("idx_sessions_lastseen");
  });

  it("enforces the tasks.type CHECK constraint", () => {
    runMigrations(db);

    expect(() => {
      db.prepare(
        `INSERT INTO tasks (id, type, title, workflow_id, workflow_snapshot)
         VALUES ('T-1', 'invalid', 'Test', 'wf1', '{}')`
      ).run();
    }).toThrow();
  });

  it("enforces the subtasks.status CHECK constraint", () => {
    runMigrations(db);

    db.prepare(
      `INSERT INTO tasks (id, type, title, workflow_id, workflow_snapshot)
       VALUES ('T-1', 'local', 'Test', 'wf1', '{}')`
    ).run();

    expect(() => {
      db.prepare(
        `INSERT INTO subtasks (id, task_id, type, label, position)
         VALUES ('s-1', 'T-1', 'implement', 'Implement', 1)`
      ).run();
    }).not.toThrow(); // default 'pending' is valid

    expect(() => {
      db.prepare(
        `INSERT INTO subtasks (id, task_id, type, label, status, position)
         VALUES ('s-2', 'T-1', 'implement', 'Implement', 'cancelled', 2)`
      ).run();
    }).toThrow();
  });

  it("enforces the tasks.derived_status CHECK constraint", () => {
    runMigrations(db);

    expect(() => {
      db.prepare(
        `INSERT INTO tasks (id, type, title, workflow_id, workflow_snapshot, derived_status)
         VALUES ('T-1', 'local', 'Test', 'wf1', '{}', 'invalid_status')`
      ).run();
    }).toThrow();
  });

  it("enforces the events.origin CHECK constraint", () => {
    runMigrations(db);

    expect(() => {
      db.prepare(
        `INSERT INTO events (task_id, type, payload, origin)
         VALUES ('T-1', 'comment_added', '{}', 'robot')`
      ).run();
    }).toThrow();
  });

  it("enforces the discussion_entries.author CHECK constraint", () => {
    runMigrations(db);

    db.prepare(
      `INSERT INTO tasks (id, type, title, workflow_id, workflow_snapshot)
       VALUES ('T-1', 'local', 'Test', 'wf1', '{}')`
    ).run();

    expect(() => {
      db.prepare(
        `INSERT INTO discussion_entries (task_id, author, body)
         VALUES ('T-1', 'bot', 'hello')`
      ).run();
    }).toThrow();
  });

  it("events table uses AUTOINCREMENT — ids are strictly monotonic", () => {
    runMigrations(db);

    for (let i = 0; i < 5; i++) {
      db.prepare(
        `INSERT INTO events (task_id, type, payload, origin)
         VALUES ('T-1', 'comment_added', '{}', 'human')`
      ).run();
    }

    const ids = (
      db
        .prepare("SELECT id FROM events ORDER BY id ASC")
        .all() as { id: number }[]
    ).map((r) => r.id);

    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toBeGreaterThan(ids[i - 1]);
    }
  });
});
