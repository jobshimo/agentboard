import { z } from "zod";
import { installTool } from "./install.js";
import { compactTask } from "../compact.js";
import { listTasks } from "../../domain/task.js";
import { withPiggyback } from "../piggyback.js";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServices } from "./types.js";

export function installTaskListTool(
  activeTools: ReadonlyMap<string, RegisteredTool>,
  services: McpServices,
): void {
  installTool(activeTools, "task.list", {
    description: "Returns a compact list of all tasks. Use task.get(id) for full details.",
    paramsSchema: {
      filter: z.enum(["backlog", "active", "blocked", "done"]).optional()
        .describe("Optional status filter. Omit to return all tasks."),
    },
    callback: async (args, extra) => {
      const { db } = services;
      const tasks = listTasks(db, args.filter).map(compactTask);
      const result = await withPiggyback(db, extra.sessionId, { tasks });
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  });
}
