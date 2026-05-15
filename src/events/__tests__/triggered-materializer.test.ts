import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../db/migrate.js";
import { createTriggerMaterializer } from "../triggered-materializer.js";
import { insertEvent } from "../insert.js";
import { createLocal } from "../../domain/task.js";
import { freezeWorkflow } from "../../workflows/snapshot.js";
import type { Workflow } from "../../domain/workflow.js";

type Db = InstanceType<typeof Database>;

const WORKFLOW_WITH_TRIGGER: Workflow = {
  id: "coding-task",
  label: "Coding Task",
  steps: [
    { id: "implement", label: "Implement", canAgentCompleteAlone: true },
    { id: "review", label: "Review", canAgentCompleteAlone: false, triggeredBy: "pr_comment" },
  ],
};

function makeDb(): Db {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

function makeTaskWithWorkflow(db: Db): string {
  const snapshot = freezeWorkflow(WORKFLOW_WITH_TRIGGER);
  const taskId = createLocal(db, {
    title: "T",
    workflowId: "coding-task",
    workflowSnapshot: JSON.stringify(snapshot),
  });
  // seed the non-triggered subtask
  db.prepare(
    `INSERT INTO subtasks (id, task_id, type, step_id, label, status, custom, position)
     VALUES ('s-1', ?, 'workflow', 'implement', 'Implement', 'pending', 0, 0)`,
  ).run(taskId);
  return taskId;
}

let db: Db;

beforeEach(() => { db = makeDb(); });
afterEach(() => db.close());

describe("createTriggerMaterializer", () => {
  it("materializes a triggered subtask when a matching event arrives", () => {
    const taskId = makeTaskWithWorkflow(db);
    const materializer = createTriggerMaterializer(db);

    insertEvent(db, {
      taskId,
      type: "pr_comment",
      payload: { task_id: taskId, pr_url: "https://github.com/org/repo/pull/1", comment_body: "lgtm" },
      origin: "agent",
    }, { listeners: [materializer] });

    const subtasks = db
      .prepare("SELECT * FROM subtasks WHERE task_id = ? AND step_id = 'review'")
      .all(taskId) as { id: string; triggered_by: string }[];

    expect(subtasks).toHaveLength(1);
    expect(subtasks[0]!.triggered_by).toBe("pr_comment");
  });

  it("does not create a duplicate subtask on repeated events (idempotent)", () => {
    const taskId = makeTaskWithWorkflow(db);
    const materializer = createTriggerMaterializer(db);

    const opts = {
      taskId,
      type: "pr_comment" as const,
      payload: { task_id: taskId, pr_url: "https://github.com/org/repo/pull/1", comment_body: "lgtm" },
      origin: "agent" as const,
    };
    insertEvent(db, opts, { listeners: [materializer] });
    insertEvent(db, opts, { listeners: [materializer] });

    const subtasks = db
      .prepare("SELECT * FROM subtasks WHERE task_id = ? AND step_id = 'review'")
      .all(taskId) as unknown[];

    expect(subtasks).toHaveLength(1);
  });

  it("ignores events whose type does not match any triggered_by step", () => {
    const taskId = makeTaskWithWorkflow(db);
    const materializer = createTriggerMaterializer(db);

    insertEvent(db, {
      taskId,
      type: "comment_added",
      payload: { task_id: taskId, author: "agent", text: "hi" },
      origin: "agent",
    }, { listeners: [materializer] });

    const subtasks = db
      .prepare("SELECT * FROM subtasks WHERE task_id = ? AND step_id = 'review'")
      .all(taskId) as unknown[];

    expect(subtasks).toHaveLength(0);
  });

  it("ignores events with taskId '_global'", () => {
    const materializer = createTriggerMaterializer(db);
    expect(() => {
      materializer({
        id: 1,
        taskId: "_global",
        type: "pr_comment",
        payload: {},
        origin: "agent",
      });
    }).not.toThrow();
  });
});
