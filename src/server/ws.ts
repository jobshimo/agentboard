import type { FastifyInstance } from "fastify";
import type { BroadcastManager } from "./broadcaster.js";

export function registerWsRoute(app: FastifyInstance, broadcaster: BroadcastManager): void {
  app.get("/ws", { websocket: true }, (connection) => {
    const { socket } = connection;
    broadcaster.attachClient(socket);

    socket.on("close", () => {
      broadcaster.detachClient(socket);
    });

    socket.on("error", () => {
      broadcaster.detachClient(socket);
    });
  });
}
