/**
 * agentboard stop — graceful SIGTERM + poll until gone.
 *
 * REQ-L-04, REQ-D-02
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { readPidFile, unlinkPidFile } from "./spawn-daemon.js";
import { printLine } from "./output.js";

export interface StopOpts {
  agbHome?: string;
  /** Injected for testing — defaults to global fetch. */
  _fetch?: typeof fetch;
}

const POLL_INTERVAL_MS = 100;
const POLL_TIMEOUT_MS = 5000;

async function daemonIsGone(port: number, fetchFn: typeof fetch): Promise<boolean> {
  try {
    await fetchFn(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(200),
    });
    return false; // still responding
  } catch {
    return true; // gone
  }
}

export async function runStop(opts: StopOpts = {}): Promise<void> {
  const agbHome = opts.agbHome ?? (process.env["AGB_HOME"] ?? join(homedir(), ".agentboard"));
  const fetchFn = opts._fetch ?? fetch;

  const pid = readPidFile(agbHome);
  if (pid === null) {
    printLine("daemon not running");
    return;
  }

  // Verify the PID is alive
  let alive = true;
  try {
    process.kill(pid, 0);
  } catch {
    alive = false;
  }

  if (!alive) {
    unlinkPidFile(agbHome);
    printLine("daemon not running");
    return;
  }

  // We need the port to poll health. Try to probe first.
  // Default to config port (7733). The daemon's health response includes port.
  let port = 7733;
  try {
    const res = await fetchFn(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(500),
    });
    if (res.ok) {
      const body = (await res.json()) as { port?: number };
      if (typeof body.port === "number") port = body.port;
    }
  } catch {
    // Use default port
  }

  // Send SIGTERM
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    unlinkPidFile(agbHome);
    printLine("daemon not running");
    return;
  }

  // Poll until gone
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    if (await daemonIsGone(port, fetchFn)) {
      unlinkPidFile(agbHome);
      printLine("stopped");
      return;
    }
  }

  printLine("timed out waiting for daemon to stop");
}
