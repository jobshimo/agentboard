import { z } from "zod";
import { installTool } from "./install.js";
import { withPiggyback } from "../piggyback.js";
import { searchFeedback } from "../../feedback/search.js";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServices } from "./types.js";

export function installFeedbackSearchTool(
  activeTools: ReadonlyMap<string, RegisteredTool>,
  services: McpServices,
): void {
  installTool(activeTools, "feedback.search", {
    description: "Searches prior feedback relevant to the given context. Returns ranked results by relevance score.",
    paramsSchema: {
      context: z
        .object({
          task_id: z.string().optional(),
          workflow_id: z.string().optional(),
          task_type: z.string().optional(),
          terms: z.array(z.string()).optional(),
          file_paths: z.array(z.string()).optional(),
          include_same_task: z.boolean().optional(),
        })
        .describe("Search context for relevance scoring"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max results to return (default 5, max 50)"),
    },
    callback: async (args, extra) => {
      const { db } = services;
      const entries = searchFeedback(db, args.context, args.limit);
      const response = await withPiggyback(db, extra.sessionId, { entries });
      return { content: [{ type: "text" as const, text: JSON.stringify(response) }] };
    },
  });
}
