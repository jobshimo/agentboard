import { z } from "zod";
import { installTool } from "./install.js";
import { withPiggyback } from "../piggyback.js";
import { addFeedback } from "../../feedback/add.js";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServices } from "./types.js";

export function installFeedbackAddTool(
  activeTools: ReadonlyMap<string, RegisteredTool>,
  services: McpServices,
): void {
  installTool(activeTools, "feedback.add", {
    description: "Adds retrospective or in-flight feedback targeting a task or subtask id. Stored as a feedback_added event.",
    paramsSchema: {
      target: z.string().describe("Task id or subtask id this feedback targets"),
      text: z.string().min(1).describe("Free-form markdown feedback text"),
      severity: z
        .enum(["info", "correction", "failed_in_practice"])
        .optional()
        .describe("Severity: info (default), correction, or failed_in_practice"),
      task_id: z.string().describe("Task id (required for event attribution)"),
    },
    callback: async (args, extra) => {
      const { db, eventHooks } = services;
      const result = addFeedback(db, {
        target: args.target,
        taskId: args.task_id,
        text: args.text,
        severity: args.severity,
        origin: "agent",
        hooks: eventHooks,
      });
      const response = await withPiggyback(db, extra.sessionId, result as unknown as Record<string, unknown>, services.agentSeesHumanEvents);
      return { content: [{ type: "text" as const, text: JSON.stringify(response) }] };
    },
  });
}
