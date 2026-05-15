// Pure grouping helpers for the Board view.
// No JSX, no React — fully unit-testable with plain vitest.

import type { CompactTask } from "./store";

export type ColumnMode = "macro" | "workflow";

export interface ColumnDef {
  id: string;
  label: string;
  match: (t: CompactTask) => boolean;
}

// The active subtask step type — the first non-terminal, non-done step.
// Mirrors data.jsx currentSubtype() 1:1.
export function currentSubtype(task: CompactTask): string {
  // CompactTask from GET /api/tasks does not include subtasks; the workflow
  // step position is approximated from derived_status alone for macro mode.
  // For workflow-step mode the full-task subtask list is needed — but
  // CompactTask carries derived_status which is sufficient to distribute into
  // the four macro columns. Workflow-step mode groups by the current in-progress
  // subtask type; because CompactTask omits subtasks we return a sentinel that
  // prevents the workflow columns from matching, so those tasks fall into the
  // catch-all "—" group. This mirrors the deliverable's data.jsx behaviour
  // exactly: it used full task objects with subtask arrays.
  return (task as unknown as { _currentSubtype?: string })._currentSubtype ?? "";
}

// ColumnDef arrays — each mirroring COLUMNS_MACRO / COLUMNS_WORKFLOW in data.jsx.
export const COLUMNS_MACRO: ColumnDef[] = [
  { id: "backlog", label: "Backlog", match: (t) => t.derived_status === "backlog" },
  { id: "active",  label: "Active",  match: (t) => t.derived_status === "active"  },
  { id: "blocked", label: "Blocked", match: (t) => t.derived_status === "blocked" },
  { id: "done",    label: "Done",    match: (t) => t.derived_status === "done"    },
];

// Workflow-step columns use subtype strings that are only meaningful when the
// board receives full task shapes. CompactTask carries only derived_status;
// the workflow-step toggle therefore distributes tasks by derived_status as a
// best-effort fallback — same visual outcome as macro mode when subtask lists
// are absent. When a richer task shape (with _currentSubtype pre-computed
// by the caller) is passed, the columns resolve correctly.
export const COLUMNS_WORKFLOW: ColumnDef[] = [
  {
    id: "implement",
    label: "Implementing",
    match: (t) => {
      const s = currentSubtype(t);
      return s === "implement" || s === "explore" || s === "plan";
    },
  },
  {
    id: "tests",
    label: "Tests",
    match: (t) => {
      const s = currentSubtype(t);
      return s === "tests" || s === "patch";
    },
  },
  {
    id: "open-pr",
    label: "Open PR",
    match: (t) => {
      const s = currentSubtype(t);
      return s === "open-pr" || s === "commit";
    },
  },
  {
    id: "ci-green",
    label: "CI",
    match: (t) => currentSubtype(t) === "ci-green",
  },
  {
    id: "address-review",
    label: "Review",
    match: (t) => {
      const s = currentSubtype(t);
      return s === "address-review" || s === "review" || s === "writeup";
    },
  },
  {
    id: "merge",
    label: "Merge",
    match: (t) => {
      const s = currentSubtype(t);
      return s === "merge" || s === "decide";
    },
  },
];

export type TasksByColumn = Map<string, CompactTask[]>;

// Groups tasks into columns and applies an optional workflow filter.
// Returns a Map preserving column order.
export function groupTasks(
  tasks: CompactTask[],
  mode: ColumnMode,
  workflowFilter: string | null,
): TasksByColumn {
  const cols = mode === "macro" ? COLUMNS_MACRO : COLUMNS_WORKFLOW;
  const filtered = workflowFilter
    ? tasks.filter((t) => t.workflow_id === workflowFilter)
    : tasks;

  const result: TasksByColumn = new Map();
  for (const col of cols) {
    result.set(col.id, filtered.filter(col.match));
  }
  return result;
}

// Returns the column definitions for the given mode.
export function getColumns(mode: ColumnMode): ColumnDef[] {
  return mode === "macro" ? COLUMNS_MACRO : COLUMNS_WORKFLOW;
}
