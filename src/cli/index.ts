#!/usr/bin/env node
// Entry point for `npx @jobshimo/agentboard`. Hand-rolled argv parser — no
// commander dep — 3 subcommands do not justify a framework (YAGNI).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runStart } from "./start.js";
import { runInit } from "./init.js";
import { runExport } from "./export.js";
import { getVersion } from "./version.js";
import { printLine, printError, printHelp } from "./output.js";
import { getDb } from "../db/connection.js";

interface ParsedArgs {
  command: "start" | "init" | "export" | "help" | "version";
  port: number;
  noOpen: boolean;
  verbose: boolean;
}

// Returns a structured result instead of side-effecting immediately so tests
// can verify parse logic without spawning a real server.
export function parseArgv(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // strip node + script path

  let command: ParsedArgs["command"] = "start";
  let port = 0; // 0 = "use config default"
  let noOpen = false;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "init") { command = "init"; continue; }
    if (arg === "export") { command = "export"; continue; }
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

  return { command, port, noOpen, verbose };
}

async function main(): Promise<void> {
  const { command, port, noOpen, verbose } = parseArgv(process.argv);
  const cwd = process.cwd();

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

    case "start":
      await runStart({ port, noOpen, verbose, cwd });
      break;
  }
}

main().catch((err: unknown) => {
  printError(`✗ unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
