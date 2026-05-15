import { z } from "zod";
import { installTool } from "./install.js";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServices } from "./types.js";

export function installFeedbackSearchTool(
  activeTools: ReadonlyMap<string, RegisteredTool>,
  _services: McpServices,
): void {
  installTool(activeTools, "feedback.search", {
    description: "Searches prior feedback relevant to the given context. Returns ranked results.",
    paramsSchema: {
      context: z.object({
        task_id: z.string().optional(),
        workflow_id: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }).describe("Search context: task_id, workflow_id, and/or limit"),
    },
    callback: async (_args, _extra) => {
      // S8 will implement the relevance heuristic using src/feedback/search.ts (score.ts + searchFeedback).
      const result = { entries: [] as unknown[] };
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  });
}
