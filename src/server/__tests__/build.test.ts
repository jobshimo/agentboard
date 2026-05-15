import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildApp } from "../app.js";
import { getDbForRepo, closeAllDbs } from "../../db/connection.js";

function makeTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "agb-build-test-"));
  getDbForRepo(dir);
  closeAllDbs();
  return dir;
}

describe("buildApp", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = makeTempRepo();
  });

  afterEach(() => {
    closeAllDbs();
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("instantiates without throwing", async () => {
    const app = buildApp({});
    expect(app).toBeDefined();
    await app.close();
  });

  it("returns 200 on GET /api/health", async () => {
    const app = buildApp({});
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ ok: boolean }>();
    expect(body.ok).toBe(true);
    await app.close();
  });

  it("returns 404 for unknown routes (with valid ?repo= to bypass hook)", async () => {
    const app = buildApp({});
    const res = await app.inject({
      method: "GET",
      url: `/api/unknown-route?repo=${encodeURIComponent(repoDir)}`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
