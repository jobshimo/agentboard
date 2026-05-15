import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { request } from "node:http";
import { buildApp } from "../app.js";
import { getDbForRepo, closeAllDbs } from "../../db/connection.js";

function makeTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "agb-wsup-test-"));
  getDbForRepo(dir);
  closeAllDbs();
  return dir;
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
  let repoDir: string;
  let port: number;
  let appInstance: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    repoDir = makeTempRepo();
    appInstance = buildApp({});
    await appInstance.listen({ port: 0, host: "127.0.0.1" });
    const addr = appInstance.server.address();
    if (!addr || typeof addr === "string") throw new Error("no listening address");
    port = addr.port;
  });

  afterEach(async () => {
    await appInstance.close();
    closeAllDbs();
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("returns 101 Switching Protocols on /ws", async () => {
    // /ws is exempt from the onRequest hook (WS upgrade path)
    const res = await upgrade(port, "/ws");
    expect(res.statusCode).toBe(101);
    expect(res.upgradeHeader?.toLowerCase()).toBe("websocket");
  });
});
