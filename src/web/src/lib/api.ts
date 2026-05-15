// Thin REST adapter — the only file that calls fetch().
// Components never fetch directly; they use hooks that read from the store.

// S7: import getActiveRepo for ?repo= auto-append
import { getActiveRepo } from "./store";

// Paths that do NOT require ?repo= (exempt from onRequest hook)
const REPO_EXEMPT_PATHS = new Set(["/api/health", "/api/daemon/repos"]);

function withRepo(path: string): string {
  // Don't append ?repo= to exempt paths
  const bare = path.split("?")[0] ?? path;
  if (REPO_EXEMPT_PATHS.has(bare)) return path;
  const activeRepo = getActiveRepo();
  if (!activeRepo) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}repo=${encodeURIComponent(activeRepo)}`;
}

/** Thrown when no activeRepo is set and a request requires one. */
export class NoActiveRepoError extends Error {
  constructor() {
    super("No active repo selected. Use the repo dropdown in the top bar.");
    this.name = "NoActiveRepoError";
  }
}

// Compact task shape returned by GET /api/tasks.
// Defined here (not in store) so the import graph stays acyclic: store → api, never api → store.
export interface CompactTaskSubtask {
  type: string;
  status: "pending" | "in-progress" | "done" | "blocked" | "failed" | "skipped";
}

export interface CompactTask {
  id: string;
  title: string;
  type: "referenced" | "local";
  ref_source: string | null;
  ref_id: string | null;
  ref_url: string | null;
  workflow_id: string;
  derived_status: "backlog" | "active" | "blocked" | "done";
  created_at: string;
  /** Minimal subtask summary for WorkflowStrip rendering without a full task fetch. */
  subtasks: CompactTaskSubtask[];
}

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
  const url = withRepo(path);
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// Discussion response shape — backend returns entries[] or a summary block.
export type DiscussionResponse =
  | { type: "entries"; entries: DiscussionEntry[] }
  | { type: "summary"; summary: string; entries: DiscussionEntry[] };

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const url = withRepo(path);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const url = withRepo(path);
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export function fetchTasks(): Promise<CompactTask[]> {
  return apiGet<CompactTask[]>("/api/tasks");
}

export function fetchTask(id: string): Promise<TaskFull> {
  return apiGet<TaskFull>(`/api/tasks/${encodeURIComponent(id)}`);
}

export function fetchDiscussion(id: string): Promise<DiscussionResponse> {
  return apiGet<DiscussionResponse>(`/api/tasks/${encodeURIComponent(id)}/discussion`);
}

export function postComment(taskId: string, body: string): Promise<DiscussionEntry> {
  return apiPost<DiscussionEntry>(`/api/tasks/${encodeURIComponent(taskId)}/comments`, { body });
}

export interface SubtaskPatch {
  status?: SubtaskCompact["status"];
  note?: string;
}

export function patchSubtask(subtaskId: string, patch: SubtaskPatch): Promise<SubtaskCompact> {
  return apiPatch<SubtaskCompact>(`/api/subtasks/${encodeURIComponent(subtaskId)}`, patch);
}

export interface FeedbackPayload {
  target: string;
  text: string;
  severity?: "info" | "correction" | "failed_in_practice";
}

export function postFeedback(taskId: string, payload: FeedbackPayload): Promise<{ ok: true; event_id: number }> {
  return apiPost(`/api/tasks/${encodeURIComponent(taskId)}/feedback`, payload);
}

export function postCustomSubtask(taskId: string, label: string, type?: string): Promise<SubtaskCompact> {
  return apiPost<SubtaskCompact>(`/api/tasks/${encodeURIComponent(taskId)}/subtasks`, { label, type });
}

// S10d — Settings view types and fetchers

export interface WorkflowStep {
  id: string;
  label: string;
  type: string;
  requires_human?: boolean;
  can_agent_complete_alone?: boolean;
}

export interface WorkflowSummary {
  id: string;
  label: string;
  description?: string;
  steps: WorkflowStep[];
}

export interface HealthInfo {
  ok: boolean;
  version: string;
  uptime_ms: number;
}

export interface ExportResult {
  ok: boolean;
  count: number;
  path: string;
}

export function fetchWorkflows(): Promise<WorkflowSummary[]> {
  return apiGet<WorkflowSummary[]>("/api/workflows");
}

// S7: fetch known repos from daemon (exempt from ?repo= requirement)
export interface RepoEntry {
  path: string;
  lastSeenAt: string;
  /** Original path as typed by the user — preserves casing on Win32. */
  displayPath?: string;
}

export function fetchRepos(): Promise<{ repos: RepoEntry[] }> {
  return apiGet<{ repos: RepoEntry[] }>("/api/daemon/repos");
}

export function fetchHealth(): Promise<HealthInfo> {
  return apiGet<HealthInfo>("/api/health");
}

export function postExport(): Promise<ExportResult> {
  return apiPost<ExportResult>("/api/export", {});
}
