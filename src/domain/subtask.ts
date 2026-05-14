export const SUBTASK_STATUSES = [
  "pending",
  "in-progress",
  "done",
  "blocked",
  "failed",
  "skipped",
] as const;

export type SubtaskStatus = (typeof SUBTASK_STATUSES)[number];

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
