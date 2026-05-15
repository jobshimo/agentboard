import type Database from "better-sqlite3";
import { nextSubtaskId } from "./ids.js";
import type { WorkflowSnapshot } from "./workflow.js";
import type { EventType } from "../events/types.js";

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

export interface TransitionEvent {
  type: EventType;
  payload: Record<string, unknown>;
}

/**
 * Applies a status transition and returns the list of events that MUST be emitted.
 *
 * Centralised logic used by both the REST adapter (PATCH /api/subtasks/:id) and
 * the MCP adapter (subtask.update) so event semantics are identical in both paths.
 *
 * Callers are responsible for inserting the events — this function is side-effect-free
 * with respect to the event table (only updates the subtasks + tasks rows).
 */
export function applyStatusTransition(
  db: Db,
  subtaskId: string,
  fromStatus: SubtaskStatus,
  toStatus: SubtaskStatus,
): { updatedRow: SubtaskRow; events: TransitionEvent[] } {
  // Capture prevDerived BEFORE applying the update so cascade comparisons are accurate.
  const taskIdRow = db
    .prepare("SELECT task_id FROM subtasks WHERE id = ?")
    .get(subtaskId) as { task_id: string } | undefined;
  const taskId = taskIdRow?.task_id ?? "";

  const prevDerived = (
    db.prepare("SELECT derived_status FROM tasks WHERE id = ?").get(taskId) as
      | { derived_status: string }
      | undefined
  )?.derived_status;

  const updatedRow = applySubtaskUpdate(db, subtaskId, { status: toStatus });
  const nextDerived = recomputeTaskStatus(db, taskId);

  const events: TransitionEvent[] = [
    {
      type: "status_change",
      payload: { task_id: taskId, subtask_id: subtaskId, from_status: fromStatus, to_status: toStatus },
    },
  ];

  if (nextDerived === "blocked" && prevDerived !== "blocked") {
    events.push({ type: "task_blocked", payload: { task_id: taskId } });
  }

  if (nextDerived === "done" && prevDerived !== "done") {
    events.push({ type: "task_completed", payload: { task_id: taskId } });
  }

  return { updatedRow, events };
}

/**
 * Returns true when the target subtask is allowed to transition to `in-progress`.
 *
 * A subtask is blocked from starting when any prior step in the workflow snapshot
 * has `blocksNext: true` AND that step's subtask is in `pending` or `failed` state.
 * Steps without a corresponding subtask row (deferred `triggered_by` steps) are ignored.
 */
export function canStartSubtask(db: Db, taskId: string, subtaskId: string): boolean {
  const target = db
    .prepare("SELECT step_id FROM subtasks WHERE id = ?")
    .get(subtaskId) as { step_id: string | null } | undefined;
  if (!target || !target.step_id) return true;

  const taskRow = db
    .prepare("SELECT workflow_snapshot FROM tasks WHERE id = ?")
    .get(taskId) as { workflow_snapshot: string } | undefined;
  if (!taskRow) return true;

  let snapshot: WorkflowSnapshot;
  try {
    snapshot = JSON.parse(taskRow.workflow_snapshot) as WorkflowSnapshot;
  } catch {
    return true;
  }

  const targetIndex = snapshot.steps.findIndex((s) => s.id === target.step_id);
  if (targetIndex <= 0) return true;

  const priorBlockingSteps = snapshot.steps
    .slice(0, targetIndex)
    .filter((s) => s.blocksNext === true);

  for (const blockingStep of priorBlockingSteps) {
    const row = db
      .prepare("SELECT status FROM subtasks WHERE task_id = ? AND step_id = ?")
      .get(taskId, blockingStep.id) as { status: SubtaskStatus } | undefined;
    if (row && (row.status === "pending" || row.status === "failed")) {
      return false;
    }
  }

  return true;
}
