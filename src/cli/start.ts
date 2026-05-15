import { existsSync } from "node:fs";
import { join } from "node:path";
import { exec } from "node:child_process";
import { homedir } from "node:os";
import { getDb, closeDb } from "../db/connection.js";
import { buildApp } from "../server/app.js";
import { resolvePort, PortInUseError } from "../server/port.js";
import { loadConfig } from "../config/load.js";
import { runEventGc } from "../events/gc.js";
import { runInit } from "./init.js";
import { getVersion } from "./version.js";
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

  // runInit is idempotent: creates dir, opens DB (applies migrations), gitignore.
  runInit(cwd);

  // Config comes from ~/.agentboard/config.yaml (AGB_HOME overrides home).
  const agbHome = process.env["AGB_HOME"] ?? join(homedir(), ".agentboard");
  const config = loadConfig(agbHome);

  // CLI flags take precedence over config file values.
  const port = opts.port !== 0 ? opts.port : config.server.port;
  const openBrowserEnabled = !opts.noOpen && config.server.openBrowser;

  const db = getDb(cwd);
  const app = buildApp({
    db,
    logger: verbose ? { level: "info" } : false,
    mcpActivationMode: config.mcp.activation,
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

  printBanner({
    version: getVersion(),
    port: resolvedPort,
    cwd,
    firstRun,
  });

  if (openBrowserEnabled) {
    printLine(`› opening browser…`);
    openBrowser(`http://localhost:${resolvedPort}`);
  } else {
    printLine(`browser not opened (--no-open).`);
  }
  printLine(`  ctrl-c to stop.`);

  // Schedule GC every 5 minutes as per design §2.14.
  const gcInterval = setInterval(() => {
    runEventGc(db, {
      zombieThresholdMs: config.gc.zombieSessionDays * 24 * 60 * 60 * 1000,
      perTaskBackstop: config.gc.maxEventsPerTask,
    });
  }, GC_INTERVAL_MS);

  // Keep the interval from preventing clean shutdown on SIGINT.
  gcInterval.unref();

  // Graceful shutdown: close Fastify + SQLite on SIGINT (ctrl-c).
  process.once("SIGINT", async () => {
    clearInterval(gcInterval);
    await app.close();
    closeDb();
    process.exit(0);
  });
}
