import { z } from "zod";
import { installTool } from "./install.js";
import { compactSubtask } from "../compact.js";
import { withPiggyback } from "../piggyback.js";
import { getTask, getTaskSubtasks } from "../../domain/task.js";
import { getEntries, getAllEntries } from "../../domain/discussion.js";
import { NotFoundError } from "../../server/errors.js";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServices } from "./types.js";

export function installTaskGetTool(
  activeTools: ReadonlyMap<string, RegisteredTool>,
  services: McpServices,
): void {
  installTool(activeTools, "task.get", {
    description: "Returns task metadata + subtask states. Pass include_discussion: true to include the discussion thread.",
    paramsSchema: {
      id: z.string().describe("Task id (e.g. T-1)"),
      include_discussion: z.boolean().optional().describe("Include discussion thread. Defaults to false."),
      full_discussion: z.boolean().optional().describe("Return the full discussion thread regardless of size. Use when the summary says to retry with full_discussion: true."),
    },
    callback: async (args, extra) => {
      const { db } = services;
      const task = getTask(db, args.id);
      if (!task) throw new NotFoundError("task", args.id);
      const subtasks = getTaskSubtasks(db, args.id).map(compactSubtask);

      const response: Record<string, unknown> = {
        id: task.id,
        title: task.title,
        type: task.type,
        derived_status: task.derived_status,
        workflow_id: task.workflow_id,
        ref_source: task.ref_source,
        ref_id: task.ref_id,
        created_at: task.created_at,
        closed_at: task.closed_at,
        subtasks,
      };

      if (args.full_discussion) {
        response.discussion = getAllEntries(db, args.id);
      } else if (args.include_discussion) {
        response.discussion = getEntries(db, args.id);
      }

      const result = await withPiggyback(db, extra.sessionId, response, services.agentSeesHumanEvents);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  });
}
