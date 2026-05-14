/**
 * src/domain/ids.ts
 *
 * T-NN task id generator and s-NN subtask id generator.
 * IDs are scoped to the current DB maximum so they never collide
 * with existing rows even after deletions.
 *
 * Format:
 *   tasks    → "T-1", "T-2", ...
 *   subtasks → "s-1", "s-2", ...
 *
 * The caller is responsible for inserting the row with the returned id
 * before calling again (otherwise two concurrent callers could receive
 * the same id — acceptable for our single-writer SQLite model).
 */

import type Database from "better-sqlite3";

type Db = InstanceType<typeof Database>;

/**
 * Extracts the numeric suffix from an id like "T-42" or "s-7".
 * Returns 0 if the id is null/undefined (empty table case).
 */
function parseNum(id: string | null): number {
  if (!id) return 0;
  const match = id.match(/-(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Returns the next available task id in "T-NN" format.
 * Reads the current MAX id from the tasks table.
 */
export function nextTaskId(db: Db): string {
  const row = db
    .prepare("SELECT id FROM tasks ORDER BY CAST(SUBSTR(id, 3) AS INTEGER) DESC LIMIT 1")
    .get() as { id: string } | undefined;

  const next = parseNum(row?.id ?? null) + 1;
  return `T-${next}`;
}

/**
 * Returns the next available subtask id in "s-NN" format.
 * Reads the current MAX id from the subtasks table.
 */
export function nextSubtaskId(db: Db): string {
  const row = db
    .prepare("SELECT id FROM subtasks ORDER BY CAST(SUBSTR(id, 3) AS INTEGER) DESC LIMIT 1")
    .get() as { id: string } | undefined;

  const next = parseNum(row?.id ?? null) + 1;
  return `s-${next}`;
}
