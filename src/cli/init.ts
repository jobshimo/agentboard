import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "../db/connection.js";
import { printLine } from "./output.js";

// Ensures `.agentboard/db.sqlite` is listed in the nearest `.gitignore`.
// Idempotent — does not add a duplicate line if already present.
function ensureGitignore(cwd: string): void {
  const gitignorePath = join(cwd, ".gitignore");
  const entry = ".agentboard/db.sqlite";

  let content = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, "utf8")
    : "";

  if (!content.split("\n").some((line) => line.trim() === entry)) {
    const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
    writeFileSync(gitignorePath, `${content}${separator}${entry}\n`, "utf8");
    printLine(`✓ appended ${entry} to .gitignore`);
  }
}

// Creates the `.agentboard/` directory, opens (and migrates) the DB, and
// ensures `db.sqlite` is gitignored. Safe to call multiple times — all steps
// are idempotent.
export function runInit(cwd: string): void {
  const agentboardDir = join(cwd, ".agentboard");
  mkdirSync(agentboardDir, { recursive: true });

  // Opening the DB applies WAL pragmas + runs migrations automatically.
  getDb(cwd);

  ensureGitignore(cwd);

  printLine(`✓ wrote .agentboard/db.sqlite    empty schema`);
}
