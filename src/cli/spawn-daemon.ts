/**
 * Idempotent daemon spawn + PID file helpers.
 *
 * REQ-L-01, REQ-D-01, REQ-D-02, REQ-D-03
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class ForeignProcessOnPortError extends Error {
  readonly port: number;

  constructor(port: number) {
    super(`Port ${port} is in use by a process that is not an agentboard daemon. Use --port to choose another port, or stop the occupying process (try: lsof -i :${port}).`);
    this.name = "ForeignProcessOnPortError";
    this.port = port;
  }
}

// ---------------------------------------------------------------------------
// PID file helpers
// ---------------------------------------------------------------------------

function pidFilePath(agbHome: string): string {
  return join(agbHome, "daemon.pid");
}

/** Write PID to ~/.agentboard/daemon.pid (creates dir if needed). */
export function writePidFile(pid: number, agbHome: string): void {
  mkdirSync(agbHome, { recursive: true });
  writeFileSync(pidFilePath(agbHome), String(pid), "utf8");
}

/** Read PID from ~/.agentboard/daemon.pid. Returns null if file missing or invalid. */
export function readPidFile(agbHome: string): number | null {
  const path = pidFilePath(agbHome);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8").trim();
    const pid = Number(raw);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/** Remove ~/.agentboard/daemon.pid. Idempotent. */
export function unlinkPidFile(agbHome: string): void {
  try {
    unlinkSync(pidFilePath(agbHome));
  } catch {
    // Ignore ENOENT
  }
}

// ---------------------------------------------------------------------------
// Health probe types
// ---------------------------------------------------------------------------

interface HealthResponse {
  ok: boolean;
  pid?: number;
  port?: number;
  uptime_ms?: number;
  version?: string;
}

/**
 * Structured result returned by probeForExistingDaemon.
 * Discriminated union — callers must check the shape before acting.
 */
export type DaemonProbeResult =
  | { alreadyRunning: true; pid: number; port: number }
  | { foreignProcess: true; port: number }
  | { free: true };

// ---------------------------------------------------------------------------
// spawnDaemon
// ---------------------------------------------------------------------------

export interface SpawnDaemonOpts {
  port: number;
  noOpen: boolean;
  agbHome: string;
  /** Injected for testing — defaults to global fetch. */
  _fetch?: typeof fetch;
  /** Injected for testing — defaults to child_process.spawn. */
  _spawn?: typeof nodeSpawn;
  /** Injected for testing — overrides SPAWN_POLL_TIMEOUT_MS. */
  _pollTimeoutMs?: number;
}

const HEALTH_PROBE_TIMEOUT_MS = 500;
const SPAWN_POLL_TIMEOUT_MS = 3000;
const SPAWN_POLL_INTERVAL_MS = 100;

type ProbeResult =
  | { status: "ok"; health: HealthResponse }
  | { status: "foreign" }   // port is in use but not our daemon
  | { status: "gone" };     // timeout / ECONNREFUSED / not listening

async function probeHealth(
  port: number,
  timeoutMs: number,
  fetchFn: typeof fetch,
): Promise<ProbeResult> {
  try {
    const res = await fetchFn(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      // A process is listening but returned non-200 → foreign
      return { status: "foreign" };
    }
    const health = (await res.json()) as HealthResponse;
    if (health.ok === true) {
      return { status: "ok", health };
    }
    // ok field is false — probably a foreign process that returned JSON
    return { status: "foreign" };
  } catch {
    // Timeout, ECONNREFUSED, etc. → not listening
    return { status: "gone" };
  }
}

/**
 * Probe whether a daemon is already listening on `port`.
 *
 * Handles the stale-PID case: if a PID file exists but the process is dead
 * (kill -0 throws ESRCH), the file is unlinked before probing the port.
 *
 * Returns one of three states:
 *  - alreadyRunning — /api/health → 200 + ok=true (our daemon, safe to reuse)
 *  - foreignProcess — port is held by something else (caller should error)
 *  - free           — nothing listening, safe to spawn
 *
 * REQ-L-01
 */
export async function probeForExistingDaemon(
  port: number,
  agbHome: string,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<DaemonProbeResult> {
  // Clean up stale PID file before probing
  const existingPid = readPidFile(agbHome);
  if (existingPid !== null) {
    try {
      process.kill(existingPid, 0);
    } catch {
      // ESRCH — process is gone, remove the stale file
      unlinkPidFile(agbHome);
    }
  }

  const probe = await probeHealth(port, HEALTH_PROBE_TIMEOUT_MS, fetchFn);

  if (probe.status === "ok") {
    const pid = probe.health.pid ?? 0;
    const resolvedPort = probe.health.port ?? port;
    return { alreadyRunning: true, pid, port: resolvedPort };
  }

  if (probe.status === "foreign") {
    return { foreignProcess: true, port };
  }

  // "gone" — ECONNREFUSED or timeout → port is free
  return { free: true };
}

/**
 * Idempotent daemon spawn:
 *  1. If PID file exists and process is alive → skip to health probe.
 *  2. If PID file exists but process is dead (ESRCH) → unlink stale PID.
 *  3. Health probe:
 *     - 200+ok=true → daemon already running, return.
 *     - Non-200 → ForeignProcessOnPortError.
 *     - Timeout/ECONNREFUSED → spawn child.
 *  4. Poll health up to 3s after spawn.
 *
 * REQ-L-01, REQ-D-02, REQ-D-03
 */
export async function spawnDaemon(opts: SpawnDaemonOpts): Promise<void> {
  const { port, noOpen, agbHome } = opts;
  const fetchFn = opts._fetch ?? fetch;
  const spawnFn = opts._spawn ?? nodeSpawn;
  const pollTimeoutMs = opts._pollTimeoutMs ?? SPAWN_POLL_TIMEOUT_MS;

  // Step 1+2: PID file fast-path
  const existingPid = readPidFile(agbHome);
  if (existingPid !== null) {
    let alive = false;
    try {
      process.kill(existingPid, 0);
      alive = true;
    } catch {
      // ESRCH = no such process → stale
      unlinkPidFile(agbHome);
    }
    if (!alive) {
      // Stale PID removed above, continue to health probe (will ECONNREFUSED → spawn)
    }
  }

  // Step 3: Health probe
  const probe = await probeHealth(port, HEALTH_PROBE_TIMEOUT_MS, fetchFn);
  if (probe.status === "ok") {
    // Daemon already running — nothing to do
    // Open browser is handled by the caller (start.ts)
    return;
  }
  if (probe.status === "foreign") {
    // A non-agentboard process is using this port
    throw new ForeignProcessOnPortError(port);
  }

  // probe.status === "gone" → port is free, spawn new daemon
  const entryPath = join(dirname(fileURLToPath(import.meta.url)), "index.js");
  const args = port !== 0 ? ["--port", String(port)] : [];
  if (noOpen) args.push("--no-open");

  const child: ChildProcess = spawnFn(process.execPath, [entryPath, ...args], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  if (child.pid !== undefined) {
    writePidFile(child.pid, agbHome);
  }

  // Poll health up to pollTimeoutMs
  const deadline = Date.now() + pollTimeoutMs;
  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, SPAWN_POLL_INTERVAL_MS));
    const h = await probeHealth(port, HEALTH_PROBE_TIMEOUT_MS, fetchFn);
    if (h.status === "ok") return;
    if (h.status === "foreign") throw new ForeignProcessOnPortError(port);
  }

  throw new Error(`Daemon did not start within ${pollTimeoutMs}ms`);
}
