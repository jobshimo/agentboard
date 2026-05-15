// Thin REST adapter — the only file that calls fetch().
// Components never fetch directly; they use hooks that read from the store.

import type { CompactTask } from "./store";

// Full task shape (for detail view — S10c adds more)
export interface TaskFull extends CompactTask {
  ref_title: string | null;
  ref_status: string | null;
  ref_assignee: string | null;
  workflow_snapshot: unknown;
  snapshot_taken_at: string | null;
  closed_at: string | null;
  subtasks: SubtaskCompact[];
}

export interface SubtaskCompact {
  id: string;
  task_id: string;
  type: string;
  step_id: string | null;
  label: string;
  status: "pending" | "in-progress" | "done" | "blocked" | "failed" | "skipped";
  note: string | null;
  custom: boolean;
  triggered_by: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface DiscussionEntry {
  id: number;
  task_id: string;
  author: "human" | "agent" | "system";
  body: string;
  tag: string | null;
  created_at: string;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export function fetchTasks(): Promise<CompactTask[]> {
  return apiGet<CompactTask[]>("/api/tasks");
}

export function fetchTask(id: string): Promise<TaskFull> {
  return apiGet<TaskFull>(`/api/tasks/${encodeURIComponent(id)}`);
}

export function fetchDiscussion(id: string): Promise<DiscussionEntry[]> {
  return apiGet<DiscussionEntry[]>(`/api/tasks/${encodeURIComponent(id)}/discussion`);
}
