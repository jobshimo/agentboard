/**
 * agentboard status — probe health + list known repos.
 *
 * REQ-L-05, REQ-D-01
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { printLine } from "./output.js";

export interface StatusOpts {
  agbHome?: string;
  /** Injected for testing — defaults to global fetch. */
  _fetch?: typeof fetch;
}

interface HealthBody {
  ok: boolean;
  version?: string;
  uptime_ms?: number;
  pid?: number;
  port?: number;
}

interface ReposBody {
  repos: Array<{ path: string; lastSeenAt: string }>;
}

export async function runStatus(opts: StatusOpts = {}): Promise<void> {
  const agbHome = opts.agbHome ?? (process.env["AGB_HOME"] ?? join(homedir(), ".agentboard"));
  const fetchFn = opts._fetch ?? fetch;
  const port = 7733;

  let health: HealthBody;
  try {
    const res = await fetchFn(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) throw new Error(`health returned ${res.status}`);
    health = (await res.json()) as HealthBody;
  } catch {
    printLine("daemon not running");
    process.exit(1);
    return; // unreachable; for TypeScript flow
  }

  printLine(`daemon running`);
  printLine(`  port:    ${health.port ?? port}`);
  printLine(`  pid:     ${health.pid ?? "unknown"}`);
  printLine(`  uptime:  ${health.uptime_ms !== undefined ? `${Math.round(health.uptime_ms / 1000)}s` : "unknown"}`);
  printLine(`  version: ${health.version ?? "unknown"}`);

  // Fetch known repos
  try {
    const res = await fetchFn(`http://127.0.0.1:${health.port ?? port}/api/daemon/repos`, {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const body = (await res.json()) as ReposBody;
      if (body.repos.length > 0) {
        printLine(`  repos:`);
        for (const repo of body.repos) {
          printLine(`    ${repo.path}  (${repo.lastSeenAt})`);
        }
      } else {
        printLine(`  repos:   (none)`);
      }
    }
  } catch {
    // Non-fatal: repos list is optional info
  }

  // Suppress unused variable warning
  void agbHome;
}
