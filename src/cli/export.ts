import type Database from "better-sqlite3";
import { join } from "node:path";
import { runExportSnapshot } from "../server/export.js";
import { printLine } from "./output.js";

type Db = InstanceType<typeof Database>;

// CLI handler for `agentboard export`.
// Initialization check is performed by index.ts before calling this function.
export function runExport(db: Db, cwd: string): void {
  const snapshotDir = join(cwd, ".agentboard", "snapshot");

  printLine("");
  printLine(`exporting board to .agentboard/snapshot/ …`);
  printLine("");

  const { count, path } = runExportSnapshot(db, snapshotDir);

  printLine(`✓  wrote ${count} task file(s) to ${path}`);
  printLine("");
}
