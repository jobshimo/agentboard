import Fastify from "fastify";
import type { FastifyInstance, FastifyPluginCallback } from "fastify";
import type Database from "better-sqlite3";
import { toHttpError } from "./errors.js";
import { registerRestRoutes } from "./rest.js";
import { registerWsRoute } from "./ws.js";
import { BroadcastManager } from "./broadcaster.js";
import { WaiterRegistry } from "../events/wait.js";
import { ActivationState, buildMcpServer } from "../mcp/activation.js";
import { registerMcpTransport } from "../mcp/transport.js";
import { createTriggerMaterializer } from "../events/triggered-materializer.js";
import { CONFIG_DEFAULTS } from "../config/defaults.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { getWebBundlePath, hasWebBundle } from "./web-bundle.js";

// @fastify/websocket and @fastify/static use module.exports = fp(plugin) but
// also assign module.exports.default = rawPlugin, which makes Node's ESM
// default import resolve to the unwrapped raw function. createRequire returns
// the real module.exports so the fastify-plugin metadata stays intact.
const requireCjs = createRequire(import.meta.url);
const fastifyWebsocket = requireCjs("@fastify/websocket") as FastifyPluginCallback;
const fastifyStatic = requireCjs("@fastify/static") as FastifyPluginCallback;

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

  const triggerMaterializer = createTriggerMaterializer(opts.db);
  const sharedListeners = [broadcaster.listener, waiters.listener, triggerMaterializer] as const;

  registerRestRoutes(app, opts.db, { listeners: sharedListeners });

  // The WS route MUST be registered inside a queued plugin so it runs AFTER
  // @fastify/websocket. The plugin's onRoute hook only fires for routes
  // registered after it loads — registering /ws at the parent scope (sync)
  // means the hook never sees it and `{ websocket: true }` is ignored.
  app.register(async (instance) => {
    registerWsRoute(instance, broadcaster);
  });

  // Production: serve the built SPA at /. In dev (no dist/web/) this is a no-op
  // so vite dev:web stays the SPA host and the proxy hits the API/WS on this port.
  if (hasWebBundle()) {
    app.register(fastifyStatic, {
      root: getWebBundlePath(),
      prefix: "/",
    });
  }

  // MCP transport: wire the activation state machine + install real tool handlers, then mount on /mcp
  const mcpServices = {
    db: opts.db,
    waiters,
    broadcaster,
    activation: activationState,
    eventHooks: { listeners: sharedListeners },
  };
  const { mcpServer } = buildMcpServer(activationState, opts.db, mcpServices);
  registerMcpTransport(app, mcpServer);

  return app;
}
