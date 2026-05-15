import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../db/migrate.js";
import {
  SUBTASK_STATUSES,
  type SubtaskStatus,
  validTransitions,
  advanceState,
  isTerminal,
  addCustomSubtask,
  getSubtask,
  applySubtaskUpdate,
  recomputeTaskStatus,
  canStartSubtask,
  applyStatusTransition,
} from "../subtask.js";
import { createLocal } from "../task.js";

function freshDb() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

function makeTask(db: InstanceType<typeof Database>): string {
  return createLocal(db, { title: "T", workflowId: "wf", workflowSnapshot: "{}" });
}

describe("SubtaskStatus", () => {
  it("recognises exactly six allowed states", () => {
    expect(SUBTASK_STATUSES).toHaveLength(6);
    expect(SUBTASK_STATUSES).toContain("pending");
    expect(SUBTASK_STATUSES).toContain("in-progress");
    expect(SUBTASK_STATUSES).toContain("done");
    expect(SUBTASK_STATUSES).toContain("blocked");
    expect(SUBTASK_STATUSES).toContain("failed");
    expect(SUBTASK_STATUSES).toContain("skipped");
  });
});

describe("validTransitions", () => {
  it("allows pending → in-progress", () => {
    expect(validTransitions["pending"]).toContain("in-progress");
  });

  it("allows in-progress → done", () => {
    expect(validTransitions["in-progress"]).toContain("done");
  });

  it("allows in-progress → blocked", () => {
    expect(validTransitions["in-progress"]).toContain("blocked");
  });

  it("allows in-progress → failed", () => {
    expect(validTransitions["in-progress"]).toContain("failed");
  });

  it("allows in-progress → skipped", () => {
    expect(validTransitions["in-progress"]).toContain("skipped");
  });

  it("allows failed → in-progress (agent retry)", () => {
    expect(validTransitions["failed"]).toContain("in-progress");
  });

  it("allows blocked → in-progress (human unblocks)", () => {
    expect(validTransitions["blocked"]).toContain("in-progress");
  });

  it("does not allow pending → done directly", () => {
    expect(validTransitions["pending"]).not.toContain("done");
  });

  it("terminal state done has no outgoing transitions", () => {
    expect(validTransitions["done"]).toHaveLength(0);
  });

  it("terminal state skipped has no outgoing transitions", () => {
    expect(validTransitions["skipped"]).toHaveLength(0);
  });
});

describe("advanceState", () => {
  it("advances pending to in-progress on click-dot", () => {
    expect(advanceState("pending")).toBe("in-progress");
  });

  it("advances in-progress to done on click-dot", () => {
    expect(advanceState("in-progress")).toBe("done");
  });

  it("returns the same state for done (terminal — no advance)", () => {
    expect(advanceState("done")).toBe("done");
  });

  it("returns the same state for skipped (terminal — no advance)", () => {
    expect(advanceState("skipped")).toBe("skipped");
  });

  it("advances failed to in-progress (click-dot retry)", () => {
    expect(advanceState("failed")).toBe("in-progress");
  });

  it("advances blocked to in-progress (click-dot unblock)", () => {
    expect(advanceState("blocked")).toBe("in-progress");
  });
});

describe("addCustomSubtask", () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => { db = freshDb(); });
  afterEach(() => db.close());

  it("inserts a custom subtask and returns the row", () => {
    const taskId = makeTask(db);
    const row = addCustomSubtask(db, taskId, { label: "Manual review" });
    expect(row.id).toMatch(/^s-\d+$/);
    expect(row.task_id).toBe(taskId);
    expect(row.label).toBe("Manual review");
    expect(row.type).toBe("custom");
    expect(row.custom).toBe(1);
    expect(row.status).toBe("pending");
  });

  it("defaults type to 'custom' when not provided", () => {
    const taskId = makeTask(db);
    const row = addCustomSubtask(db, taskId, { label: "Ad hoc" });
    expect(row.type).toBe("custom");
  });

  it("uses the provided type when given", () => {
    const taskId = makeTask(db);
    const row = addCustomSubtask(db, taskId, { label: "Check", type: "qa" });
    expect(row.type).toBe("qa");
  });

  it("appends at end — position equals existing subtask count", () => {
    const taskId = makeTask(db);
    const first = addCustomSubtask(db, taskId, { label: "First" });
    const second = addCustomSubtask(db, taskId, { label: "Second" });
    expect(first.position).toBe(0);
    expect(second.position).toBe(1);
  });

  it("increments position correctly when multiple subtasks exist", () => {
    const taskId = makeTask(db);
    addCustomSubtask(db, taskId, { label: "A" });
    addCustomSubtask(db, taskId, { label: "B" });
    const third = addCustomSubtask(db, taskId, { label: "C" });
    expect(third.position).toBe(2);
  });
});

