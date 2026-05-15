import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../db/migrate.js";
import { addFeedback } from "../add.js";
import { searchFeedback } from "../search.js";

let db: InstanceType<typeof Database>;

beforeEach(() => {
  db = new Database(":memory:");
  runMigrations(db);
  // Insert a task so feedback can reference it
  db.prepare(
    `INSERT INTO tasks (id, type, title, workflow_id, workflow_snapshot) VALUES (?, ?, ?, ?, ?)`
  ).run("T-1", "local", "Task One", "feature", "{}");
  db.prepare(
    `INSERT INTO tasks (id, type, title, workflow_id, workflow_snapshot) VALUES (?, ?, ?, ?, ?)`
  ).run("T-2", "referenced", "Task Two", "bugfix", "{}");
  db.prepare(
    `INSERT INTO tasks (id, type, title, workflow_id, workflow_snapshot) VALUES (?, ?, ?, ?, ?)`
  ).run("T-3", "local", "Task Three", "feature", "{}");
});

describe("addFeedback", () => {
  it("inserts a feedback_added event and returns event_id", () => {
    const result = addFeedback(db, {
      target: "T-1",
      taskId: "T-1",
      text: "this approach broke staging",
      severity: "correction",
    });
    expect(result.ok).toBe(true);
    expect(typeof result.event_id).toBe("number");

    const events = db.prepare("SELECT * FROM events WHERE type = 'feedback_added'").all() as any[];
    expect(events).toHaveLength(1);
    const payload = JSON.parse(events[0].payload);
    expect(payload.severity).toBe("correction");
    expect(payload.target).toBe("T-1");
  });

  it("defaults severity to info when not provided", () => {
    addFeedback(db, { target: "T-1", taskId: "T-1", text: "note" });
    const events = db.prepare("SELECT * FROM events WHERE type = 'feedback_added'").all() as any[];
    const payload = JSON.parse(events[0].payload);
    expect(payload.severity).toBe("info");
  });

  it("captures workflow_at_capture from the task row", () => {
    addFeedback(db, { target: "T-1", taskId: "T-1", text: "note" });
    const events = db.prepare("SELECT * FROM events WHERE type = 'feedback_added'").all() as any[];
    const payload = JSON.parse(events[0].payload);
    expect(payload.workflow_at_capture).toBe("feature");
  });

  it("captures target_task_type from the task row", () => {
    addFeedback(db, { target: "T-1", taskId: "T-1", text: "note" });
    const events = db.prepare("SELECT * FROM events WHERE type = 'feedback_added'").all() as any[];
    const payload = JSON.parse(events[0].payload);
    expect(payload.target_task_type).toBe("local");
  });

  it("stores optional file_paths in payload", () => {
    addFeedback(db, { target: "T-1", taskId: "T-1", text: "note", filePaths: ["src/a.ts"] });
    const events = db.prepare("SELECT * FROM events WHERE type = 'feedback_added'").all() as any[];
    const payload = JSON.parse(events[0].payload);
    expect(payload.file_paths).toEqual(["src/a.ts"]);
  });

  it("rejects invalid severity", () => {
    expect(() =>
      addFeedback(db, { target: "T-1", taskId: "T-1", text: "note", severity: "urgent" as any })
    ).toThrow("invalid severity");
    const events = db.prepare("SELECT * FROM events WHERE type = 'feedback_added'").all() as any[];
    expect(events).toHaveLength(0);
  });

  it("works for completed tasks (closed tasks remain feedbackable)", () => {
    db.prepare(`UPDATE tasks SET derived_status = 'done', closed_at = CURRENT_TIMESTAMP WHERE id = 'T-1'`).run();
    const result = addFeedback(db, { target: "T-1", taskId: "T-1", text: "post-close note" });
    expect(result.ok).toBe(true);
  });
});

