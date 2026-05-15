import { z } from "zod";
import { installTool } from "./install.js";
import { EVENT_TYPES, type EventType } from "../../events/types.js";
import { ValidationError } from "../../server/errors.js";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServices } from "./types.js";

// wait_for_event does NOT piggyback — it IS the event delivery path.
// On timeout the waiter resolves to null; we return { event: null }.
export function installWaitForEventTool(
  activeTools: ReadonlyMap<string, RegisteredTool>,
  services: McpServices,
): void {
  installTool(activeTools, "agentboard.wait_for_event", {
    description: "Long-polls for a matching event. Returns immediately if pending events exist, otherwise holds until an event arrives or the timeout expires. Returns { event: null } on timeout.",
    paramsSchema: {
      timeout_ms: z.number().int().min(1).describe("Maximum ms to wait. Recommended: 30000–1800000."),
      task_id: z.string().optional().describe("Filter to events for a specific task."),
      types: z.array(z.enum(EVENT_TYPES)).optional().describe("Filter to specific event types."),
    },
    callback: async (args, extra) => {
      const { db, waiters } = services;
      // REQ-M-02: STDIO transport does not synthesize extra.sessionId; fall back to mintedSessionId
      const sessionId = extra.sessionId ?? services.mintedSessionId;
      if (!sessionId) throw new ValidationError("session_id is required for wait_for_event — call agentboard.activate() first");

      const event = await waiters.register(db, sessionId, {
        timeoutMs: args.timeout_ms,
        taskId: args.task_id,
        types: args.types as EventType[] | undefined,
      });

      const result = { event };
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  });
}