describe("isTerminal", () => {
  it("identifies done as terminal", () => {
    expect(isTerminal("done")).toBe(true);
  });

  it("identifies skipped as terminal", () => {
    expect(isTerminal("skipped")).toBe(true);
  });

  it("identifies failed as non-terminal (agent can retry)", () => {
    expect(isTerminal("failed")).toBe(false);
  });

  it("identifies blocked as non-terminal (human can unblock)", () => {
    expect(isTerminal("blocked")).toBe(false);
  });

  it("identifies pending as non-terminal", () => {
    expect(isTerminal("pending")).toBe(false);
  });

  it("identifies in-progress as non-terminal", () => {
    expect(isTerminal("in-progress")).toBe(false);
  });
});

describe("getSubtask", () => {
  let db: InstanceType<typeof Database>;
  beforeEach(() => { db = freshDb(); });
  afterEach(() => db.close());

  it("returns the row when the subtask exists", () => {
    const taskId = makeTask(db);
    const inserted = addCustomSubtask(db, taskId, { label: "look it up" });

    const found = getSubtask(db, inserted.id);
    expect(found?.id).toBe(inserted.id);
    expect(found?.label).toBe("look it up");
  });

  it("returns undefined when the subtask does not exist", () => {
    expect(getSubtask(db, "s-9999")).toBeUndefined();
  });
});

describe("applySubtaskUpdate", () => {
  let db: InstanceType<typeof Database>;
  beforeEach(() => { db = freshDb(); });
  afterEach(() => db.close());

  it("updates status and returns the new row", () => {
    const taskId = makeTask(db);
    const inserted = addCustomSubtask(db, taskId, { label: "move me" });

    const updated = applySubtaskUpdate(db, inserted.id, { status: "in-progress" });
    expect(updated.status).toBe("in-progress");
  });

  it("updates note independently of status", () => {
    const taskId = makeTask(db);
    const inserted = addCustomSubtask(db, taskId, { label: "annotate me" });

    const updated = applySubtaskUpdate(db, inserted.id, { note: "halfway done" });
    expect(updated.note).toBe("halfway done");
    expect(updated.status).toBe("pending");
  });

  it("leaves unset fields unchanged (COALESCE semantics)", () => {
    const taskId = makeTask(db);
    const inserted = addCustomSubtask(db, taskId, { label: "keep me" });
    applySubtaskUpdate(db, inserted.id, { note: "first note" });

    const updated = applySubtaskUpdate(db, inserted.id, { status: "in-progress" });
    expect(updated.note).toBe("first note");
    expect(updated.status).toBe("in-progress");
  });
});

describe("canStartSubtask", () => {
  let db: InstanceType<typeof Database>;
  beforeEach(() => { db = freshDb(); });
  afterEach(() => db.close());

  const SNAPSHOT_WITH_BLOCK = JSON.stringify({
    id: "wf",
    label: "WF",
    frozenAt: new Date().toISOString(),
    steps: [
      { id: "tests", label: "Tests", canAgentCompleteAlone: true, blocksNext: true },
      { id: "review", label: "Review", canAgentCompleteAlone: false },
    ],
  });

  function makeTaskWithSnapshot(snapshot: string): string {
    return createLocal(db, { title: "T", workflowId: "wf", workflowSnapshot: snapshot });
  }

  it("returns true when no blocking steps precede the target", () => {
    const taskId = makeTaskWithSnapshot(SNAPSHOT_WITH_BLOCK);
    const s1 = addCustomSubtask(db, taskId, { label: "tests" });
    db.prepare("UPDATE subtasks SET step_id = 'tests' WHERE id = ?").run(s1.id);
    expect(canStartSubtask(db, taskId, s1.id)).toBe(true);
  });

  it("returns false when a prior blocking step is pending", () => {
    const taskId = makeTaskWithSnapshot(SNAPSHOT_WITH_BLOCK);
    const s1 = addCustomSubtask(db, taskId, { label: "tests" });
    db.prepare("UPDATE subtasks SET step_id = 'tests' WHERE id = ?").run(s1.id);
    const s2 = addCustomSubtask(db, taskId, { label: "review" });
    db.prepare("UPDATE subtasks SET step_id = 'review' WHERE id = ?").run(s2.id);
    // s1 (tests) is still pending and has blocksNext — s2 cannot start
    expect(canStartSubtask(db, taskId, s2.id)).toBe(false);
  });

  it("returns true when the blocking step is done", () => {
    const taskId = makeTaskWithSnapshot(SNAPSHOT_WITH_BLOCK);
    const s1 = addCustomSubtask(db, taskId, { label: "tests" });
    db.prepare("UPDATE subtasks SET step_id = 'tests', status = 'done' WHERE id = ?").run(s1.id);
    const s2 = addCustomSubtask(db, taskId, { label: "review" });
    db.prepare("UPDATE subtasks SET step_id = 'review' WHERE id = ?").run(s2.id);
    expect(canStartSubtask(db, taskId, s2.id)).toBe(true);
  });

  it("returns false when the blocking step is failed", () => {
    const taskId = makeTaskWithSnapshot(SNAPSHOT_WITH_BLOCK);
    const s1 = addCustomSubtask(db, taskId, { label: "tests" });
    db.prepare("UPDATE subtasks SET step_id = 'tests', status = 'failed' WHERE id = ?").run(s1.id);
    const s2 = addCustomSubtask(db, taskId, { label: "review" });
    db.prepare("UPDATE subtasks SET step_id = 'review' WHERE id = ?").run(s2.id);
    expect(canStartSubtask(db, taskId, s2.id)).toBe(false);
  });
});

