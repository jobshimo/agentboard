/**
 * Shared utilities for install adapters.
 * - backupFile: copy file to <file>.bak.<ISO-timestamp> before writing
 * - atomicWriteJson: write-to-tmp then rename (atomic), mkdir -p parent
 * - readJsonFile: parse JSON or return null / throw on malformed
 */
import {
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Copy `filePath` to `<filePath>.bak.<ISO-timestamp>` (colons replaced with dashes
 * so the path is valid on Windows). Returns the backup path, or null if the
 * source file did not exist (no backup needed).
 */
export async function backupFile(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) return null;

  const timestamp = new Date().toISOString().replace(/:/g, "-");
  const bakPath = `${filePath}.bak.${timestamp}`;
  copyFileSync(filePath, bakPath);
  return bakPath;
}

/**
 * Write `data` as pretty-printed JSON to `filePath`.
 * - Creates parent directories with mkdir -p.
 * - Writes to a `.tmp.<random>` sibling first, then renames atomically.
 * - Trailing newline included (matches `JSON.stringify + "\n"` convention).
 */
export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });

  const tmp = join(dir, `.tmp.${randomBytes(8).toString("hex")}`);
  const content = JSON.stringify(data, null, 2) + "\n";

  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, filePath);
}

/**
 * Read and parse a JSON file. Returns null if the file does not exist.
 * Throws a descriptive error on parse failure.
 */
export function readJsonFile(filePath: string): unknown {
  if (!existsSync(filePath)) return null;

  const raw = readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      `Could not parse JSON at ${filePath}. Fix the file or delete it and re-run.`,
    );
  }
}
