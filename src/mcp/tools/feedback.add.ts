import { z } from "zod";
import { installTool } from "./install.js";
import { withPiggyback } from "../piggyback.js";
import { insertEvent } from "../../events/insert.js";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServices } from "./types.js";

// feedback.add stores feedback as a feedback_added event — no separate table (feedback.md §storage).
// The event queue is the canonical store for feedback.
const SEVERITY_VALUES = ["info", "correction", "failed_in_practice"] as const;

export function installFeedbackAddTool(
  activeTools: ReadonlyMap<string, RegisteredTool>,
  services: McpServices,
): void {
  installTool(activeTools, "feedback.add", {
    description: "Adds retrospective or in-flight feedback targeting a task or subtask id. Stored as a feedback_added event.",
    paramsSchema: {
      target: z.string().describe("Task id or subtask id this feedback targets"),
      text: z.string().min(1).describe("Free-form markdown feedback text"),
      severity: z.enum(SEVERITY_VALUES).optional().describe("Severity: info (default), correction, or failed_in_practice"),
      task_id: z.string().describe("Task id (required for event attribution)"),
    },
    callback: async (args, extra) => {
      const { db, eventHooks } = services;
      const severity = args.severity ?? "info";

      const eventId = insertEvent(db, {
        taskId: args.task_id,
        type: "feedback_added",
        payload: { target: args.target, text: args.text, severity },
        origin: "agent",
      }, eventHooks);

      const result = await withPiggyback(db, extra.sessionId, { ok: true, event_id: eventId });
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  });
}
