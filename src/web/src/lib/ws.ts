// Reconnecting WebSocket client — wraps native WebSocket.
// On each message: parses the signal-only push and calls invalidateTasks.
// Backoff: 250ms → 500 → 1000 → 2000 → 4000 → 8000ms (capped).
// After 5 consecutive failures: connection state becomes 'offline'.

import { dispatch } from "./store";
import { fetchTasks } from "./api";

// Shape pushed by the server per realtime-ui.md
export interface WsPush {
  event: string;
  task_id: string | null;
  entity_ids: string[];
}

// Parses raw JSON text into WsPush. Returns null on malformed input.
export function parseWsPush(raw: string): WsPush | null {
  try {
    const obj: unknown = JSON.parse(raw);
    if (
      typeof obj !== "object" ||
      obj === null ||
      typeof (obj as Record<string, unknown>)["event"] !== "string"
    ) {
      return null;
    }
    const msg = obj as Record<string, unknown>;
    return {
      event: msg["event"] as string,
      task_id: typeof msg["task_id"] === "string" ? msg["task_id"] : null,
      entity_ids: Array.isArray(msg["entity_ids"])
        ? (msg["entity_ids"] as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
    };
  } catch {
    return null;
  }
}

const BASE_DELAY = 250;
const MAX_DELAY = 8000;
const OFFLINE_AFTER = 5;

let socket: WebSocket | null = null;
let retries = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;

function backoffDelay(attempt: number): number {
  return Math.min(BASE_DELAY * Math.pow(2, attempt), MAX_DELAY);
}

async function refetchAll(): Promise<void> {
  try {
    const tasks = await fetchTasks();
    dispatch({ type: "SET_TASKS", tasks });
  } catch {
    // Refetch failure is non-fatal; store keeps stale tasks until next push.
  }
}

function connect(url: string): void {
  if (stopped) return;

  socket = new WebSocket(url);

  socket.onopen = () => {
    retries = 0;
    dispatch({ type: "SET_CONNECTION", connection: "connected" });
    // Reconcile state after reconnect — may have missed pushes while offline.
    void refetchAll();
  };

  socket.onmessage = (evt: MessageEvent<string>) => {
    const push = parseWsPush(evt.data);
    if (!push) return; // malformed — ignore silently
    // Signal-only: we don't embed data in the push; refetch the task list.
    void refetchAll();
  };

  socket.onclose = () => {
    if (stopped) return;
    retries += 1;
    const state = retries >= OFFLINE_AFTER ? "offline" : "reconnecting";
    dispatch({ type: "SET_CONNECTION", connection: state });

    const delay = backoffDelay(retries - 1);
    retryTimer = setTimeout(() => connect(url), delay);
  };

  socket.onerror = () => {
    // onerror always precedes onclose; we handle state in onclose to avoid duplicate dispatch.
    socket?.close();
  };
}

// Default URL targets the same host as the SPA so Vite proxies in dev
// and the production server serves both on the same origin.
function defaultWsUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:7733/ws";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

// Starts the WS client. Idempotent if already started.
export function startWs(url: string = defaultWsUrl()): void {
  if (socket || retryTimer) return;
  stopped = false;
  connect(url);
}

// Tears down the WS client cleanly (used in tests and before HMR).
export function stopWs(): void {
  stopped = true;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (socket) {
    socket.onclose = null; // prevent reconnect loop on intentional close
    socket.close();
    socket = null;
  }
  retries = 0;
}
