/**
 * WebSocket route — /ws?repo=<abs-path>
 *
 * S6: validates ?repo= on connect; closes with 4400 on invalid/missing.
 * Attaches client to repo-scoped BroadcastManager set.
 *
 * REQ-R-01 (WS side), REQ-R-02, REQ-D-07
 */
import { isAbsolute, join } from "node:path";
import { existsSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import type { BroadcastManager } from "./broadcaster.js";
import { normalizeRepoPath } from "../db/connection.js";

export function registerWsRoute(app: FastifyInstance, broadcaster: BroadcastManager): void {
  app.get("/ws", { websocket: true }, (connection, req) => {
    const { socket } = connection;

    // Parse ?repo= from the upgrade URL
    const urlStr = req.url ?? "/ws";
    const params = new URLSearchParams(urlStr.includes("?") ? urlStr.slice(urlStr.indexOf("?") + 1) : "");
    const repoParam = params.get("repo") ?? "";

    // Validate: must be absolute and have .agentboard/db.sqlite
    if (!repoParam || !isAbsolute(repoParam) || !existsSync(join(repoParam, ".agentboard", "db.sqlite"))) {
      // Close 4400 = missing/invalid repo
      socket.close(4400, "repo_missing_or_invalid");
      return;
    }

    const repoRoot = normalizeRepoPath(repoParam);
    broadcaster.attachClient(socket, repoRoot);

    socket.on("close", () => {
      broadcaster.detachClient(socket, repoRoot);
    });

    socket.on("error", () => {
      broadcaster.detachClient(socket, repoRoot);
    });
  });
}
