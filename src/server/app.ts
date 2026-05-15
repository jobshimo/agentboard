/// <reference path="./fastify-augment.d.ts" />
import Fastify from "fastify";
import type { FastifyInstance, FastifyPluginCallback } from "fastify";
import { isAbsolute, join } from "node:path";
import { existsSync } from "node:fs";
import { toHttpError } from "./errors.js";
import { registerRestRoutes } from "./rest.js";
import { registerWsRoute } from "./ws.js";
import { BroadcastManager } from "./broadcaster.js";
import { WaiterRegistry } from "../events/wait.js";
import { ActivationState } from "../mcp/activation.js";
import { getDbForRepo, normalizeRepoPath } from "../db/connection.js";
import { CONFIG_DEFAULTS } from "../config/defaults.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import { getWebBundlePath, hasWebBundle } from "./web-bundle.js";

// @fastify/websocket and @fastify/static use module.exports = fp(plugin) but
// also assign module.exports.default = rawPlugin, which makes Node's ESM
// default import resolve to the unwrapped raw function. createRequire returns
// the real module.exports so the fastify-plugin metadata stays intact.
const requireCjs = createRequire(import.meta.url);
const fastifyWebsocket = requireCjs("@fastify/websocket") as FastifyPluginCallback;
const fastifyStatic = requireCjs("@fastify/static") as FastifyPluginCallback;

// ---------------------------------------------------------------------------
// Exempt paths — the onRequest hook does NOT require ?repo= for these.
// REQ-S-02 (skip list), REQ-R-05 (/api/daemon/repos), REQ-D-05 (/internal/notify)
// ---------------------------------------------------------------------------
const HOOK_EXEMPT_PREFIXES = [
  "/api/health",
  "/api/daemon/repos",
  "/internal/notify",
  "/ws",
];

function isHookExempt(url: string): boolean {
  // Strip query string for matching
  const path = url.split("?")[0] ?? url;
  if (path === "/" || path.startsWith("/assets/") || path.startsWith("/icons/")) return true;
  for (const prefix of HOOK_EXEMPT_PREFIXES) {
    if (path === prefix || path.startsWith(prefix + "/")) return true;
  }
  return false;
}

export interface AppOpts {
  /**
   * Path to the agentboard home directory (e.g. ~/.agentboard).
   * Used by the registry upsert hook added in S3.
   * Optional for backward compatibility; S1 wires it as a no-op.
   */
  agbHome?: string;
  logger?: boolean | object;
  /**
   * The port the server is listening on.
   * When provided, included in /api/health for daemon identity (REQ-D-01).
   */
  port?: number;
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
  // MCP activation state exposed for tool handlers that call activate/deactivate.
  // mcpActivationMode has been removed from AppOpts — daemon always uses the config default.
  const activationState = new ActivationState(CONFIG_DEFAULTS.mcp.activation);
  app.mcpActivation = activationState;

  app.register(fastifyWebsocket);

  app.setErrorHandler((err, _req, reply) => {
    const { statusCode, body } = toHttpError(err);
    reply.status(statusCode).send(body);
  });

  // ---------------------------------------------------------------------------
  // onRequest hook: inject req.db + req.repoRoot from ?repo= query param.
  // Skipped for exempt paths (health, notify, ws, static).
  // REQ-S-02, REQ-R-01
  // ---------------------------------------------------------------------------
  app.decorateRequest("db", null);
  app.decorateRequest("repoRoot", "");

  app.addHook("onRequest", async (req, reply) => {
    if (isHookExempt(req.url)) return;

    const repoParam = (req.query as Record<string, string | undefined>)["repo"];
    if (!repoParam) {
      return reply.status(400).send({
        error: "repo_missing",
        hint: "add ?repo=<abs-path> to your request",
      });
    }

    // Must be absolute and must have .agentboard/db.sqlite
    if (!isAbsolute(repoParam) || !existsSync(join(repoParam, ".agentboard", "db.sqlite"))) {
      return reply.status(400).send({
        error: "repo_invalid",
        hint: "path must be absolute and initialized (run: agentboard init)",
      });
    }

    const normalizedRepo = normalizeRepoPath(repoParam);
    req.db = getDbForRepo(normalizedRepo);
    req.repoRoot = normalizedRepo;
  });

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  // REQ-D-01: identity fields pid + port so agentboard stop/status can confirm
  // this is OUR daemon and not a foreign process that happened to bind the port.
  // Port is read from the Fastify server's listening address at request time so it
  // is accurate even when resolvedPort is determined after buildApp() returns.
  app.get("/api/health", async (_req, reply) => {
    const addr = app.server.address();
    const listeningPort = addr !== null && typeof addr === "object" ? addr.port : (opts.port ?? null);
    reply.send({
      ok: true,
      version: readVersion(),
      uptime_ms: Date.now() - startedAt,
      pid: process.pid,
      port: listeningPort,
    });
  });

  // registerRestRoutes reads req.db from the decorated request (no db param).
  // sharedListeners are created per-request via the hook — for the broadcaster
  // and waiters we register them as module-level singletons here.
  registerRestRoutes(app, broadcaster, waiters);

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

  // NOTE: MCP transport (registerMcpTransport / buildMcpServer) has been
  // removed from the daemon. MCP now runs as a separate STDIO process
  // via `agentboard mcp`. See src/cli/mcp.ts (added in S4).

  return app;
}
