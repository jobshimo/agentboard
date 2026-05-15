/**
 * S5 tests: POST /internal/notify + notifyDaemon
 * REQ-M-04, REQ-R-04, REQ-D-05, REQ-D-07 (daemon down)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildApp } from "../server/app.js";
import { getDbForRepo, closeAllDbs } from "../db/connection.js";
import { insertEvent } from "../events/insert.js";

// Workflow mocks
vi.mock("../workflows/discovery.js", () => ({
  resolveWorkflowPaths: () => [],
}));
vi.mock("../workflows/load.js", () => ({
  loadWorkflowFile: () => ({}),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "agb-notify-test-"));
  getDbForRepo(dir);
  closeAllDbs();
  return dir;
}

function cleanupDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// POST /internal/notify — loopback guard
// ---------------------------------------------------------------------------

describe("POST /internal/notify", () => {
  let repoDir: string;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    repoDir = makeTempRepo();
    app = buildApp({});
  });

  afterEach(async () => {
    await app.close();
    closeAllDbs();
    cleanupDir(repoDir);
  });

  it("returns 403 when called from a non-loopback IP", async () => {
    // Fastify inject simulates requests with req.ip = "127.0.0.1" by default,
    // but we can force a different remoteAddress
    const res = await app.inject({
      method: "POST",
      url: "/internal/notify",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "1.2.3.4",
      },
      // Override the remote address
      remoteAddress: "1.2.3.4",
      body: JSON.stringify({ repo: repoDir, event_id: 1 }),
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 403 when secret env is set but header is missing", async () => {
    process.env["AGENTBOARD_NOTIFY_SECRET"] = "test-secret";
    try {
      const res = await app.inject({
        method: "POST",
        url: "/internal/notify",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repo: repoDir, event_id: 1 }),
      });
      expect(res.statusCode).toBe(403);
    } finally {
      delete process.env["AGENTBOARD_NOTIFY_SECRET"];
    }
  });

  it("returns 204 on valid loopback call with an existing event", async () => {
    // Pre-populate the DB with a task + event
    const db = getDbForRepo(repoDir);
    db.prepare(
      `INSERT INTO tasks (id, type, title, workflow_id, workflow_snapshot, derived_status)
       VALUES ('T-notify-1', 'local', 'Test Task', 'wf', '{}', 'backlog')`,
    ).run();
    const eventId = insertEvent(db, {
      taskId: "T-notify-1",
      type: "comment_added",
      payload: { body: "hello" },
      origin: "human",
    });

    closeAllDbs(); // app will reopen on request

    const res = await app.inject({
      method: "POST",
      url: "/internal/notify",
      headers: { "content-type": "application/json" },
      // Default inject remoteAddress is 127.0.0.1
      body: JSON.stringify({ repo: repoDir, event_id: eventId }),
    });
    expect(res.statusCode).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// notifyDaemon — swallows errors
// ---------------------------------------------------------------------------

describe("notifyDaemon", () => {
  it("does not throw when daemon is unreachable", async () => {
    const { notifyDaemon, _resetNotifyState } = await import("../mcp/notify-daemon.js");
    _resetNotifyState(); // reset log-once flag

    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    // notifyDaemon returns void synchronously — it fire-and-forgets
    expect(() => notifyDaemon("/some/repo", 42, { _fetch: mockFetch })).not.toThrow();
    // Allow the microtask/promise rejection to settle
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    // mockFetch was called once
    expect(mockFetch).toHaveBeenCalledOnce();
  });
});
