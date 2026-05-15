import type Database from "better-sqlite3";
import { nextSubtaskId } from "./ids.js";

type Db = InstanceType<typeof Database>;

export const SUBTASK_STATUSES = [
  "pending",
  "in-progress",
  "done",
  "blocked",
  "failed",
  "skipped",
] as const;

export type SubtaskStatus = (typeof SUBTASK_STATUSES)[number];

export interface CustomSubtaskInput {
  label: string;
  type?: string;
}

export interface SubtaskRow {
  id: string;
  task_id: string;
  type: string;
  step_id: string | null;
  label: string | null;
  status: SubtaskStatus;
  note: string | null;
  custom: number;
  triggered_by: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

/** Inserts a custom (ad-hoc) subtask at the end of the task's subtask list. Returns the inserted row. */
export function addCustomSubtask(db: Db, taskId: string, input: CustomSubtaskInput): SubtaskRow {
  const position = (
    db.prepare("SELECT COUNT(*) AS cnt FROM subtasks WHERE task_id = ?").get(taskId) as { cnt: number }
  ).cnt;

  const subtaskId = nextSubtaskId(db);
  db.prepare(
    `INSERT INTO subtasks (id, task_id, type, label, status, custom, position)
     VALUES (?, ?, ?, ?, 'pending', 1, ?)`,
  ).run(subtaskId, taskId, input.type ?? "custom", input.label, position);

  return db.prepare("SELECT * FROM subtasks WHERE id = ?").get(subtaskId) as SubtaskRow;
}

/**
 * Legal outgoing transitions for each state.
 *
 * - done and skipped are terminal: empty transition sets.
 * - blocked and failed can recover to in-progress.
 * - pending can only advance to in-progress (the single forward path).
 * - in-progress can reach any non-pending state.
 */
export const validTransitions: Record<SubtaskStatus, SubtaskStatus[]> = {
  pending: ["in-progress"],
  "in-progress": ["done", "blocked", "failed", "skipped"],
  done: [],
  blocked: ["in-progress"],
  failed: ["in-progress"],
  skipped: [],
};

/**
 * Returns true for terminal states — those from which no further
 * transitions are possible and which count toward task completion.
 *
 * Terminal = done | skipped
 * (failed and blocked are NOT terminal: the task is still open)
 */
export function isTerminal(status: SubtaskStatus): boolean {
  return status === "done" || status === "skipped";
}

export function advanceState(current: SubtaskStatus): SubtaskStatus {
  const progressionMap: Record<SubtaskStatus, SubtaskStatus> = {
    pending: "in-progress",
    "in-progress": "done",
    failed: "in-progress",
    blocked: "in-progress",
    done: "done",
    skipped: "skipped",
  };
  return progressionMap[current];
}

export interface SubtaskUpdate {
  status?: SubtaskStatus;
  note?: string;
}

export function getSubtask(db: Db, subtaskId: string): SubtaskRow | undefined {
  return db
    .prepare("SELECT * FROM subtasks WHERE id = ?")
    .get(subtaskId) as SubtaskRow | undefined;
}

export function applySubtaskUpdate(
  db: Db,
  subtaskId: string,
  update: SubtaskUpdate,
): SubtaskRow {
  db.prepare(
    `UPDATE subtasks
     SET status = COALESCE(?, status),
         note   = COALESCE(?, note),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(update.status ?? null, update.note ?? null, subtaskId);

  return db
    .prepare("SELECT * FROM subtasks WHERE id = ?")
    .get(subtaskId) as SubtaskRow;
}

export type DerivedTaskStatus = "backlog" | "active" | "blocked" | "done";

export function recomputeTaskStatus(db: Db, taskId: string): DerivedTaskStatus {
  const statuses = (
    db
      .prepare("SELECT status FROM subtasks WHERE task_id = ?")
      .all(taskId) as { status: SubtaskStatus }[]
  ).map((r) => r.status);

  const derived = deriveTaskStatus(statuses);
  db.prepare("UPDATE tasks SET derived_status = ? WHERE id = ?").run(
    derived,
    taskId,
  );
  return derived;
}

function deriveTaskStatus(statuses: readonly SubtaskStatus[]): DerivedTaskStatus {
  if (statuses.some((s) => s === "blocked")) return "blocked";
  if (statuses.some((s) => s === "in-progress")) return "active";
  if (statuses.length > 0 && statuses.every(isTerminal)) return "done";
  return "backlog";
}
