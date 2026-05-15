import type Database from "better-sqlite3";
import { nextTaskId, nextSubtaskId } from "./ids.js";
import type { SubtaskStatus, SubtaskRow } from "./subtask.js";
import { isTerminal } from "./subtask.js";
import type { Workflow } from "./workflow.js";

type Db = InstanceType<typeof Database>;

export type DerivedStatus = "backlog" | "active" | "blocked" | "done";

// ---------------------------------------------------------------------------
// Shared option type used by both factory functions
// ---------------------------------------------------------------------------

interface TaskCreateOpts {
  title: string;
  workflowId: string;
  /** Pre-serialised JSON string — the freeze/rehydrate layer owns serialisation, not this module. */
  workflowSnapshot: string;
}

interface ReferencedOpts extends TaskCreateOpts {
  refSource?: string;
  refId?: string;
  refUrl?: string;
  refTitle?: string;
  refStatus?: string;
  refAssignee?: string;
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export function createReferenced(db: Db, opts: ReferencedOpts): string {
  const id = nextTaskId(db);

  db.prepare(`
    INSERT INTO tasks
      (id, type, title, workflow_id, workflow_snapshot,
       ref_source, ref_id, ref_url, ref_title, ref_status, ref_assignee)
    VALUES
      (?, 'referenced', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    opts.title,
    opts.workflowId,
    opts.workflowSnapshot,
    opts.refSource ?? null,
    opts.refId ?? null,
    opts.refUrl ?? null,
    opts.refTitle ?? null,
    opts.refStatus ?? null,
    opts.refAssignee ?? null,
  );

  return id;
}

export function createLocal(db: Db, opts: TaskCreateOpts): string {
  const id = nextTaskId(db);

  db.prepare(`
    INSERT INTO tasks
      (id, type, title, workflow_id, workflow_snapshot)
    VALUES
      (?, 'local', ?, ?, ?)
  `).run(id, opts.title, opts.workflowId, opts.workflowSnapshot);

  return id;
}

// ---------------------------------------------------------------------------
// Workflow subtask seeding
// ---------------------------------------------------------------------------

/**
 * Creates the initial workflow-step subtasks for a freshly-created task.
 * Steps with `triggeredBy` set are NOT materialized here — they are deferred
 * until the named event arrives (workflows.md §`triggered_by` step deferred creation).
 */
export function seedWorkflowSubtasks(db: Db, taskId: string, workflow: Workflow): void {
  const insert = db.prepare(
    `INSERT INTO subtasks (id, task_id, type, step_id, label, status, custom, triggered_by, position)
     VALUES (?, ?, 'workflow', ?, ?, 'pending', 0, ?, ?)`,
  );
  let position = 0;
  for (const step of workflow.steps) {
    if (step.triggeredBy !== undefined) continue;
    insert.run(nextSubtaskId(db), taskId, step.id, step.label, null, position);
    position++;
  }
}

/**
 * Materializes a deferred subtask for a workflow step with `triggered_by` when
 * the named event arrives. Returns the inserted row, or null if the step does
 * not exist or was already materialized.
 */
export function materializeTriggeredSubtask(
  db: Db,
  taskId: string,
  workflow: Workflow,
  triggerName: string,
): SubtaskRow | null {
  const step = workflow.steps.find((s) => s.triggeredBy === triggerName);
  if (!step) return null;

  const existing = db
    .prepare("SELECT id FROM subtasks WHERE task_id = ? AND step_id = ?")
    .get(taskId, step.id);
  if (existing) return null;

  const position = (
    db.prepare("SELECT COUNT(*) AS cnt FROM subtasks WHERE task_id = ?").get(taskId) as { cnt: number }
  ).cnt;

  const id = nextSubtaskId(db);
  db.prepare(
    `INSERT INTO subtasks (id, task_id, type, step_id, label, status, custom, triggered_by, position)
     VALUES (?, ?, 'workflow', ?, ?, 'pending', 0, ?, ?)`,
  ).run(id, taskId, step.id, step.label, step.triggeredBy, position);

  return db.prepare("SELECT * FROM subtasks WHERE id = ?").get(id) as SubtaskRow;
}

// ---------------------------------------------------------------------------
// Derived status formula (pure — no DB access)
// ---------------------------------------------------------------------------

/**
 * Computes the macro task status from the current statuses of all its subtasks.
 *
 * Priority order (highest wins):
 *   blocked  — any subtask blocked
 *   active   — any subtask in-progress (and none blocked)
 *   done     — all subtasks in a terminal state (done or skipped)
 *   backlog  — default when none of the above apply
 */
export function derivedStatus(subtasks: SubtaskStatus[]): DerivedStatus {
  if (subtasks.length === 0) return "backlog";

  if (subtasks.some((s) => s === "blocked")) return "blocked";
  if (subtasks.some((s) => s === "in-progress")) return "active";
  if (subtasks.every((s) => isTerminal(s))) return "done";

  return "backlog";
}

// ---------------------------------------------------------------------------
// Task row types and query functions
// ---------------------------------------------------------------------------

export interface TaskRow {
  id: string;
  type: string;
  title: string;
  ref_source: string | null;
  ref_id: string | null;
  ref_url: string | null;
  ref_title: string | null;
  ref_status: string | null;
  ref_assignee: string | null;
  workflow_id: string;
  workflow_snapshot: string;
  snapshot_taken_at: string | null;
  derived_status: string;
  created_at: string;
  closed_at: string | null;
}

export interface ExternalRef {
  ref_source: string | null;
  ref_id: string | null;
  ref_url: string | null;
  ref_title: string | null;
  ref_status: string | null;
  ref_assignee: string | null;
}

export function getTask(db: Db, taskId: string): TaskRow | undefined {
  return db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as TaskRow | undefined;
}

export type TaskFilter = "backlog" | "active" | "blocked" | "done";

export function listTasks(db: Db, filter?: TaskFilter): TaskRow[] {
  if (filter) {
    return db
      .prepare("SELECT * FROM tasks WHERE derived_status = ? ORDER BY created_at DESC")
      .all(filter) as TaskRow[];
  }
  return db
    .prepare("SELECT * FROM tasks ORDER BY created_at DESC")
    .all() as TaskRow[];
}

export function getTaskSubtasks(db: Db, taskId: string): SubtaskRow[] {
  return db
    .prepare("SELECT * FROM subtasks WHERE task_id = ? ORDER BY position ASC")
    .all(taskId) as SubtaskRow[];
}

export function closeTask(db: Db, taskId: string): void {
  db.prepare(
    "UPDATE tasks SET closed_at = CURRENT_TIMESTAMP, derived_status = 'done' WHERE id = ?",
  ).run(taskId);
}

export function getTaskExternalRef(db: Db, taskId: string): ExternalRef | undefined {
  return db.prepare(
    "SELECT ref_source, ref_id, ref_url, ref_title, ref_status, ref_assignee FROM tasks WHERE id = ?",
  ).get(taskId) as ExternalRef | undefined;
}

/**
 * Looks up a task by its external reference coordinates (ref_source + ref_id).
 * Used by external.fetch — agents pass `<source>:<identifier>`, not the local task PK.
 */
export function getTaskByRef(db: Db, source: string, refId: string): ExternalRef | undefined {
  return db.prepare(
    "SELECT ref_source, ref_id, ref_url, ref_title, ref_status, ref_assignee FROM tasks WHERE ref_source = ? AND ref_id = ?",
  ).get(source, refId) as ExternalRef | undefined;
}
