import { z } from "zod";
import { installTool } from "./install.js";
import { withPiggyback } from "../piggyback.js";
import { insertEvent } from "../../events/insert.js";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServices } from "./types.js";

const URGENCY_VALUES = ["info", "warning", "blocked"] as const;

// Emits an agent_notification event. The broadcaster picks it up via eventHooks and
// pushes it to connected WebSocket clients so the human sees it in the UI.
export function installNotifyHumanTool(
  activeTools: ReadonlyMap<string, RegisteredTool>,
  services: McpServices,
): void {
  installTool(activeTools, "agentboard.notify_human", {
    description: "Sends an urgent notification to the human via the UI. Use 'blocked' when you need human input to continue.",
    paramsSchema: {
      urgency: z.enum(URGENCY_VALUES).describe("Urgency level: info, warning, or blocked"),
      text: z.string().min(1).describe("Notification message (markdown supported)"),
      task_id: z.string().optional().describe("Optional task context for the notification"),
    },
    callback: async (args, extra) => {
      const { db, eventHooks } = services;

      // agent_notification events use a sentinel task_id when no task context is provided
      const taskId = args.task_id ?? "_global";

      insertEvent(db, {
        taskId,
        type: "agent_notification",
        payload: { urgency: args.urgency, text: args.text, ...(args.task_id && { task_id: args.task_id }) },
        origin: "agent",
      }, eventHooks);

      const result = await withPiggyback(db, extra.sessionId, { ok: true });
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  });
}
