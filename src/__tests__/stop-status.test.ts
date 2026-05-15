/**
 * S2 RED tests: /api/health with pid+port, runStatus exit non-zero when no daemon
 * REQ-D-01, REQ-D-02, REQ-L-04, REQ-L-05
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildApp } from "../server/app.js";
import { getDbForRepo, closeAllDbs } from "../db/connection.js";

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
  const dir = mkdtempSync(join(tmpdir(), "agb-ss-test-"));
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
// /api/health includes pid and port after S2
// ---------------------------------------------------------------------------

describe("/api/health extended response", () => {
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

  it("returns pid field in health response", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ ok: boolean; pid?: number; port?: number | null }>();
    expect(body.ok).toBe(true);
    // pid must always be present
    expect(typeof body.pid).toBe("number");
    // port may be null when not listening (inject mode); just verify field exists
    expect("port" in body).toBe(true);
  });

  it("returns port as a number when server is listening", async () => {
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    const port = addr !== null && typeof addr === "object" ? addr.port : null;
    expect(port).not.toBeNull();

    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ ok: boolean; pid: number; port: number }>();
    expect(body.pid).toBe(process.pid);
    expect(body.port).toBe(port);
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// runStatus exits non-zero when no daemon
// ---------------------------------------------------------------------------

describe("runStatus — daemon not running", () => {
  it("calls process.exit(1) when health fetch fails", async () => {
    const mockExit = vi.spyOn(process, "exit").mockImplementation((_code) => {
      throw new Error("process.exit called");
    });

    // Import runStatus — will fail until src/cli/status.ts exists
    const { runStatus } = await import("../cli/status.js");

    const agbHome = mkdtempSync(join(tmpdir(), "agb-status-test-"));
    try {
      await expect(
        runStatus({ agbHome, _fetch: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) })
      ).rejects.toThrow("process.exit called");
      expect(mockExit).toHaveBeenCalledWith(1);
    } finally {
      mockExit.mockRestore();
      cleanupDir(agbHome);
    }
  });
});
