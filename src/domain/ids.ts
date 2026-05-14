import type Database from "better-sqlite3";

type Db = InstanceType<typeof Database>;

function parseNum(id: string | null): number {
  if (!id) return 0;
  const match = id.match(/-(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

// Caller must insert the row before calling again — two concurrent callers could receive the same id (acceptable for single-writer SQLite).
export function nextTaskId(db: Db): string {
  const row = db
    .prepare("SELECT id FROM tasks ORDER BY CAST(SUBSTR(id, 3) AS INTEGER) DESC LIMIT 1")
    .get() as { id: string } | undefined;

  const next = parseNum(row?.id ?? null) + 1;
  return `T-${next}`;
}

export function nextSubtaskId(db: Db): string {
  const row = db
    .prepare("SELECT id FROM subtasks ORDER BY CAST(SUBSTR(id, 3) AS INTEGER) DESC LIMIT 1")
    .get() as { id: string } | undefined;

  const next = parseNum(row?.id ?? null) + 1;
  return `s-${next}`;
}
