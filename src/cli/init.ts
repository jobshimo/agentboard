import { mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { getDb } from "../db/connection.js";
import { printLine } from "./output.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUNDLED_TEMPLATE = join(PACKAGE_ROOT, "templates", "workflows", "coding-task.yaml");

/**
 * Ensures ~/.agentboard/workflows/ exists and contains the bundled starter template.
 * Runs only if the directory does not exist yet (first-run UX).
 * Skips silently if the global dir already exists — user may have custom workflows.
 */
export function seedUserWorkflows(home: string = homedir()): void {
  const globalWorkflowsDir = join(home, ".agentboard", "workflows");
  if (existsSync(globalWorkflowsDir)) return;

  mkdirSync(globalWorkflowsDir, { recursive: true });

  if (existsSync(BUNDLED_TEMPLATE)) {
    const dest = join(globalWorkflowsDir, "coding-task.yaml");
    copyFileSync(BUNDLED_TEMPLATE, dest);
    printLine(`✓ seeded ~/.agentboard/workflows/coding-task.yaml (first-run)`);
  }
}

/**
 * Ensures `.agentboard/db.sqlite` is listed in the nearest `.gitignore`.
 * Idempotent — does not add a duplicate line if already present.
 */
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

/**
 * Idempotent DB bootstrap used by `runStart`. Creates the `.agentboard/` directory,
 * opens and migrates the DB, and ensures `db.sqlite` is gitignored.
 * Does NOT copy workflow templates — that is the sole responsibility of `runInit`.
 */
export function initDb(cwd: string): void {
  mkdirSync(join(cwd, ".agentboard"), { recursive: true });
  getDb(cwd);
  ensureGitignore(cwd);
}

/**
 * Copies a global workflow template into `<cwd>/.agentboard/workflow.yaml`.
 *
 * - Source: first `.yaml` file found in `~/.agentboard/workflows/`
 * - Destination: `<cwd>/.agentboard/workflow.yaml` (singular, verbatim copy)
 * - Error + non-zero exit when no global workflows directory or directory is empty
 * - Refuse (non-zero exit) when destination already exists
 */
function copyWorkflowTemplate(cwd: string, home: string): void {
  const globalWorkflowsDir = join(home, ".agentboard", "workflows");

  if (!existsSync(globalWorkflowsDir)) {
    printLine(
      `error: no global workflows directory found at ${globalWorkflowsDir}\n` +
      `       run with a populated ~/.agentboard/workflows/ directory first.`,
    );
    process.exit(1);
  }

  const yamlFiles = readdirSync(globalWorkflowsDir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();

  if (yamlFiles.length === 0) {
    printLine(
      `error: ~/.agentboard/workflows/ exists but contains no .yaml files.\n` +
      `       add at least one workflow template and retry.`,
    );
    process.exit(1);
  }

  const src = join(globalWorkflowsDir, yamlFiles[0]!);
  const dest = join(cwd, ".agentboard", "workflow.yaml");

  if (existsSync(dest)) {
    printLine(
      `info: ${dest} already exists — refusing to overwrite.\n` +
      `      delete it manually if you want to re-initialise from the global template.`,
    );
    process.exit(1);
  }

  mkdirSync(join(cwd, ".agentboard"), { recursive: true });
  copyFileSync(src, dest);
  printLine(`✓ copied ${yamlFiles[0]} → .agentboard/workflow.yaml`);
}

/**
 * `agentboard init` subcommand: bootstraps the repo's `.agentboard/` directory
 * and copies a workflow template from `~/.agentboard/workflows/` into
 * `<cwd>/.agentboard/workflow.yaml`.
 *
 * Prerequisite: run `agentboard` at least once (or `seedUserWorkflows` manually)
 * so that `~/.agentboard/workflows/` is populated. If the global dir is missing
 * or empty, this command exits non-zero with an informative message.
 */
export function runInit(cwd: string, home: string = homedir()): void {
  initDb(cwd);
  copyWorkflowTemplate(cwd, home);
  printLine(`✓ wrote .agentboard/db.sqlite    empty schema`);
}
