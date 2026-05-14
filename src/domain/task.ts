import type Database from "better-sqlite3";
import { nextTaskId } from "./ids.js";
import type { SubtaskStatus } from "./subtask.js";
import { isTerminal } from "./subtask.js";

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
