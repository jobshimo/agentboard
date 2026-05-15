import { z } from "zod";
import { installTool } from "./install.js";
import { compactTask } from "../compact.js";
import { listTasks } from "../../domain/task.js";
import { withPiggyback } from "../piggyback.js";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServices } from "./types.js";
import type { SubtaskStatus } from "../../domain/subtask.js";

const TERMINAL: Set<SubtaskStatus> = new Set(["done", "skipped"]);

export function installTaskListTool(
  activeTools: ReadonlyMap<string, RegisteredTool>,
  services: McpServices,
): void {
  installTool(activeTools, "task.list", {
    description: "Returns a compact list of all tasks including the active subtask brief. Use task.get(id) for full details.",
    paramsSchema: {
      filter: z.enum(["backlog", "active", "blocked", "done"]).optional()
        .describe("Optional status filter. Omit to return all tasks."),
    },
    callback: async (args, extra) => {
      const { db } = services;
      const rows = listTasks(db, args.filter);
      const tasks = rows.map((row) => {
        const active = (
          db
            .prepare(
              "SELECT label, status FROM subtasks WHERE task_id = ? ORDER BY position ASC",
            )
            .all(row.id) as { label: string | null; status: SubtaskStatus }[]
        ).find((s) => !TERMINAL.has(s.status));
        return compactTask(row, active ? { label: active.label, status: active.status } : null);
      });
      const result = await withPiggyback(db, extra.sessionId, { tasks });
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  });
}
