/**
 * Auto-spawn HTTP daemon from STDIO MCP process when the daemon is down.
 *
 * Probe /api/health on the configured port:
 *  - 200 + ok=true → daemon is running, skip spawn
 *  - 200 + ok=false → foreign process, log warning + skip spawn
 *  - Error (ECONNREFUSED/timeout) → spawn daemon in background, unref child
 *
 * The spawn is fire-and-forget — we do NOT wait for health to come up.
 * The daemon may take a moment to bind; until then notifyDaemon calls
 * fail silently (which is the normal behavior when the daemon is down).
 *
 * Commit 8 — feat(mcp): auto-spawn HTTP daemon on STDIO startup if down
 */

import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PROBE_TIMEOUT_MS = 300;

export interface AutoSpawnOpts {
  /** Port to probe and potentially bind the daemon to. */
  port: number;
  /** Path to the agentboard home directory (~/.agentboard). */
  agbHome: string;
  /** Injected for testing — defaults to global fetch. */
  _fetch?: typeof fetch;
  /** Injected for testing — defaults to child_process.spawn. */
  _spawn?: typeof nodeSpawn;
}

/**
 * Probe the daemon on `port`. If not running, spawn it in the background.
 * Never throws — errors are logged to stderr and the function resolves.
 */
export async function probeAndMaybeSpawnDaemon(opts: AutoSpawnOpts): Promise<void> {
  const { port, agbHome } = opts;
  const fetchFn = opts._fetch ?? fetch;
  const spawnFn = opts._spawn ?? nodeSpawn;

  let daemonIsRunning = false;
  let isForeignProcess = false;

  try {
    const res = await fetchFn(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (res.ok) {
      const body = (await res.json()) as { ok?: boolean };
      if (body.ok === true) {
        daemonIsRunning = true;
      } else {
        isForeignProcess = true;
      }
    } else {
      isForeignProcess = true;
    }
  } catch {
    // ECONNREFUSED or timeout → no daemon running, will spawn
    daemonIsRunning = false;
  }

  if (daemonIsRunning) {
    return;
  }

  if (isForeignProcess) {
    process.stderr.write(
      `[agentboard mcp] port ${port} is held by a foreign process — realtime push to SPA unavailable\n`,
    );
    return;
  }

  // Port is free → spawn daemon in background
  const entryPath = join(dirname(fileURLToPath(import.meta.url)), "../cli/index.js");
  const args = ["--port", String(port), "--no-open"];

  let child: ChildProcess;
  try {
    child = spawnFn(process.execPath, [entryPath, ...args], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, AGB_HOME: agbHome },
    });
    child.unref();
    process.stderr.write(
      `[agentboard mcp] spawned daemon at :${port} for realtime UI push (PID ${child.pid ?? "?"})\n`,
    );
  } catch (err) {
    process.stderr.write(
      `[agentboard mcp] failed to spawn daemon: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}
