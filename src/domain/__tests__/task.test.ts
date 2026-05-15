import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../db/migrate.js";
import {
  createReferenced,
  createLocal,
  derivedStatus,
  seedWorkflowSubtasks,
  materializeTriggeredSubtask,
} from "../task.js";
import type { SubtaskStatus } from "../subtask.js";
import type { Workflow } from "../workflow.js";

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

describe("seedWorkflowSubtasks", () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => { db = freshDb(); });
  afterEach(() => db.close());

  const TWO_STEP_WORKFLOW: Workflow = {
    id: "coding-task",
    label: "Coding Task",
    steps: [
      { id: "implement", label: "Implement", canAgentCompleteAlone: true },
      { id: "review", label: "Review", canAgentCompleteAlone: false, triggeredBy: "pr_comment" },
    ],
  };

  it("skips steps with triggeredBy — only non-deferred steps are materialized at task start", () => {
    const taskId = createLocal(db, { title: "T", workflowId: "coding-task", workflowSnapshot: "{}" });
    seedWorkflowSubtasks(db, taskId, TWO_STEP_WORKFLOW);
    const rows = db.prepare("SELECT * FROM subtasks WHERE task_id = ? ORDER BY position ASC").all(taskId) as { id: string }[];
    // "review" step has triggeredBy — should NOT be created yet
    expect(rows).toHaveLength(1);
  });

  it("assigns correct fields — type, step_id, label, status, custom, position", () => {
    const taskId = createLocal(db, { title: "T", workflowId: "coding-task", workflowSnapshot: "{}" });
    seedWorkflowSubtasks(db, taskId, TWO_STEP_WORKFLOW);
    const rows = db.prepare("SELECT * FROM subtasks WHERE task_id = ? ORDER BY position ASC").all(taskId) as Record<string, unknown>[];
    expect(rows[0]["type"]).toBe("workflow");
    expect(rows[0]["step_id"]).toBe("implement");
    expect(rows[0]["label"]).toBe("Implement");
    expect(rows[0]["status"]).toBe("pending");
    expect(rows[0]["custom"]).toBe(0);
    expect(rows[0]["position"]).toBe(0);
  });

  it("seeded non-triggered steps have triggered_by = null", () => {
    const taskId = createLocal(db, { title: "T", workflowId: "coding-task", workflowSnapshot: "{}" });
    seedWorkflowSubtasks(db, taskId, TWO_STEP_WORKFLOW);
    const rows = db.prepare("SELECT * FROM subtasks WHERE task_id = ? ORDER BY position ASC").all(taskId) as Record<string, unknown>[];
    expect(rows[0]["triggered_by"]).toBeNull();
  });

  it("assigns positions in step order starting at 0 (excluding deferred steps)", () => {
    const taskId = createLocal(db, { title: "T", workflowId: "coding-task", workflowSnapshot: "{}" });
    seedWorkflowSubtasks(db, taskId, TWO_STEP_WORKFLOW);
    const rows = db.prepare("SELECT position FROM subtasks WHERE task_id = ? ORDER BY position ASC").all(taskId) as { position: number }[];
    expect(rows.map(r => r.position)).toEqual([0]);
  });

  it("materializeTriggeredSubtask creates the step when the event arrives", () => {
    const taskId = createLocal(db, { title: "T", workflowId: "coding-task", workflowSnapshot: "{}" });
    seedWorkflowSubtasks(db, taskId, TWO_STEP_WORKFLOW);
    const result = materializeTriggeredSubtask(db, taskId, TWO_STEP_WORKFLOW, "pr_comment");
    expect(result).not.toBeNull();
    expect(result?.step_id).toBe("review");
    expect(result?.triggered_by).toBe("pr_comment");
  });

  it("materializeTriggeredSubtask is idempotent — returns null on second call", () => {
    const taskId = createLocal(db, { title: "T", workflowId: "coding-task", workflowSnapshot: "{}" });
    seedWorkflowSubtasks(db, taskId, TWO_STEP_WORKFLOW);
    materializeTriggeredSubtask(db, taskId, TWO_STEP_WORKFLOW, "pr_comment");
    const second = materializeTriggeredSubtask(db, taskId, TWO_STEP_WORKFLOW, "pr_comment");
    expect(second).toBeNull();
  });

  it("materializeTriggeredSubtask returns null for an unknown trigger", () => {
    const taskId = createLocal(db, { title: "T", workflowId: "coding-task", workflowSnapshot: "{}" });
    seedWorkflowSubtasks(db, taskId, TWO_STEP_WORKFLOW);
    const result = materializeTriggeredSubtask(db, taskId, TWO_STEP_WORKFLOW, "ci_failed");
    expect(result).toBeNull();
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
