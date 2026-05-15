import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { runMigrations } from "../../db/migrate.js";
import { runExportSnapshot } from "../../server/export.js";
import { createLocal } from "../../domain/task.js";

// Builds an in-memory DB with schema applied.
function makeDb(): InstanceType<typeof Database> {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `agentboard-export-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

afterEach(() => {
  // Nothing to close — in-memory DBs are GC'd automatically.
});

describe("runExportSnapshot", () => {
  it("returns count=0 and creates the directory when there are no tasks", () => {
    const db = makeDb();
    const dir = makeTmpDir();
    const snapshotDir = join(dir, "snapshot");

    const result = runExportSnapshot(db, snapshotDir);

    expect(result.count).toBe(0);
    expect(existsSync(snapshotDir)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes one .md file per task", () => {
    const db = makeDb();
    const dir = makeTmpDir();
    const snapshotDir = join(dir, "snapshot");

    // createLocal needs a workflow_snapshot — pass minimal valid JSON
    const snap = JSON.stringify({ id: "coding-task", name: "Coding Task", description: "", steps: [] });
    createLocal(db, { title: "Task A", workflowId: "coding-task", workflowSnapshot: snap });
    createLocal(db, { title: "Task B", workflowId: "coding-task", workflowSnapshot: snap });

    const result = runExportSnapshot(db, snapshotDir);

    expect(result.count).toBe(2);
    const files = readdirSync(snapshotDir);
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.endsWith(".md"))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("overwrites existing snapshot files on re-export", () => {
    const db = makeDb();
    const dir = makeTmpDir();
    const snapshotDir = join(dir, "snapshot");

    const snap = JSON.stringify({ id: "coding-task", name: "Coding Task", description: "", steps: [] });
    createLocal(db, { title: "Task A", workflowId: "coding-task", workflowSnapshot: snap });

    runExportSnapshot(db, snapshotDir);
    // Second export must not throw EEXIST or double-write.
    const result = runExportSnapshot(db, snapshotDir);

    expect(result.count).toBe(1);
    expect(readdirSync(snapshotDir)).toHaveLength(1);
    rmSync(dir, { recursive: true, force: true });
  });
});