describe("searchFeedback", () => {
  it("returns empty array when no feedback exists", () => {
    const results = searchFeedback(db, { task_id: "T-1", workflow_id: "feature", task_type: "local" });
    expect(results).toEqual([]);
  });

  it("returns results ordered by score descending", () => {
    // T-2 feedback: bugfix workflow — low relevance to feature context
    addFeedback(db, { target: "T-2", taskId: "T-2", text: "unrelated note", severity: "info" });
    // T-3 feedback: feature workflow, local type — high relevance to feature context
    addFeedback(db, { target: "T-3", taskId: "T-3", text: "highly relevant", severity: "correction" });

    const results = searchFeedback(db, {
      task_id: "T-99", // different task to avoid same-task filter
      workflow_id: "feature",
      task_type: "local",
    });

    expect(results.length).toBeGreaterThanOrEqual(2);
    // T-3 should score higher (matching workflow + task_type + higher severity)
    expect(results[0].payload.workflow_at_capture).toBe("feature");
  });

  it("excludes feedback from the same task by default", () => {
    addFeedback(db, { target: "T-1", taskId: "T-1", text: "note about T-1" });
    addFeedback(db, { target: "T-3", taskId: "T-3", text: "note about T-3" });

    const results = searchFeedback(db, {
      task_id: "T-1", // searching in context of T-1
      workflow_id: "feature",
      task_type: "local",
    });
    // Should not include T-1's own feedback
    for (const r of results) {
      expect(r.task_id).not.toBe("T-1");
    }
  });

  it("includes same-task feedback when include_same_task is true", () => {
    addFeedback(db, { target: "T-1", taskId: "T-1", text: "note about T-1" });

    const results = searchFeedback(db, {
      task_id: "T-1",
      workflow_id: "feature",
      task_type: "local",
      include_same_task: true,
    });
    expect(results.some((r) => r.task_id === "T-1")).toBe(true);
  });

  it("respects the limit parameter", () => {
    // Insert 6 feedback entries across different tasks
    for (let i = 1; i <= 3; i++) {
      db.prepare(
        `INSERT INTO tasks (id, type, title, workflow_id, workflow_snapshot) VALUES (?, ?, ?, ?, ?)`
      ).run(`T-1${i}`, "local", `Task ${i}`, "feature", "{}");
      addFeedback(db, { target: `T-1${i}`, taskId: `T-1${i}`, text: `note ${i}` });
    }

    const results = searchFeedback(db, { workflow_id: "feature", task_type: "local" }, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("defaults limit to 5", () => {
    // Insert 8 feedback entries
    for (let i = 4; i <= 11; i++) {
      db.prepare(
        `INSERT INTO tasks (id, type, title, workflow_id, workflow_snapshot) VALUES (?, ?, ?, ?, ?)`
      ).run(`T-${i}`, "local", `Task ${i}`, "feature", "{}");
      addFeedback(db, { target: `T-${i}`, taskId: `T-${i}`, text: `note ${i}` });
    }

    const results = searchFeedback(db, { workflow_id: "feature", task_type: "local" });
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it("higher severity entries appear first among equally-relevant candidates", () => {
    // Both on same workflow+type for equal structural score
    addFeedback(db, { target: "T-3", taskId: "T-3", text: "info note", severity: "info" });
    // Add another task with same workflow for failed_in_practice
    db.prepare(
      `INSERT INTO tasks (id, type, title, workflow_id, workflow_snapshot) VALUES (?, ?, ?, ?, ?)`
    ).run("T-4", "local", "Task Four", "feature", "{}");
    addFeedback(db, { target: "T-4", taskId: "T-4", text: "info note", severity: "failed_in_practice" });

    const results = searchFeedback(db, {
      task_id: "T-99",
      workflow_id: "feature",
      task_type: "local",
    });
    expect(results.length).toBeGreaterThanOrEqual(2);
    // failed_in_practice scores higher
    const failedIdx = results.findIndex((r) => r.payload.severity === "failed_in_practice");
    const infoIdx = results.findIndex((r) => r.payload.severity === "info");
    expect(failedIdx).toBeLessThan(infoIdx);
  });
});
