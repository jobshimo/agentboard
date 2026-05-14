import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "./migrate.js";

type Db = InstanceType<typeof Database>;

let _db: Db | null = null;

/**
 * WAL pragmas applied on every open:
 *   - journal_mode=WAL   → concurrent readers + one writer without blocking
 *   - synchronous=NORMAL → safe (WAL-mode checkpoint handles flush); faster than FULL
 *   - foreign_keys=ON    → enforce referential integrity at the SQLite layer
 */
function applyPragmas(db: Db): void {
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
}

// Pass an explicit cwd in tests to keep databases isolated from each other.
export function getDb(cwd: string = process.cwd()): Db {
  if (_db) return _db;

  const dir = join(cwd, ".agentboard");
  mkdirSync(dir, { recursive: true });

  const dbPath = join(dir, "db.sqlite");
  const db = new Database(dbPath);

  applyPragmas(db);
  runMigrations(db);

  _db = db;
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
