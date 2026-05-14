import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../db/migrate.js";
import { buildApp } from "../app.js";

type Db = InstanceType<typeof Database>;

function makeTestDb(): Db {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

describe("buildApp", () => {
  let db: Db;

  beforeEach(() => {
    db = makeTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("instantiates without throwing", async () => {
    const app = buildApp({ db });
    expect(app).toBeDefined();
    await app.close();
  });

  it("returns 200 on GET /api/health", async () => {
    const app = buildApp({ db });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ ok: boolean }>();
    expect(body.ok).toBe(true);
    await app.close();
  });

  it("returns 404 for unknown routes", async () => {
    const app = buildApp({ db });
    const res = await app.inject({ method: "GET", url: "/api/unknown-route" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
