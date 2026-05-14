/**
 * src/domain/subtask.ts
 *
 * Six-state subtask machine as defined in domain-model.md.
 *
 * States: pending | in-progress | done | blocked | failed | skipped
 *
 * Terminal states: done, skipped — no outgoing transitions.
 * Non-terminal:    pending, in-progress, blocked, failed — can advance.
 *
 * The click-dot UX uses `advanceState` for the primary progression path.
 * Side transitions (blocked, failed, skipped) are set directly via status
 * writes — the right-click context menu bypasses advanceState.
 */

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

/**
 * Click-dot primary advance: returns the next state in the
 * forward progression path.
 *
 * pending       → in-progress
 * in-progress   → done
 * failed        → in-progress  (retry)
 * blocked       → in-progress  (unblocked)
 * done / skipped → unchanged   (no-op at terminal)
 */
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
