/**
 * src/db/connection.ts
 *
 * Opens the better-sqlite3 database at `<cwd>/.agentboard/db.sqlite`,
 * enables WAL mode and recommended pragmas, and applies all pending
 * migrations before returning.
 *
 * Exports a `getDb()` singleton so every module in the process shares
 * the same connection (required for WAL's single-writer guarantee).
 */

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

/**
 * Returns the shared database singleton.
 *
 * On first call:
 *   1. Creates `.agentboard/` directory if needed.
 *   2. Opens (or creates) `.agentboard/db.sqlite`.
 *   3. Applies WAL pragmas.
 *   4. Runs any pending migrations.
 *
 * On subsequent calls: returns the already-open instance.
 *
 * @param cwd  Working directory for the repo (defaults to process.cwd()).
 *             Pass an explicit path in tests to keep databases isolated.
 */
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

/**
 * Closes the singleton and resets it.
 * Intended for use in tests and in graceful-shutdown handlers.
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
