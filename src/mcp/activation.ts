import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  McpServer,
  type RegisteredTool,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpActivationMode } from "../config/schema.js";
import { installTools } from "./tools/index.js";
import type { McpServices } from "./tools/types.js";

type Db = InstanceType<typeof Database>;

export interface ActivateResult {
  session_id: string;
  tools: string[];
}

export const ACTIVE_TOOL_NAMES = [
  "task.list",
  "task.get",
  "task.start",
  "task.complete",
  "task.comment",
  "task.add_custom_subtask",
  "subtask.update",
  "feedback.add",
  "feedback.search",
  "external.fetch",
  "agentboard.poll_events",
  "agentboard.wait_for_event",
  "agentboard.notify_human",
  "agentboard.deactivate",
] as const;

function setToolsEnabled(
  tools: ReadonlyMap<string, RegisteredTool>,
  names: readonly string[],
  enabled: boolean,
): void {
  for (const name of names) {
    const tool = tools.get(name);
    if (!tool) continue;
    if (enabled) tool.enable();
    else tool.disable();
  }
}

export class ActivationState {
  #mcpServer: McpServer | null = null;
  #activeTools: ReadonlyMap<string, RegisteredTool> = new Map();
  readonly mode: McpActivationMode;

  constructor(mode: McpActivationMode) {
    this.mode = mode;
  }

  attachServer(server: McpServer, activeTools: ReadonlyMap<string, RegisteredTool>): void {
    this.#mcpServer = server;
    this.#activeTools = activeTools;
  }

  /**
   * Insert a new agent session and enable the active tool set.
   *
   * @param presetSessionId - Optional: use this ID instead of minting a new UUID.
   *   Used by `agentboard mcp` STDIO sessions where the session ID is minted at
   *   startup via randomUUID() and must be stable across tool calls.
   *   REQ-M-02
   */
  activate(db: Db, presetSessionId?: string): ActivateResult {
    const session_id = presetSessionId ?? randomUUID();
    db.prepare(
      `INSERT INTO agent_sessions (id, last_event_id, connected_at, last_seen, active)
       VALUES (?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`,
    ).run(session_id);

    if (this.#mcpServer) {
      setToolsEnabled(this.#activeTools, ACTIVE_TOOL_NAMES, true);
      // NOTE (open Q3): for STDIO + always-on mode, sendToolListChanged() is mooted
      // because tools are enabled before connect(). The SDK silently ignores this
      // call on STDIO transport. Kept here so the HTTP path continues to work.
      this.#mcpServer.sendToolListChanged();
    }

    return { session_id, tools: ACTIVE_TOOL_NAMES.slice() };
  }

  deactivate(sessionId: string, db: Db): void {
    db.prepare("UPDATE agent_sessions SET active = 0 WHERE id = ?").run(sessionId);

    if (this.#mcpServer) {
      setToolsEnabled(this.#activeTools, ACTIVE_TOOL_NAMES, false);
      this.#mcpServer.sendToolListChanged();
    }
  }
}

export interface McpServerBundle {
  mcpServer: McpServer;
  activeTools: ReadonlyMap<string, RegisteredTool>;
}

export function buildMcpServer(state: ActivationState, db: Db, services?: McpServices): McpServerBundle {
  const mcpServer = new McpServer(
    { name: "agentboard", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  // agentboard.activate is always-on — it inserts a session row and enables the active tools.
  // The real handler is wired here directly since this tool lives outside the 14-stub set.
  mcpServer.registerTool(
    "agentboard.activate",
    {
      description:
        "Activate agentboard to access the full tool set. " +
        "Returns { session_id, tools }. Store session_id for use with " +
        "agentboard.poll_events and agentboard.wait_for_event.",
      inputSchema: undefined,
    },
    () => {
      const result = state.activate(db);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    },
  );

  const activeTools = new Map<string, RegisteredTool>();
  for (const name of ACTIVE_TOOL_NAMES) {
    const tool = mcpServer.registerTool(
      String(name),
      { description: `${name} — requires agentboard.activate() first.` },
      () => ({
        content: [{ type: "text" as const, text: "Call agentboard.activate() first." }],
      }),
    );
    activeTools.set(name, tool);
  }

  state.attachServer(mcpServer, activeTools);

  if (state.mode === "lazy" || state.mode === "prompt") {
    setToolsEnabled(activeTools, ACTIVE_TOOL_NAMES, false);
  }

  // Install real handlers if services were provided (i.e. not in test-only mode)
  if (services) {
    installTools(activeTools, services);
  }

  return { mcpServer, activeTools };
}
