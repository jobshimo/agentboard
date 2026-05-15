/**
 * agentboard mcp — STDIO MCP entry point (per agent session).
 *
 * - Resolves repo from AGENTBOARD_REPO env > --repo flag > exit 1
 * - Mints a UUID session ID
 * - Opens per-repo SQLite (via getDbForRepo)
 * - Connects StdioServerTransport — no Fastify, no WebSocket, no static files
 * - Inserts session row BEFORE mcpServer.connect
 * - Hooks notifyDaemon (added in S5) for inter-process WS push
 *
 * REQ-L-03, REQ-M-01, REQ-M-02, REQ-M-03
 */
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getDbForRepo, normalizeRepoPath, closeAllDbs } from "../db/connection.js";
import { ActivationState, buildMcpServer } from "../mcp/activation.js";
import { WaiterRegistry } from "../events/wait.js";
import { BroadcastManager } from "../server/broadcaster.js";
import { notifyDaemon } from "../mcp/notify-daemon.js";
import { loadConfig } from "../config/load.js";
import { probeAndMaybeSpawnDaemon } from "../mcp/auto-spawn.js";
import type { McpServices } from "../mcp/tools/types.js";
import type { EventListener } from "../events/insert.js";

export interface McpOpts {
  /** Explicit repo path from --repo flag. */
  repo: string | null;
  /** Path to the agentboard home directory (~/.agentboard by default). */
  agbHome: string;
}

// mcp.json snippet shown when repo is not configured
const MCP_JSON_SNIPPET = `
agentboard mcp requires a repo to be configured.

Add this to your mcp.json (Claude Code) or equivalent MCP config:

{
  "mcpServers": {
    "agentboard": {
      "command": "npx",
      "args": ["@jobshimo/agentboard", "mcp"],
      "env": {
        "AGENTBOARD_REPO": "\${workspaceFolder}"
      }
    }
  }
}

Or pass --repo explicitly:
  agentboard mcp --repo /path/to/your/project
`;

export async function runMcp(opts: McpOpts): Promise<void> {
  // REQ-M-03: repo resolution order: AGENTBOARD_REPO env > --repo flag > exit 1
  const repoRaw = process.env["AGENTBOARD_REPO"] ?? opts.repo ?? null;
  const config = loadConfig(opts.agbHome);

  if (!repoRaw) {
    process.stderr.write(MCP_JSON_SNIPPET);
    process.exit(1);
  }

  if (!isAbsolute(repoRaw)) {
    process.stderr.write(`agentboard mcp: repo path must be absolute, got: ${repoRaw}\n`);
    process.exit(1);
  }

  if (!existsSync(join(repoRaw, ".agentboard", "db.sqlite"))) {
    process.stderr.write(
      `agentboard mcp: repo not initialized at ${repoRaw}\n` +
      `  run: agentboard init  (in the project directory)\n`,
    );
    process.exit(1);
  }

  const repoRoot = normalizeRepoPath(repoRaw);

  // REQ-S-01: open per-repo DB
  const db = getDbForRepo(repoRoot);

  // REQ-M-02: mint a stable session ID for this STDIO process lifetime
  const sessionId = randomUUID();

  // always-on activation: tools are enabled from startup, no agentboard.activate round-trip needed
  const activationState = new ActivationState("always-on");

  const broadcaster = new BroadcastManager();
  const waiters = new WaiterRegistry();

  // REQ-M-04: inter-process notify hook — fire-and-forget after each insertEvent
  // The listener receives (event, repoRoot) per S5 signature change.
  const notifyHook: EventListener = (_event, eventRepoRoot) => {
    // Use the MCP process's repoRoot when eventRepoRoot is empty (MCP tools
    // don't pass repoRoot to insertEvent yet).
    notifyDaemon(eventRepoRoot || repoRoot, _event.id);
  };

  const services: McpServices = {
    db,
    waiters,
    broadcaster,
    activation: activationState,
    eventHooks: { listeners: [broadcaster.listener, waiters.listener, notifyHook] },
    mintedSessionId: sessionId,
    agentSeesHumanEvents: config.attention.agentSeesHumanEvents,
  };

  const { mcpServer } = buildMcpServer(activationState, db, services);

  // REQ-M-02: INSERT session row BEFORE connect so the session exists when
  // tools call poll_events/wait_for_event.
  activationState.activate(db, sessionId);

  // Auto-spawn HTTP daemon for realtime WS push (fire-and-forget, non-blocking).
  // If the daemon is already running or a foreign process holds the port, this is a no-op.
  const daemonPort = parseInt(process.env["AGENTBOARD_PORT"] ?? "7733", 10);
  probeAndMaybeSpawnDaemon({ port: daemonPort, agbHome: opts.agbHome }).catch(() => {
    // Ignore — realtime push is best-effort
  });

  // REQ-M-01: STDIO transport — no TCP binding
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  // Block until stdin closes (agent disconnects)
  await new Promise<void>((resolve) => {
    process.stdin.once("end", resolve);
    process.stdin.once("close", resolve);
  });

  closeAllDbs();
  process.exit(0);
}
