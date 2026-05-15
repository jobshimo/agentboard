import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  McpServer,
  type RegisteredTool,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpActivationMode } from "../config/schema.js";

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

  activate(db: Db): ActivateResult {
    const session_id = randomUUID();
    db.prepare(
      `INSERT INTO agent_sessions (id, last_event_id, connected_at, last_seen, active)
       VALUES (?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`,
    ).run(session_id);

    if (this.#mcpServer) {
      setToolsEnabled(this.#activeTools, ACTIVE_TOOL_NAMES, true);
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

export function buildMcpServer(state: ActivationState, _db: Db): McpServerBundle {
  const mcpServer = new McpServer(
    { name: "agentboard", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  mcpServer.registerTool(
    "agentboard.activate",
    {
      description:
        "Activate agentboard to access the full tool set. " +
        "Returns { session_id, tools }. Store session_id for use with " +
        "agentboard.poll_events and agentboard.wait_for_event.",
      inputSchema: undefined,
    },
    () => ({
      content: [{ type: "text" as const, text: "activate must be invoked via the HTTP transport handler." }],
    }),
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

  return { mcpServer, activeTools };
}
