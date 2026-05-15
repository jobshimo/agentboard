import { mkdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "./migrate.js";

type Db = InstanceType<typeof Database>;

/**
 * Per-repo DB cache. Key is the normalized repo path (see normalizeRepoPath).
 * Never cleared in v1 (no TTL). closeAllDbs() is called on process shutdown.
 */
const dbCache = new Map<string, Db>();

/**
 * Normalize a repo root path to a stable cache key:
 *   - path.resolve() → absolute
 *   - strip trailing separator
 *   - toLowerCase() on win32 (case-insensitive FS)
 *
 * REQ-S-01, REQ-D-06
 */
export function normalizeRepoPath(p: string): string {
  let normalized = resolve(p);
  // Strip trailing separator (e.g. /repo/ → /repo)
  if (normalized.length > 1 && normalized.endsWith(sep)) {
    normalized = normalized.slice(0, -1);
  }
  if (process.platform === "win32") {
    normalized = normalized.toLowerCase();
  }
  return normalized;
}

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
 * Return the cached Database for the given repo root, or create one on cache miss.
 * The key is the normalized path (see normalizeRepoPath).
 *
 * REQ-S-01
 */
export function getDbForRepo(repoRoot: string): Db {
  const key = normalizeRepoPath(repoRoot);
  const cached = dbCache.get(key);
  if (cached) return cached;

  const dir = join(key, ".agentboard");
  mkdirSync(dir, { recursive: true });

  const dbPath = join(dir, "db.sqlite");
  const db = new Database(dbPath);

  applyPragmas(db);
  runMigrations(db);

  // TODO: co-cache trigger materializer per repo alongside DB (v1 deferred,
  // currently materializer is created per-request in buildApp; tracked in design §2 open Q1).
  dbCache.set(key, db);
  return db;
}

/**
 * Close all cached Database instances and clear the cache.
 * Called on graceful shutdown (SIGINT, SIGTERM).
 *
 * REQ-S-05
 */
export function closeAllDbs(): void {
  for (const db of dbCache.values()) {
    try {
      db.close();
    } catch {
      // Ignore errors on close (e.g. already closed)
    }
  }
  dbCache.clear();
}

/**
 * @deprecated Use closeAllDbs() — kept as a shim for callers that used closeDb().
 */
export function closeDb(): void {
  closeAllDbs();
}

/**
 * @deprecated Use getDbForRepo(cwd) — kept for callers that pass an explicit cwd.
 * Will be removed once all call sites are migrated.
 */
export function getDb(cwd: string = process.cwd()): Db {
  return getDbForRepo(cwd);
}
