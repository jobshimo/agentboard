import type Database from "better-sqlite3";

export function getTableNames(db: InstanceType<typeof Database>): string[] {
  const rows = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
    )
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

export function getIndexNames(db: InstanceType<typeof Database>): string[] {
  const rows = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'`
    )
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}
