// Tiny in-memory store with useSyncExternalStore integration.
// Shape: tasks map, notifications queue, ws connection state.
// WS pushes call invalidate(taskId) → re-fetch → notifyListeners.
// No external state library — YAGNI.

import { useSyncExternalStore } from "react";
import type { ViewName, RouteMatch } from "../router/route";
import type { CompactTask, TaskFull, SubtaskCompact, DiscussionEntry, WorkflowSummary, HealthInfo } from "./api";

export type ConnectionState = "connected" | "reconnecting" | "offline";

export interface Notification {
  id: string;
  urgency: "info" | "warning" | "blocked";
  title: string;
  body: string;
  taskId: string;
  at: string;
}

export interface StoreState {
  tasks: CompactTask[];
  notifications: Notification[];
  connection: ConnectionState;
  route: RouteMatch;
  // Board view state — shared between Sidebar (filter setter) and Board (consumer)
  workflowFilter: string | null;
  columnMode: "macro" | "workflow";
  // Task detail state — keyed by task id so navigating back/forward doesn't flash empty
  taskDetail: Record<string, TaskFull>;
  discussion: Record<string, DiscussionEntry[]>;
  // Settings view state
  workflows: WorkflowSummary[];
  health: HealthInfo | null;
  // S7: repo selector — activeRepo persisted to localStorage
  activeRepo: string | null;
  availableRepos: string[];
}

// Re-export types — consumers can import from either api or store.
export type { CompactTask, TaskFull, SubtaskCompact, DiscussionEntry, WorkflowSummary, HealthInfo };

type Listener = () => void;

const listeners = new Set<Listener>();

// S7: initialise activeRepo from localStorage on first load
function getInitialActiveRepo(): string | null {
  try {
    return localStorage.getItem("agentboard.activeRepo");
  } catch {
    return null;
  }
}

let state: StoreState = {
  tasks: [],
  notifications: [],
  connection: "reconnecting",
  route: { view: "board" },
  workflowFilter: null,
  columnMode: "macro",
  taskDetail: {},
  discussion: {},
  workflows: [],
  health: null,
  activeRepo: getInitialActiveRepo(),
  availableRepos: [],
};

