/**
 * S1 RED tests: per-repo DB cache
 * REQ-S-01, REQ-D-06 (Win32 path normalization)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// These imports will fail until production code exists (RED phase).
import {
  normalizeRepoPath,
  getDbForRepo,
  closeAllDbs,
} from "../db/connection.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "agb-test-"));
  mkdirSync(join(dir, ".agentboard"), { recursive: true });
  return dir;
}

function cleanupTempRepo(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// normalizeRepoPath
// ---------------------------------------------------------------------------

describe("normalizeRepoPath", () => {
  it("returns an absolute path", () => {
    const result = normalizeRepoPath("/some/repo");
    expect(result).toMatch(/^(?:\/|[A-Za-z]:)/);
  });

  it("strips trailing path separator", () => {
    const dir = makeTempRepo();
    try {
      const withSep = dir + "/";
      const withoutSep = dir;
      expect(normalizeRepoPath(withSep)).toBe(normalizeRepoPath(withoutSep));
    } finally {
      cleanupTempRepo(dir);
    }
  });

  it("on win32: lowercases the path so mixed-case maps to the same key", () => {
    // We test the normalization logic directly: uppercased and lowercased
    // versions should produce the same result on win32, and any platform
    // should produce a consistent (idempotent) result.
    const p = "/some/Repo/Path";
    const result1 = normalizeRepoPath(p);
    const result2 = normalizeRepoPath(p.toUpperCase());
    // On non-win32 this may differ (case-sensitive FS) but the function must
    // at minimum be idempotent: calling twice with same input yields same output.
    expect(normalizeRepoPath(result1)).toBe(result1);
    if (process.platform === "win32") {
      expect(result1).toBe(result2);
    }
  });
});

// ---------------------------------------------------------------------------
// getDbForRepo
// ---------------------------------------------------------------------------

describe("getDbForRepo", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = makeTempRepo();
  });

  afterEach(() => {
    closeAllDbs();
    cleanupTempRepo(repoDir);
  });

  it("returns a Database instance for a valid repo root", () => {
    const db = getDbForRepo(repoDir);
    expect(db).toBeDefined();
    // Should be a better-sqlite3 Database (has a .prepare method)
    expect(typeof db.prepare).toBe("function");
  });

  it("returns the SAME instance for two normalized-equivalent paths", () => {
    const dir = repoDir;
    // Trailing slash variant
    const db1 = getDbForRepo(dir);
    const db2 = getDbForRepo(dir + "/");
    expect(db1).toBe(db2);
  });

  it("creates the .agentboard directory and db.sqlite on first call", () => {
    const db = getDbForRepo(repoDir);
    expect(db).toBeDefined();
    const dbPath = join(repoDir, ".agentboard", "db.sqlite");
    expect(existsSync(dbPath)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// closeAllDbs
// ---------------------------------------------------------------------------

describe("closeAllDbs", () => {
  it("closes all cached Database instances without throwing", () => {
    const dir1 = makeTempRepo();
    const dir2 = makeTempRepo();
    try {
      getDbForRepo(dir1);
      getDbForRepo(dir2);
      expect(() => closeAllDbs()).not.toThrow();
    } finally {
      cleanupTempRepo(dir1);
      cleanupTempRepo(dir2);
    }
  });

  it("after closeAllDbs, getDbForRepo opens a fresh instance", () => {
    const dir = makeTempRepo();
    try {
      const db1 = getDbForRepo(dir);
      closeAllDbs();
      const db2 = getDbForRepo(dir);
      // After close+reopen, these are different instances
      expect(db1).not.toBe(db2);
    } finally {
      closeAllDbs();
      cleanupTempRepo(dir);
    }
  });
});
