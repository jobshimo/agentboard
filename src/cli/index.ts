#!/usr/bin/env node
// Entry point for `npx @jobshimo/agentboard`. Hand-rolled argv parser — no
// commander dep — subcommands do not justify a framework (YAGNI).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { runStart } from "./start.js";
import { runInit } from "./init.js";
import { runExport } from "./export.js";
import { runStop } from "./stop.js";
import { runStatus } from "./status.js";
import { getVersion } from "./version.js";
import { printLine, printError, printHelp } from "./output.js";
import { getDb } from "../db/connection.js";

interface ParsedArgs {
  command: "start" | "daemon" | "init" | "export" | "stop" | "status" | "mcp" | "help" | "version";
  port: number;
  noOpen: boolean;
  verbose: boolean;
  /** --repo flag: only accepted when command === "mcp". */
  repo: string | null;
}

// Returns a structured result instead of side-effecting immediately so tests
// can verify parse logic without spawning a real server.
export function parseArgv(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // strip node + script path

  let command: ParsedArgs["command"] = "start";
  let port = 0; // 0 = "use config default"
  let noOpen = false;
  let verbose = false;
  let repo: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;

    if (arg === "daemon") { command = "daemon"; continue; }
    if (arg === "init") { command = "init"; continue; }
    if (arg === "export") { command = "export"; continue; }
    if (arg === "stop") { command = "stop"; continue; }
    if (arg === "status") { command = "status"; continue; }
    if (arg === "mcp") { command = "mcp"; continue; }
    if (arg === "--help" || arg === "-h") { command = "help"; continue; }
    if (arg === "--version" || arg === "-v") { command = "version"; continue; }
    if (arg === "--no-open") { noOpen = true; continue; }
    if (arg === "--verbose") { verbose = true; continue; }

    if (arg === "--port") {
      const next = args[++i] ?? "";
      const parsed = Number(next);
      if (!next || !Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        printError(`✗ --port must be a valid port number (1–65535), got: ${next || "(missing)"}`);
        process.exit(1);
      }
      port = parsed;
      continue;
    }

    // --port=<n> form
    if (arg.startsWith("--port=")) {
      const parsed = Number(arg.slice(7));
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        printError(`✗ --port must be a valid port number (1–65535), got: ${arg.slice(7)}`);
        process.exit(1);
      }
      port = parsed;
      continue;
    }

    // --repo <path> — only valid for mcp subcommand (REQ-L-06)
    if (arg === "--repo") {
      if (command !== "mcp") {
        printError(`✗ --repo is only valid with the 'mcp' subcommand`);
        process.exit(1);
      }
      repo = args[++i] ?? null;
      continue;
    }
    if (arg.startsWith("--repo=")) {
      if (command !== "mcp") {
        printError(`✗ --repo is only valid with the 'mcp' subcommand`);
        process.exit(1);
      }
      repo = arg.slice(7);
      continue;
    }

    // Unknown subcommand — treat as error
    if (!arg.startsWith("-")) {
      printError(`✗ unknown command: ${arg}`);
      printError(`  run agentboard --help for usage`);
      process.exit(1);
    }

    printError(`✗ unknown flag: ${arg}`);
    printError(`  run agentboard --help for usage`);
    process.exit(1);
  }

  return { command, port, noOpen, verbose, repo };
}

async function main(): Promise<void> {
  const { command, port, noOpen, verbose, repo } = parseArgv(process.argv);
  const cwd = process.cwd();
  const agbHome = process.env["AGB_HOME"] ?? join(homedir(), ".agentboard");

  switch (command) {
    case "help":
      printHelp();
      process.exit(0);

    case "version": {
      const v = getVersion();
      printLine(`agentboard v${v}`);
      printLine(`node ${process.version}`);
      process.exit(0);
    }

    case "init":
      runInit(cwd);
      printLine(`\nnext: npx @jobshimo/agentboard`);
      process.exit(0);

    case "export": {
      // Check initialization BEFORE getDb — getDb would create the file if missing.
      const dbPath = join(cwd, ".agentboard", "db.sqlite");
      if (!existsSync(dbPath)) {
        printError("");
        printError("✗ nothing to export");
        printError("");
        printError("  no .agentboard/ in this directory. there is no board to dump.");
        printError("");
        printError("fix");
        printError("  $ agentboard init                # create one");
        process.exit(1);
      }
      const db = getDb(cwd);
      runExport(db, cwd);
      process.exit(0);
    }

    case "stop":
      await runStop({ agbHome });
      process.exit(0);

    case "status":
      await runStatus({ agbHome });
      // runStatus calls process.exit(1) on failure; on success we exit 0
      process.exit(0);

    case "mcp": {
      // REQ-L-06: --repo flag validated here at parse time (handled in parseArgv)
      // Dynamic import to avoid loading Fastify/ws/MCP deps in non-mcp paths.
      const { runMcp } = await import("./mcp.js");
      await runMcp({ repo });
      break;
    }

    // "daemon" is an alias for "start" (REQ-L-02)
    case "daemon":
    case "start":
      await runStart({ port, noOpen, verbose, cwd });
      break;
  }
}

// Only run main() when this file is invoked as the entry point (npm bin).
// Importing parseArgv from this file from tests must NOT trigger main().
import { fileURLToPath } from "node:url";
const isEntry = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isEntry) {
  main().catch((err: unknown) => {
    printError(`✗ unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
