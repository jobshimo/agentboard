import { existsSync } from "node:fs";
import { join } from "node:path";
import { exec } from "node:child_process";
import { homedir } from "node:os";
import { closeAllDbs } from "../db/connection.js";
import { buildApp } from "../server/app.js";
import { resolvePort, PortInUseError } from "../server/port.js";
import { hasWebBundle } from "../server/web-bundle.js";
import { loadConfig } from "../config/load.js";
import { runEventGc } from "../events/gc.js";
import { initDb, seedUserWorkflows } from "./init.js";
import { getVersion } from "./version.js";
import { writePidFile, unlinkPidFile } from "./spawn-daemon.js";
import {
  printLine,
  printBanner,
  printPortError,
} from "./output.js";

const GC_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes per design §2.14

// Opens the default browser to the given URL.
// Uses platform-specific commands; no extra npm dep required.
function openBrowser(url: string): void {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;

  exec(cmd, (err) => {
    if (err) {
      // Non-fatal — the URL is already printed so the user can open manually.
      printLine(`  (could not open browser automatically)`);
    }
  });
}

export interface StartOpts {
  port: number;
  noOpen: boolean;
  verbose: boolean;
  cwd: string;
}

export async function runStart(opts: StartOpts): Promise<void> {
  const { cwd, verbose } = opts;

  // Determine whether this is the first run before runInit creates the dir.
  const firstRun = !existsSync(join(cwd, ".agentboard", "db.sqlite"));

  // initDb is idempotent: creates dir, opens DB (applies migrations), gitignore.
  initDb(cwd);
  // Seed the global workflows dir on first run so there is a template to copy.
  seedUserWorkflows();

  // Config comes from ~/.agentboard/config.yaml (AGB_HOME overrides home).
  const agbHome = process.env["AGB_HOME"] ?? join(homedir(), ".agentboard");
  const config = loadConfig(agbHome);

  // CLI flags take precedence over config file values.
  const port = opts.port !== 0 ? opts.port : config.server.port;
  const openBrowserEnabled = !opts.noOpen && config.server.openBrowser;

  // S1: buildApp no longer accepts a db argument. DB is now resolved per-request
  // from the ?repo= query param via the onRequest hook.
  // S2: /api/health reads port from app.server.address() at request time so no
  // need to pass it to buildApp.
  const app = buildApp({
    agbHome,
    logger: verbose ? { level: "info" } : false,
  });

  let resolvedPort: number;
  try {
    resolvedPort = await resolvePort(port);
  } catch (err) {
    if (err instanceof PortInUseError) {
      printPortError(err.port);
      process.exit(1);
    }
    throw err;
  }

  await app.listen({ port: resolvedPort, host: "127.0.0.1" });

  // REQ-D-03: write PID file after successful listen
  writePidFile(process.pid, agbHome);

  const webBundlePresent = hasWebBundle();

  printBanner({
    version: getVersion(),
    port: resolvedPort,
    cwd,
    firstRun,
    webBundlePresent,
  });

  // Only auto-open when the SPA bundle is actually being served — otherwise
  // we'd open an empty 404 page (in dev, the SPA lives on Vite at :5173).
  if (openBrowserEnabled && webBundlePresent) {
    printLine(`› opening browser…`);
    openBrowser(`http://localhost:${resolvedPort}`);
  } else if (!webBundlePresent) {
    printLine(`browser not opened (no SPA bundle — see web ui hint above).`);
  } else {
    printLine(`browser not opened (--no-open).`);
  }
  printLine(`  ctrl-c to stop.`);

  // GC uses the cwd DB. After S1, we need to get it from cache since buildApp
  // no longer returns it. The cwd-based DB is already opened by initDb above.
  // We obtain it lazily from the cache for GC purposes.
  const { getDbForRepo } = await import("../db/connection.js");
  const db = getDbForRepo(cwd);

  // Schedule GC every 5 minutes as per design §2.14.
  const gcInterval = setInterval(() => {
    runEventGc(db, {
      zombieThresholdMs: config.gc.zombieSessionDays * 24 * 60 * 60 * 1000,
      perTaskBackstop: config.gc.maxEventsPerTask,
    });
  }, GC_INTERVAL_MS);

  // Keep the interval from preventing clean shutdown on SIGINT.
  gcInterval.unref();

  // Graceful shutdown: close Fastify + all SQLite instances on SIGINT (ctrl-c)
  // and SIGTERM (agentboard stop).
  // REQ-D-02, REQ-S-05
  const shutdown = async () => {
    clearInterval(gcInterval);
    await app.close();
    closeAllDbs();
    unlinkPidFile(agbHome);
    // Safety force-exit after 5s in case close() hangs
    setTimeout(() => process.exit(0), 5000).unref();
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
