import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import type Database from "better-sqlite3";
import { toHttpError } from "./errors.js";
import { registerRestRoutes } from "./rest.js";
import { registerWsRoute } from "./ws.js";
import { BroadcastManager } from "./broadcaster.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

type Db = InstanceType<typeof Database>;

export interface AppOpts {
  db: Db;
  logger?: boolean | object;
}

function readVersion(): string {
  const pkgPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../package.json",
  );
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}

const startedAt = Date.now();

export function buildApp(opts: AppOpts): FastifyInstance & { broadcaster: BroadcastManager } {
  const app = Fastify({
    logger: opts.logger ?? false,
  }) as FastifyInstance & { broadcaster: BroadcastManager };

  const broadcaster = new BroadcastManager();
  app.broadcaster = broadcaster;

  app.register(fastifyWebsocket);

  app.setErrorHandler((err, _req, reply) => {
    const { statusCode, body } = toHttpError(err);
    reply.status(statusCode).send(body);
  });

  app.get("/api/health", async (_req, reply) => {
    reply.send({
      ok: true,
      version: readVersion(),
      uptime_ms: Date.now() - startedAt,
    });
  });

  registerRestRoutes(app, opts.db, { listeners: [broadcaster.listener] });
  registerWsRoute(app, broadcaster);

  return app;
}
