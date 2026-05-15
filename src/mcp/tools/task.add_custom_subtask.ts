import { z } from "zod";
import { installTool } from "./install.js";
import { compactSubtask } from "../compact.js";
import { withPiggyback } from "../piggyback.js";
import { getTask } from "../../domain/task.js";
import { addCustomSubtask } from "../../domain/subtask.js";
import { insertEvent } from "../../events/insert.js";
import { NotFoundError } from "../../server/errors.js";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServices } from "./types.js";

export function installTaskAddCustomSubtaskTool(
  activeTools: ReadonlyMap<string, RegisteredTool>,
  services: McpServices,
): void {
  installTool(activeTools, "task.add_custom_subtask", {
    description: "Adds a custom (ad-hoc) subtask to a task. The subtask starts as pending and is marked custom: true.",
    paramsSchema: {
      task_id: z.string().describe("Task id"),
      label: z.string().min(1).describe("Human-readable label for the subtask"),
      type: z.string().optional().describe("Optional subtask type (defaults to 'custom')"),
    },
    callback: async (args, extra) => {
      const { db, eventHooks } = services;
      if (!getTask(db, args.task_id)) throw new NotFoundError("task", args.task_id);

      const subtask = addCustomSubtask(db, args.task_id, { label: args.label, type: args.type });

      insertEvent(db, {
        taskId: args.task_id,
        type: "custom_subtask_added",
        payload: { task_id: args.task_id, subtask_id: subtask.id, label: args.label, type: subtask.type },
        origin: "agent",
      }, eventHooks);

      const result = await withPiggyback(db, extra.sessionId, { subtask: compactSubtask(subtask) });
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  });
}
