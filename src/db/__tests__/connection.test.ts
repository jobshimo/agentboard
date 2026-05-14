import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDb, closeDb } from "../connection.js";

describe("getDb", () => {
  let tempDir: string;

  afterEach(() => {
    closeDb();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("creates .agentboard/db.sqlite and applies migrations", () => {
    tempDir = mkdtempSync(join(tmpdir(), "agentboard-test-"));
    const db = getDb(tempDir);

    // Migrations applied: all tables exist
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
      )
      .all() as { name: string }[];
    const names = tables.map((r) => r.name);

    expect(names).toContain("tasks");
    expect(names).toContain("events");
    expect(names).toContain("schema_migrations");
  });

  it("returns the same instance on repeated calls", () => {
    tempDir = mkdtempSync(join(tmpdir(), "agentboard-test-"));
    const a = getDb(tempDir);
    const b = getDb(tempDir);
    expect(a).toBe(b);
  });

  it("enables WAL mode", () => {
    tempDir = mkdtempSync(join(tmpdir(), "agentboard-test-"));
    const db = getDb(tempDir);
    const result = db.pragma("journal_mode", { simple: true });
    expect(result).toBe("wal");
  });

  it("enables foreign key enforcement", () => {
    tempDir = mkdtempSync(join(tmpdir(), "agentboard-test-"));
    const db = getDb(tempDir);
    const result = db.pragma("foreign_keys", { simple: true });
    expect(result).toBe(1);
  });
});
