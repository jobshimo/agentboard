/**
 * Fire-and-forget loopback POST to /internal/notify.
 *
 * Used by the STDIO MCP process to nudge the daemon after each insertEvent
 * so the daemon can re-fetch the event and push it to WebSocket clients.
 *
 * NEVER throws. NEVER awaited by caller. Daemon-down is not an error condition
 * (DB is authoritative; WS push is best-effort).
 *
 * REQ-M-04, REQ-D-05
 */

const DEFAULT_PORT = 7733;
const NOTIFY_TIMEOUT_MS = 100;

// Module-level flag to suppress repeated stderr logs after the first failure.
// Design risk note: log once per session per failure to avoid stderr spam.
let _notifyFailureLogged = false;

export interface NotifyDaemonOpts {
  port?: number;
  secret?: string;
  /** Injected for testing. Defaults to global fetch. */
  _fetch?: typeof fetch;
}

/**
 * Fire-and-forget POST /internal/notify to the running daemon.
 * Errors are caught and logged to stderr (once per session).
 *
 * @param repoRoot - Normalized repo root path
 * @param eventId  - ID of the just-inserted event row
 * @param opts     - Optional overrides for port/secret/fetch (testing)
 */
export function notifyDaemon(
  repoRoot: string,
  eventId: number,
  opts: NotifyDaemonOpts = {},
): void {
  const port = opts.port ?? DEFAULT_PORT;
  const fetchFn = opts._fetch ?? fetch;
  const secret = opts.secret ?? process.env["AGENTBOARD_NOTIFY_SECRET"];

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (secret) {
    headers["x-agentboard-secret"] = secret;
  }

  // Fire-and-forget — do NOT await
  fetchFn(`http://127.0.0.1:${port}/internal/notify`, {
    method: "POST",
    headers,
    body: JSON.stringify({ repo: repoRoot, event_id: eventId }),
    signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS),
  }).catch((err: unknown) => {
    if (!_notifyFailureLogged) {
      _notifyFailureLogged = true;
      process.stderr.write(
        `notify-daemon: failed to notify daemon (daemon may not be running — this is not an error): ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  });
}

/** Reset session-level flag — for testing only. */
export function _resetNotifyState(): void {
  _notifyFailureLogged = false;
}
