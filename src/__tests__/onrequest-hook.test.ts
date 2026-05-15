/**
 * S1 tests: onRequest hook — ?repo= validation
 * REQ-S-02, REQ-R-01 (HTTP 400 side)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildApp } from "../server/app.js";
import { getDbForRepo, closeAllDbs } from "../db/connection.js";

// ---------------------------------------------------------------------------
// Workflow mocks — same pattern as rest.test.ts
// ---------------------------------------------------------------------------

vi.mock("../workflows/discovery.js", () => ({
  resolveWorkflowPaths: () => ["/stub/coding-task.yaml"],
}));

vi.mock("../workflows/load.js", () => ({
  loadWorkflowFile: () => ({
    id: "coding-task",
    label: "Coding Task",
    steps: [
      { id: "implement", label: "Implement", canAgentCompleteAlone: true },
      { id: "tests", label: "Tests", canAgentCompleteAlone: true },
    ],
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "agb-hook-test-"));
  // Initialize db.sqlite so the hook's existence check passes
  getDbForRepo(dir);
  closeAllDbs();
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
// Tests
// ---------------------------------------------------------------------------

describe("onRequest hook — ?repo= validation", () => {
  let repoDir: string;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    repoDir = makeTempRepo();
    app = buildApp({});
  });

  afterEach(async () => {
    await app.close();
    closeAllDbs();
    cleanupTempRepo(repoDir);
  });

  it("GET /api/tasks without ?repo= returns 400 repo_missing", async () => {
    const res = await app.inject({ method: "GET", url: "/api/tasks" });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: string }>();
    expect(body.error).toBe("repo_missing");
  });

  it("GET /api/tasks?repo=<relative-path> returns 400 repo_invalid", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/tasks?repo=relative/path",
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: string }>();
    expect(body.error).toBe("repo_invalid");
  });

  it("GET /api/tasks?repo=<nonexistent-abs-path> returns 400 repo_invalid", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/tasks?repo=${encodeURIComponent("/nonexistent/path/that/does/not/exist")}`,
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: string }>();
    expect(body.error).toBe("repo_invalid");
  });

  it("GET /api/health bypasses the hook and returns 200", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ ok: boolean }>();
    expect(body.ok).toBe(true);
  });

  it("GET /api/tasks?repo=<valid-repo> succeeds with 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/tasks?repo=${encodeURIComponent(repoDir)}`,
    });
    expect(res.statusCode).toBe(200);
  });
});
