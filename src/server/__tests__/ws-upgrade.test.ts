import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { request } from "node:http";
import { runMigrations } from "../../db/migrate.js";
import { buildApp } from "../app.js";

type Db = InstanceType<typeof Database>;

function makeTestDb(): Db {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

// Sends a raw HTTP/1.1 upgrade request and resolves with the response status.
// Tests the full Fastify + @fastify/websocket plumbing on a real listening port.
function upgrade(port: number, path: string): Promise<{ statusCode: number; upgradeHeader?: string }> {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      path,
      method: "GET",
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
        "Sec-WebSocket-Version": "13",
      },
    });
    req.on("upgrade", (res, socket) => {
      socket.end();
      resolve({ statusCode: res.statusCode ?? 0, upgradeHeader: res.headers.upgrade });
    });
    req.on("response", (res) => {
      resolve({ statusCode: res.statusCode ?? 0 });
    });
    req.on("error", reject);
    req.end();
  });
}

describe("WS upgrade on a listening server", () => {
  let db: Db;
  let port: number;
  let appInstance: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    db = makeTestDb();
    appInstance = buildApp({ db });
    await appInstance.listen({ port: 0, host: "127.0.0.1" });
    const addr = appInstance.server.address();
    if (!addr || typeof addr === "string") throw new Error("no listening address");
    port = addr.port;
  });

  afterEach(async () => {
    await appInstance.close();
    db.close();
  });

  it("returns 101 Switching Protocols on /ws", async () => {
    const res = await upgrade(port, "/ws");
    expect(res.statusCode).toBe(101);
    expect(res.upgradeHeader?.toLowerCase()).toBe("websocket");
  });
});
