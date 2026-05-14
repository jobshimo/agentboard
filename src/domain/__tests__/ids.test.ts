import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../db/migrate.js";
import { nextTaskId, nextSubtaskId } from "../ids.js";

function freshDb() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

describe("nextTaskId", () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = freshDb();
  });
  afterEach(() => db.close());

  it("returns T-1 on an empty tasks table", () => {
    expect(nextTaskId(db)).toBe("T-1");
  });

  it("increments past the current maximum id", () => {
    db.prepare(
      `INSERT INTO tasks (id, type, title, workflow_id, workflow_snapshot)
       VALUES ('T-3', 'local', 'Test', 'wf1', '{}')`
    ).run();
    expect(nextTaskId(db)).toBe("T-4");
  });

  it("returns unique ids on sequential calls (no write between)", () => {
    const a = nextTaskId(db);
    // Insert the first task so the table max advances
    db.prepare(
      `INSERT INTO tasks (id, type, title, workflow_id, workflow_snapshot)
       VALUES (?, 'local', 'Test', 'wf1', '{}')`
    ).run(a);
    const b = nextTaskId(db);
    expect(a).not.toBe(b);
  });
});

describe("nextSubtaskId", () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = freshDb();
  });
  afterEach(() => db.close());

  it("returns s-1 on an empty subtasks table", () => {
    expect(nextSubtaskId(db)).toBe("s-1");
  });

  it("increments past the current maximum id", () => {
    // Insert a task first (FK constraint)
    db.prepare(
      `INSERT INTO tasks (id, type, title, workflow_id, workflow_snapshot)
       VALUES ('T-1', 'local', 'Test', 'wf1', '{}')`
    ).run();
    db.prepare(
      `INSERT INTO subtasks (id, task_id, type, label, position)
       VALUES ('s-5', 'T-1', 'implement', 'Implement', 1)`
    ).run();
    expect(nextSubtaskId(db)).toBe("s-6");
  });
});
