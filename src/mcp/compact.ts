import type { SubtaskRow } from "../domain/subtask.js";
import type { TaskRow } from "../domain/task.js";

// Compact shapes per token-economy.md:
//   task.list — board overview fields only
//   subtask.update — changed fields + confirmation only

export interface CurrentSubtaskSummary {
  label: string | null;
  status: string;
}

export interface CompactTask {
  id: string;
  title: string;
  type: string;
  derived_status: string;
  workflow_id: string;
  ref_source: string | null;
  ref_id: string | null;
  created_at: string;
  current_subtask: CurrentSubtaskSummary | null;
}

export interface CompactSubtask {
  id: string;
  task_id: string;
  label: string | null;
  status: string;
  note: string | null;
  custom: boolean;
  position: number;
}

export function compactTask(
  row: TaskRow,
  currentSubtask?: CurrentSubtaskSummary | null,
): CompactTask {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    derived_status: row.derived_status,
    workflow_id: row.workflow_id,
    ref_source: row.ref_source,
    ref_id: row.ref_id,
    created_at: row.created_at,
    current_subtask: currentSubtask ?? null,
  };
}

export function compactSubtask(row: SubtaskRow): CompactSubtask {
  return {
    id: row.id,
    task_id: row.task_id,
    label: row.label,
    status: row.status,
    note: row.note,
    custom: row.custom === 1,
    position: row.position,
  };
}

// Returns only the fields that changed between prev and next.
// Used by subtask.update to send a minimal delta response.
export function deltaUpdate(
  prev: CompactSubtask,
  next: CompactSubtask,
): Partial<CompactSubtask> & { id: string } {
  const delta: Partial<CompactSubtask> & { id: string } = { id: next.id };
  const keys = Object.keys(next) as (keyof CompactSubtask)[];
  for (const key of keys) {
    if (key === "id") continue;
    if (prev[key] !== next[key]) {
      // Safe cast: we know the key exists on both objects with compatible types
      (delta as Record<string, unknown>)[key] = next[key];
    }
  }
  return delta;
}
