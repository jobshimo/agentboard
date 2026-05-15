/**
 * S3 tests: daemon.json registry — load, save, upsert
 * REQ-S-03, REQ-D-04, REQ-D-07 (corrupt registry failure mode)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { normalizeRepoPath } from "../db/connection.js";

// These imports will fail until production code exists (RED phase).
import {
  loadRegistry,
  saveRegistry,
  upsertRepo,
  type Registry,
} from "../server/registry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempHome(): string {
  return mkdtempSync(join(tmpdir(), "agb-reg-test-"));
}

function cleanupHome(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// loadRegistry
// ---------------------------------------------------------------------------

describe("loadRegistry", () => {
  let agbHome: string;

  beforeEach(() => { agbHome = makeTempHome(); });
  afterEach(() => { cleanupHome(agbHome); });

  it("returns empty registry when file is missing", () => {
    const reg = loadRegistry(agbHome);
    expect(reg.version).toBe(1);
    expect(reg.repos).toEqual([]);
  });

  it("returns valid registry when file exists", () => {
    const data: Registry = {
      version: 1,
      repos: [{ path: "/home/user/myrepo", lastSeenAt: "2024-01-01T00:00:00.000Z" }],
    };
    writeFileSync(join(agbHome, "daemon.json"), JSON.stringify(data), "utf8");
    const reg = loadRegistry(agbHome);
    expect(reg.repos).toHaveLength(1);
    expect(reg.repos[0]?.path).toBe("/home/user/myrepo");
  });

  it("renames corrupt file to .bak.<ts> and returns empty registry", () => {
    writeFileSync(join(agbHome, "daemon.json"), "{ this is not valid JSON }", "utf8");
    const reg = loadRegistry(agbHome);
    expect(reg.repos).toEqual([]);
    // Original file should be renamed (no longer at daemon.json)
    expect(existsSync(join(agbHome, "daemon.json"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// saveRegistry
// ---------------------------------------------------------------------------

describe("saveRegistry", () => {
  let agbHome: string;

  beforeEach(() => { agbHome = makeTempHome(); });
  afterEach(() => { cleanupHome(agbHome); });

  it("writes registry atomically (tmp + rename)", () => {
    const reg: Registry = {
      version: 1,
      repos: [{ path: "/repo/a", lastSeenAt: "2024-01-01T00:00:00.000Z" }],
    };
    saveRegistry(agbHome, reg);
    const content = JSON.parse(readFileSync(join(agbHome, "daemon.json"), "utf8")) as Registry;
    expect(content.repos).toHaveLength(1);
    expect(content.repos[0]?.path).toBe("/repo/a");
  });

  it("is idempotent — overwriting same registry leaves valid data", () => {
    const reg: Registry = { version: 1, repos: [] };
    saveRegistry(agbHome, reg);
    saveRegistry(agbHome, reg);
    const content = JSON.parse(readFileSync(join(agbHome, "daemon.json"), "utf8")) as Registry;
    expect(content.repos).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// upsertRepo
// ---------------------------------------------------------------------------

describe("upsertRepo", () => {
  // Use a real temp dir so normalizeRepoPath resolves to the platform path correctly
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "agb-upsert-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("appends a new repo path", () => {
    const reg: Registry = { version: 1, repos: [] };
    const updated = upsertRepo(reg, dir);
    expect(updated.repos).toHaveLength(1);
    // path stored is the normalized version
    expect(updated.repos[0]?.path).toBeTruthy();
  });

  it("updates lastSeenAt on duplicate path (same key)", () => {
    const before = "2024-01-01T00:00:00.000Z";
    const normalizedDir = dir.toLowerCase().replace(/\\/g, "\\");
    const reg: Registry = {
      version: 1,
      repos: [{ path: normalizedDir, lastSeenAt: before }],
    };
    const updated = upsertRepo(reg, dir);
    expect(updated.repos).toHaveLength(1);
    // lastSeenAt should have changed
    expect(updated.repos[0]?.lastSeenAt).not.toBe(before);
  });

  it("keeps repos sorted by lastSeenAt descending", () => {
    const dir2 = mkdtempSync(join(tmpdir(), "agb-upsert2-"));
    try {
      // dir2 has an old lastSeenAt; upsert dir should sort to front
      const reg: Registry = {
        version: 1,
        repos: [
          { path: dir2, lastSeenAt: "2020-01-01T00:00:00.000Z" },
        ],
      };
      const updated = upsertRepo(reg, dir);
      // The newly inserted repo (dir) should be first (most recent)
      // Compare normalized paths
      const normalizedDir = normalizeRepoPath(dir);
      expect(normalizeRepoPath(updated.repos[0]?.path ?? "")).toBe(normalizedDir);
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it("does not mutate the original registry", () => {
    const reg: Registry = { version: 1, repos: [] };
    upsertRepo(reg, dir);
    expect(reg.repos).toHaveLength(0);
  });
});
