import { z } from "zod";
import { installTool } from "./install.js";
import { withPiggyback } from "../piggyback.js";
import { getTask, getTaskSubtasks, closeTask } from "../../domain/task.js";
import { isTerminal } from "../../domain/subtask.js";
import { insertEvent } from "../../events/insert.js";
import { NotFoundError, StateError } from "../../server/errors.js";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServices } from "./types.js";

export function installTaskCompleteTool(
  activeTools: ReadonlyMap<string, RegisteredTool>,
  services: McpServices,
): void {
  installTool(activeTools, "task.complete", {
    description: "Marks a task as done by setting closed_at. All subtasks must be in a terminal state (done or skipped).",
    paramsSchema: {
      id: z.string().describe("Task id"),
    },
    callback: async (args, extra) => {
      const { db, eventHooks } = services;
      if (!getTask(db, args.id)) throw new NotFoundError("task", args.id);

      const subtasks = getTaskSubtasks(db, args.id);
      const nonTerminal = subtasks.filter((s) => !isTerminal(s.status));

      if (nonTerminal.length > 0) {
        const ids = nonTerminal.map((s) => `${s.id}(${s.status})`).join(", ");
        throw new StateError(
          `Cannot complete task: subtasks are not in a terminal state: ${ids}`,
          "Transition all subtasks to done or skipped first",
        );
      }

      closeTask(db, args.id);

      insertEvent(db, {
        taskId: args.id,
        type: "task_completed",
        payload: { task_id: args.id },
        origin: "agent",
      }, eventHooks);

      const result = await withPiggyback(db, extra.sessionId, { ok: true, task_id: args.id }, services.agentSeesHumanEvents);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  });
}