function getSnapshot(): StoreState {
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

// All mutations go through dispatch — single write path.
export type Action =
  | { type: "SET_TASKS"; tasks: CompactTask[] }
  | { type: "SET_CONNECTION"; connection: ConnectionState }
  | { type: "PUSH_NOTIFICATION"; notification: Notification }
  | { type: "MARK_ALL_READ" }
  | { type: "SET_ROUTE"; route: RouteMatch }
  | { type: "SET_WORKFLOW_FILTER"; workflowFilter: string | null }
  | { type: "SET_COLUMN_MODE"; columnMode: "macro" | "workflow" }
  // S10c — task detail actions
  | { type: "SET_TASK_DETAIL"; task: TaskFull }
  | { type: "SET_DISCUSSION"; taskId: string; entries: DiscussionEntry[] }
  | { type: "APPEND_DISCUSSION_ENTRY"; taskId: string; entry: DiscussionEntry }
  | { type: "UPSERT_SUBTASK"; taskId: string; subtask: SubtaskCompact }
  // S10d — settings actions
  | { type: "SET_WORKFLOWS"; workflows: WorkflowSummary[] }
  | { type: "SET_HEALTH"; health: HealthInfo }
  // S7 — repo selector actions
  | { type: "SET_ACTIVE_REPO"; activeRepo: string | null }
  | { type: "SET_AVAILABLE_REPOS"; availableRepos: string[] };

export function dispatch(action: Action): void {
  switch (action.type) {
    case "SET_TASKS":
      state = { ...state, tasks: action.tasks };
      break;
    case "SET_CONNECTION":
      state = { ...state, connection: action.connection };
      break;
    case "PUSH_NOTIFICATION":
      state = { ...state, notifications: [action.notification, ...state.notifications] };
      break;
    case "MARK_ALL_READ":
      state = { ...state, notifications: [] };
      break;
    case "SET_ROUTE":
      state = { ...state, route: action.route };
      break;
    case "SET_WORKFLOW_FILTER":
      state = { ...state, workflowFilter: action.workflowFilter };
      break;
    case "SET_COLUMN_MODE":
      state = { ...state, columnMode: action.columnMode };
      break;
    case "SET_TASK_DETAIL":
      state = { ...state, taskDetail: { ...state.taskDetail, [action.task.id]: action.task } };
      break;
    case "SET_DISCUSSION":
      state = { ...state, discussion: { ...state.discussion, [action.taskId]: action.entries } };
      break;
    case "APPEND_DISCUSSION_ENTRY": {
      const prev = state.discussion[action.taskId] ?? [];
      state = { ...state, discussion: { ...state.discussion, [action.taskId]: [...prev, action.entry] } };
      break;
    }
    case "UPSERT_SUBTASK": {
      const detail = state.taskDetail[action.taskId];
      if (detail) {
        const updated = detail.subtasks.map(s => s.id === action.subtask.id ? action.subtask : s);
        const hadIt = detail.subtasks.some(s => s.id === action.subtask.id);
        const subtasks = hadIt ? updated : [...detail.subtasks, action.subtask];
        state = { ...state, taskDetail: { ...state.taskDetail, [action.taskId]: { ...detail, subtasks } } };
      }
      break;
    }
    case "SET_WORKFLOWS":
      state = { ...state, workflows: action.workflows };
      break;
    case "SET_HEALTH":
      state = { ...state, health: action.health };
      break;
    case "SET_ACTIVE_REPO":
      state = { ...state, activeRepo: action.activeRepo };
      // Persist to localStorage for next page load
      if (action.activeRepo !== null) {
        try {
          localStorage.setItem("agentboard.activeRepo", action.activeRepo);
        } catch {
          // Ignore storage errors
        }
      }
      break;
    case "SET_AVAILABLE_REPOS":
      state = { ...state, availableRepos: action.availableRepos };
      break;
  }
  notifyListeners();
}

// Resets the store state — used in tests only.
export function _resetStore(initial?: Partial<StoreState>): void {
  state = {
    tasks: [],
    notifications: [],
    connection: "reconnecting",
    route: { view: "board" },
    workflowFilter: null,
    columnMode: "macro",
    taskDetail: {},
    discussion: {},
    workflows: [],
    health: null,
    activeRepo: null,
    availableRepos: [],
    ...initial,
  };
  // Do NOT notify — tests control when assertions run.
}

// Selector hooks — components import these, never touch state directly.

export function useTasks(): CompactTask[] {
  return useSyncExternalStore(subscribe, () => getSnapshot().tasks);
}

export function useConnection(): ConnectionState {
  return useSyncExternalStore(subscribe, () => getSnapshot().connection);
}

export function useNotifications(): Notification[] {
  return useSyncExternalStore(subscribe, () => getSnapshot().notifications);
}

export function useRoute(): RouteMatch {
  return useSyncExternalStore(subscribe, () => getSnapshot().route);
}

export function useWorkflowFilter(): string | null {
  return useSyncExternalStore(subscribe, () => getSnapshot().workflowFilter);
}

export function useColumnMode(): "macro" | "workflow" {
  return useSyncExternalStore(subscribe, () => getSnapshot().columnMode);
}

// S10c — task detail hooks
export function useTaskDetail(id: string): TaskFull | null {
  return useSyncExternalStore(subscribe, () => getSnapshot().taskDetail[id] ?? null);
}

export function useDiscussion(id: string): DiscussionEntry[] {
  return useSyncExternalStore(subscribe, () => getSnapshot().discussion[id] ?? []);
}

// S10d — settings hooks
export function useWorkflows(): WorkflowSummary[] {
  return useSyncExternalStore(subscribe, () => getSnapshot().workflows);
}

export function useHealth(): HealthInfo | null {
  return useSyncExternalStore(subscribe, () => getSnapshot().health);
}

// S7 — repo selector hooks
export function useActiveRepo(): string | null {
  return useSyncExternalStore(subscribe, () => getSnapshot().activeRepo);
}

export function useAvailableRepos(): string[] {
  return useSyncExternalStore(subscribe, () => getSnapshot().availableRepos);
}

// For non-React consumers (e.g. ws.ts needs to read current view).
export function getState(): StoreState {
  return state;
}

// S7: get active repo without a React hook (for api.ts)
export function getActiveRepo(): string | null {
  return state.activeRepo;
}

// Re-export ViewName so consumers only need to import from one place.
export { type ViewName };
