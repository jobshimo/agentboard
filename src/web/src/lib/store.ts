// Tiny in-memory store with useSyncExternalStore integration.
// Shape: tasks map, notifications queue, ws connection state.
// WS pushes call invalidate(taskId) → re-fetch → notifyListeners.
// No external state library — YAGNI.

import { useSyncExternalStore } from "react";
import type { ViewName, RouteMatch } from "../router/route";

export type ConnectionState = "connected" | "reconnecting" | "offline";

export interface Notification {
  id: string;
  urgency: "info" | "warning" | "blocked";
  title: string;
  body: string;
  taskId: string;
  at: string;
}

// Compact task shape returned by GET /api/tasks
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
}

export interface StoreState {
  tasks: CompactTask[];
  notifications: Notification[];
  connection: ConnectionState;
  route: RouteMatch;
  // Board view state — shared between Sidebar (filter setter) and Board (consumer)
  workflowFilter: string | null;
  columnMode: "macro" | "workflow";
}

type Listener = () => void;

const listeners = new Set<Listener>();

let state: StoreState = {
  tasks: [],
  notifications: [],
  connection: "reconnecting",
  route: { view: "board" },
  workflowFilter: null,
  columnMode: "macro",
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
  | { type: "SET_COLUMN_MODE"; columnMode: "macro" | "workflow" };

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

// For non-React consumers (e.g. ws.ts needs to read current view).
export function getState(): StoreState {
  return state;
}

// Re-export ViewName so consumers only need to import from one place.
export { type ViewName };
