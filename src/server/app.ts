import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import type Database from "better-sqlite3";
import { toHttpError } from "./errors.js";
import { registerRestRoutes } from "./rest.js";
import { registerWsRoute } from "./ws.js";
import { BroadcastManager } from "./broadcaster.js";
import { WaiterRegistry } from "../events/wait.js";
import { ActivationState, buildMcpServer } from "../mcp/activation.js";
import { registerMcpTransport } from "../mcp/transport.js";
import { CONFIG_DEFAULTS } from "../config/defaults.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

type Db = InstanceType<typeof Database>;

export interface AppOpts {
  db: Db;
  logger?: boolean | object;
  mcpActivationMode?: "lazy" | "always-on" | "prompt";
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

export function buildApp(opts: AppOpts): FastifyInstance & { broadcaster: BroadcastManager; waiters: WaiterRegistry; mcpActivation: ActivationState } {
  const app = Fastify({
    logger: opts.logger ?? false,
  }) as FastifyInstance & { broadcaster: BroadcastManager; waiters: WaiterRegistry; mcpActivation: ActivationState };

  const broadcaster = new BroadcastManager();
  const waiters = new WaiterRegistry();
  app.broadcaster = broadcaster;
  app.waiters = waiters;
  // MCP activation state exposed for S7b tool handlers that call activate/deactivate
  const activationMode = opts.mcpActivationMode ?? CONFIG_DEFAULTS.mcp.activation;
  const activationState = new ActivationState(activationMode);
  app.mcpActivation = activationState;

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

  registerRestRoutes(app, opts.db, { listeners: [broadcaster.listener, waiters.listener] });
  registerWsRoute(app, broadcaster);

  // MCP transport: wire the activation state machine + install real tool handlers, then mount on /mcp
  const mcpServices = {
    db: opts.db,
    waiters,
    broadcaster,
    activation: activationState,
    eventHooks: { listeners: [broadcaster.listener, waiters.listener] },
  };
  const { mcpServer } = buildMcpServer(activationState, opts.db, mcpServices);
  registerMcpTransport(app, mcpServer);

  return app;
}
