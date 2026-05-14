import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../db/migrate.js";
import {
  createReferenced,
  createLocal,
  derivedStatus,
} from "../task.js";
import type { SubtaskStatus } from "../subtask.js";

function freshDb() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

describe("createReferenced", () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => { db = freshDb(); });
  afterEach(() => db.close());

  it("inserts a task row with type 'referenced'", () => {
    createReferenced(db, {
      title: "Fix bug",
      workflowId: "coding-task",
      workflowSnapshot: "{}",
      refSource: "github",
      refId: "acme/repo#7",
    });

    const row = db.prepare("SELECT * FROM tasks WHERE type = 'referenced'").get() as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row["type"]).toBe("referenced");
    expect(row["ref_source"]).toBe("github");
    expect(row["ref_id"]).toBe("acme/repo#7");
  });

  it("stores the workflow snapshot as-is", () => {
    const snapshot = JSON.stringify({ id: "coding-task", steps: [] });
    createReferenced(db, {
      title: "Task A",
      workflowId: "coding-task",
      workflowSnapshot: snapshot,
    });

    const row = db.prepare("SELECT workflow_snapshot FROM tasks LIMIT 1").get() as { workflow_snapshot: string };
    expect(row.workflow_snapshot).toBe(snapshot);
  });

  it("returns the newly created task id", () => {
    const id = createReferenced(db, {
      title: "Test",
      workflowId: "wf1",
      workflowSnapshot: "{}",
    });
    expect(id).toMatch(/^T-\d+$/);
  });
});

describe("createLocal", () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => { db = freshDb(); });
  afterEach(() => db.close());

  it("inserts a task row with type 'local'", () => {
    createLocal(db, {
      title: "My local task",
      workflowId: "coding-task",
      workflowSnapshot: "{}",
    });

    const row = db.prepare("SELECT * FROM tasks WHERE type = 'local'").get() as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row["type"]).toBe("local");
    expect(row["ref_source"]).toBeNull();
  });

  it("returns the newly created task id", () => {
    const id = createLocal(db, {
      title: "Local",
      workflowId: "wf1",
      workflowSnapshot: "{}",
    });
    expect(id).toMatch(/^T-\d+$/);
  });
});

describe("derivedStatus", () => {
  it("returns 'backlog' when all subtasks are pending", () => {
    const statuses: SubtaskStatus[] = ["pending", "pending", "pending"];
    expect(derivedStatus(statuses)).toBe("backlog");
  });

  it("returns 'backlog' when the subtask list is empty", () => {
    expect(derivedStatus([])).toBe("backlog");
  });

  it("returns 'done' when all subtasks are done", () => {
    const statuses: SubtaskStatus[] = ["done", "done", "done"];
    expect(derivedStatus(statuses)).toBe("done");
  });

  it("returns 'done' when all subtasks are done or skipped", () => {
    const statuses: SubtaskStatus[] = ["done", "skipped", "done"];
    expect(derivedStatus(statuses)).toBe("done");
  });

  it("returns 'blocked' when any subtask is blocked", () => {
    const statuses: SubtaskStatus[] = ["in-progress", "blocked", "pending"];
    expect(derivedStatus(statuses)).toBe("blocked");
  });

  it("returns 'blocked' over 'active' when both exist", () => {
    const statuses: SubtaskStatus[] = ["in-progress", "blocked"];
    expect(derivedStatus(statuses)).toBe("blocked");
  });

  it("returns 'active' when any subtask is in-progress and none blocked", () => {
    const statuses: SubtaskStatus[] = ["done", "in-progress", "pending"];
    expect(derivedStatus(statuses)).toBe("active");
  });

  it("returns 'active' for a single in-progress subtask", () => {
    expect(derivedStatus(["in-progress"])).toBe("active");
  });

  it("returns 'backlog' when subtasks are pending and failed (task never started)", () => {
    // failed is non-terminal; no subtask is in-progress or blocked
    const statuses: SubtaskStatus[] = ["pending", "failed"];
    expect(derivedStatus(statuses)).toBe("backlog");
  });
});