describe("applyStatusTransition", () => {
  let db: InstanceType<typeof Database>;
  beforeEach(() => { db = freshDb(); });
  afterEach(() => db.close());

  it("returns a status_change event for a normal transition", () => {
    const taskId = makeTask(db);
    const s = addCustomSubtask(db, taskId, { label: "step" });
    const { events } = applyStatusTransition(db, s.id, "pending", "in-progress");
    expect(events.some((e) => e.type === "status_change")).toBe(true);
    const sc = events.find((e) => e.type === "status_change");
    expect(sc?.payload["from_status"]).toBe("pending");
    expect(sc?.payload["to_status"]).toBe("in-progress");
  });

  it("includes task_completed event when all subtasks become terminal", () => {
    const taskId = makeTask(db);
    const s = addCustomSubtask(db, taskId, { label: "step" });
    const { events } = applyStatusTransition(db, s.id, "pending", "done");
    expect(events.some((e) => e.type === "status_change")).toBe(true);
    expect(events.some((e) => e.type === "task_completed")).toBe(true);
  });

  it("includes task_blocked event when task becomes blocked", () => {
    const taskId = makeTask(db);
    const s = addCustomSubtask(db, taskId, { label: "step" });
    applySubtaskUpdate(db, s.id, { status: "in-progress" });
    recomputeTaskStatus(db, taskId);
    const { events } = applyStatusTransition(db, s.id, "in-progress", "blocked");
    expect(events.some((e) => e.type === "status_change")).toBe(true);
    expect(events.some((e) => e.type === "task_blocked")).toBe(true);
  });

  it("does not include task_completed when other subtasks are still pending", () => {
    const taskId = makeTask(db);
    const s1 = addCustomSubtask(db, taskId, { label: "A" });
    addCustomSubtask(db, taskId, { label: "B" });
    const { events } = applyStatusTransition(db, s1.id, "pending", "done");
    expect(events.some((e) => e.type === "task_completed")).toBe(false);
  });
});

describe("recomputeTaskStatus", () => {
  let db: InstanceType<typeof Database>;
  beforeEach(() => { db = freshDb(); });
  afterEach(() => db.close());

  function statusOf(taskId: string): string {
    return (db.prepare("SELECT derived_status FROM tasks WHERE id = ?").get(taskId) as { derived_status: string }).derived_status;
  }

  it("returns 'backlog' for a task with no subtasks", () => {
    const taskId = makeTask(db);
    expect(recomputeTaskStatus(db, taskId)).toBe("backlog");
    expect(statusOf(taskId)).toBe("backlog");
  });

  it("returns 'active' when any subtask is in-progress", () => {
    const taskId = makeTask(db);
    const s1 = addCustomSubtask(db, taskId, { label: "one" });
    addCustomSubtask(db, taskId, { label: "two" });
    applySubtaskUpdate(db, s1.id, { status: "in-progress" });

    expect(recomputeTaskStatus(db, taskId)).toBe("active");
  });

  it("returns 'blocked' when any subtask is blocked (overrides in-progress)", () => {
    const taskId = makeTask(db);
    const s1 = addCustomSubtask(db, taskId, { label: "one" });
    const s2 = addCustomSubtask(db, taskId, { label: "two" });
    applySubtaskUpdate(db, s1.id, { status: "in-progress" });
    applySubtaskUpdate(db, s2.id, { status: "blocked" });

    expect(recomputeTaskStatus(db, taskId)).toBe("blocked");
  });

  it("returns 'done' when every subtask is terminal", () => {
    const taskId = makeTask(db);
    const s1 = addCustomSubtask(db, taskId, { label: "one" });
    const s2 = addCustomSubtask(db, taskId, { label: "two" });
    applySubtaskUpdate(db, s1.id, { status: "in-progress" });
    applySubtaskUpdate(db, s1.id, { status: "done" });
    applySubtaskUpdate(db, s2.id, { status: "skipped" });

    expect(recomputeTaskStatus(db, taskId)).toBe("done");
  });

  it("persists the derived status to the tasks table", () => {
    const taskId = makeTask(db);
    const s1 = addCustomSubtask(db, taskId, { label: "one" });
    applySubtaskUpdate(db, s1.id, { status: "in-progress" });

    recomputeTaskStatus(db, taskId);
    expect(statusOf(taskId)).toBe("active");
  });
});
