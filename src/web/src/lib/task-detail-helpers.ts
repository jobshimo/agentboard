// Pure helper functions for the TaskDetail view. Extracted for testability.
// No React, no DOM, no side effects.

import type { SubtaskCompact, TaskFull } from "./api";

// Maps canonical step IDs to display labels.
// Source of truth for label resolution — shared by SubtaskRow.
export const SUBTASK_LABELS: Record<string, string> = {
  implement: "Implementation",
  tests: "Tests pass",
  commit: "Commit",
  "open-pr": "Open PR",
  "ci-green": "CI passes",
  "address-review": "Address PR feedback",
  merge: "Merge",
  reproduce: "Reproduce",
  patch: "Patch",
  explore: "Explore",
  writeup: "Write up findings",
  decide: "Decision",
  plan: "Plan",
  review: "Review",
  migrate: "Migration",
};

// Returns the currently active subtask: the in-progress one if any, else the
// first pending one. Returns null for empty or all-terminal subtask lists.
export function currentSubtask(task: TaskFull): SubtaskCompact | null {
  const inProgress = task.subtasks.find(s => s.status === "in-progress");
  if (inProgress) return inProgress;
  return task.subtasks.find(s => s.status === "pending") ?? null;
}

// Separates snapshot subtasks from custom ones (position-stable).
export function partitionSubtasks(subtasks: SubtaskCompact[]): {
  snapshot: SubtaskCompact[];
  custom: SubtaskCompact[];
} {
  return {
    snapshot: subtasks.filter(s => !s.custom),
    custom: subtasks.filter(s => s.custom),
  };
}

// Resolves the display label for a subtask: explicit label wins, then SUBTASK_LABELS lookup, then type.
export function resolveSubtaskLabel(subtask: SubtaskCompact): string {
  return subtask.label || SUBTASK_LABELS[subtask.type] || subtask.type;
}
