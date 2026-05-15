import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import type { BroadcastManager } from "./broadcaster.js";

export function registerWsRoute(app: FastifyInstance, broadcaster: BroadcastManager): void {
  app.get("/ws", { websocket: true }, (socket: WebSocket) => {
    broadcaster.attachClient(socket);

    socket.on("close", () => {
      broadcaster.detachClient(socket);
    });

    socket.on("error", () => {
      broadcaster.detachClient(socket);
    });
  });
}
