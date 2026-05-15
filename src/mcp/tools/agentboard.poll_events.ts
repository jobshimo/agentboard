import { z } from "zod";
import { installTool } from "./install.js";
import { pollEvents } from "../../events/poll.js";
import { ValidationError } from "../../server/errors.js";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServices } from "./types.js";

// poll_events does NOT piggyback — it IS the event delivery. The cursor advances here.
export function installPollEventsTool(
  activeTools: ReadonlyMap<string, RegisteredTool>,
  services: McpServices,
): void {
  installTool(activeTools, "agentboard.poll_events", {
    description: "Non-blocking: returns all events accumulated since your last poll (cursor). Pass task_id to filter by task.",
    paramsSchema: {
      task_id: z.string().optional().describe("Filter events to a specific task. Omit for all tasks."),
    },
    callback: async (args, extra) => {
      const { db } = services;
      const sessionId = extra.sessionId;
      if (!sessionId) throw new ValidationError("session_id is required for poll_events — call agentboard.activate() first");

      const { events, cursor } = pollEvents(db, sessionId, args.task_id);
      const result = { events, cursor };
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  });
}
