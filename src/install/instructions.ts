/**
 * Instructions block installer.
 * Injects/updates/removes a versioned block into a client's global
 * instructions file (e.g. ~/.claude/CLAUDE.md).
 *
 * Block markers follow the HTML comment convention agreed with browser-link:
 *   <!-- agentboard:instructions:begin v0.1.0 -->
 *   <!-- managed-by: agentboard v0.1.0; ... -->
 *   ...content...
 *   <!-- agentboard:instructions:end -->
 */
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { backupFile, atomicWriteJson } from "./utils.js";

// Re-export for tests
export const BLOCK_VERSION = "0.1.0";
export const BLOCK_BEGIN_MARKER = `<!-- agentboard:instructions:begin v${BLOCK_VERSION} -->`;
export const BLOCK_END_MARKER = `<!-- agentboard:instructions:end -->`;

export type BlockStatus = "current" | "outdated" | "missing";

export interface InstructionsInstallResult {
  ok: boolean;
  status: "installed" | "updated" | "no-op" | "created";
  backupPath: string | null;
}

export interface InstructionsUninstallResult {
  ok: boolean;
  status: "removed" | "not-present" | "file-missing";
}

// Detect the block begin pattern regardless of version
const BEGIN_RE = /<!--\s*agentboard:instructions:begin\s+v([\d.]+)\s*-->/;
const END_RE = /<!--\s*agentboard:instructions:end\s*-->/;

/** Return the path to the template file. */
function templatePath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Resolve relative to the package root: src/install/ → ../../templates/
  return join(here, "..", "..", "templates", "agent-instructions", `agentboard-v${BLOCK_VERSION}.md`);
}

function loadTemplate(): string {
  const tplPath = templatePath();
  if (!existsSync(tplPath)) {
    throw new Error(`Instructions template not found at ${tplPath}. Run \`pnpm build\` or check the package installation.`);
  }
  return readFileSync(tplPath, "utf8").trimEnd();
}

function buildBlock(content: string): string {
  const managedLine = `<!-- managed-by: agentboard v${BLOCK_VERSION}; do not edit between markers; run \`agentboard install\` to refresh. -->`;
  return [BLOCK_BEGIN_MARKER, managedLine, content, BLOCK_END_MARKER].join("\n");
}

/** Check whether the file contains a current, outdated, or no block. */
export function detectInstructionsBlock(filePath: string): BlockStatus {
  if (!existsSync(filePath)) return "missing";

  const content = readFileSync(filePath, "utf8");
  const match = BEGIN_RE.exec(content);
  if (!match) return "missing";

  const version = match[1];
  return version === BLOCK_VERSION ? "current" : "outdated";
}

/** Atomic write of plain text (not JSON — reuse the atomic pattern). */
async function atomicWriteText(filePath: string, content: string): Promise<void> {
  const { randomBytes } = await import("node:crypto");
  const { writeFileSync, renameSync } = await import("node:fs");
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.tmp.${randomBytes(8).toString("hex")}`);
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, filePath);
}

/**
 * Install (or update) the agentboard instructions block in `filePath`.
 *
 * Logic:
 * - File missing → create it with just the block.
 * - File exists, no block → append (one blank line separator).
 * - File exists, current version → no-op.
 * - File exists, older version → splice in place.
 */
export async function installInstructionsBlock(
  filePath: string,
): Promise<InstructionsInstallResult> {
  const templateContent = loadTemplate();
  const block = buildBlock(templateContent);

  if (!existsSync(filePath)) {
    await atomicWriteText(filePath, block + "\n");
    return { ok: true, status: "created", backupPath: null };
  }

  const existing = readFileSync(filePath, "utf8");
  const beginMatch = BEGIN_RE.exec(existing);
  const endMatch = END_RE.exec(existing);

  // No block present → append.
  if (!beginMatch) {
    const bakPath = await backupFile(filePath);
    const separator = existing.endsWith("\n") ? "\n" : "\n\n";
    await atomicWriteText(filePath, existing + separator + block + "\n");
    return { ok: true, status: "installed", backupPath: bakPath };
  }

  // Current version → no-op.
  if (beginMatch[1] === BLOCK_VERSION) {
    return { ok: true, status: "no-op", backupPath: null };
  }

  // Outdated → splice.
  if (!endMatch) {
    // Malformed: begin without end — append new block anyway.
    const bakPath = await backupFile(filePath);
    const separator = existing.endsWith("\n") ? "\n" : "\n\n";
    await atomicWriteText(filePath, existing + separator + block + "\n");
    return { ok: true, status: "installed", backupPath: bakPath };
  }

  const bakPath = await backupFile(filePath);
  const before = existing.slice(0, beginMatch.index);
  const afterBlockEnd = existing.slice(endMatch.index + endMatch[0].length);
  // Preserve a newline after the end marker if present.
  const spliced = before + block + afterBlockEnd;
  await atomicWriteText(filePath, spliced);
  return { ok: true, status: "updated", backupPath: bakPath };
}

/**
 * Remove the agentboard instructions block from `filePath`.
 * Leaves the rest of the file intact.
 */
export async function uninstallInstructionsBlock(
  filePath: string,
): Promise<InstructionsUninstallResult> {
  if (!existsSync(filePath)) {
    return { ok: true, status: "file-missing" };
  }

  const existing = readFileSync(filePath, "utf8");
  const beginMatch = BEGIN_RE.exec(existing);
  const endMatch = END_RE.exec(existing);

  if (!beginMatch || !endMatch) {
    return { ok: true, status: "not-present" };
  }

  const bakPath = await backupFile(filePath);

  let before = existing.slice(0, beginMatch.index);
  let after = existing.slice(endMatch.index + endMatch[0].length);

  // Trim extra blank line left by the removal.
  before = before.replace(/\n\n$/, "\n");
  after = after.replace(/^\n/, "");

  await atomicWriteText(filePath, before + after);
  return { ok: true, status: "removed" };
}
