import { mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../db/connection.js";
import { printLine } from "./output.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEMPLATE_WORKFLOW = join(PACKAGE_ROOT, "templates", "workflows", "coding-task.yaml");

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

// Copies the bundled workflow template into `<cwd>/.agentboard/workflows/coding-task.yaml`.
// Idempotent — skips the copy if the destination already exists (preserves user edits).
function copyWorkflowTemplate(cwd: string): void {
  const workflowsDir = join(cwd, ".agentboard", "workflows");
  const dest = join(workflowsDir, "coding-task.yaml");

  if (existsSync(dest)) return;

  mkdirSync(workflowsDir, { recursive: true });

  if (!existsSync(TEMPLATE_WORKFLOW)) return;

  copyFileSync(TEMPLATE_WORKFLOW, dest);
  printLine(`✓ copied coding-task.yaml to .agentboard/workflows/`);
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
  copyWorkflowTemplate(cwd);

  printLine(`✓ wrote .agentboard/db.sqlite    empty schema`);
}
