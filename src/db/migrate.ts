import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

// __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = join(__dirname, "migrations");

interface MigrationFile {
  version: number;
  path: string;
}

function discoverMigrations(): MigrationFile[] {
  const entries = readdirSync(MIGRATIONS_DIR);
  const migrations: MigrationFile[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".sql")) continue;
    const match = entry.match(/^(\d{4})/);
    if (!match) continue;
    const version = parseInt(match[1], 10);
    migrations.push({ version, path: join(MIGRATIONS_DIR, entry) });
  }

  return migrations.sort((a, b) => a.version - b.version);
}

// Safe to call before the full schema is applied — only touches the bookkeeping table.
function ensureMigrationsTable(db: InstanceType<typeof Database>): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function appliedVersions(db: InstanceType<typeof Database>): Set<number> {
  const rows = db
    .prepare("SELECT version FROM schema_migrations")
    .all() as { version: number }[];
  return new Set(rows.map((r) => r.version));
}

export function runMigrations(db: InstanceType<typeof Database>): void {
  ensureMigrationsTable(db);

  const applied = appliedVersions(db);
  const pending = discoverMigrations().filter((m) => !applied.has(m.version));

  for (const migration of pending) {
    const sql = readFileSync(migration.path, "utf-8");

    // Apply the SQL and record the version in one atomic transaction.
    // Using db.transaction so that a crash mid-migration leaves the DB clean.
    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare(
        "INSERT INTO schema_migrations (version) VALUES (?)"
      ).run(migration.version);
    });

    apply();
  }
}
