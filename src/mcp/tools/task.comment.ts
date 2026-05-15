import { z } from "zod";
import { installTool } from "./install.js";
import { withPiggyback } from "../piggyback.js";
import { getTask } from "../../domain/task.js";
import { appendEntry } from "../../domain/discussion.js";
import { insertEvent } from "../../events/insert.js";
import { NotFoundError } from "../../server/errors.js";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServices } from "./types.js";

export function installTaskCommentTool(
  activeTools: ReadonlyMap<string, RegisteredTool>,
  services: McpServices,
): void {
  installTool(activeTools, "task.comment", {
    description: "Appends a comment to the task's discussion thread with author 'agent'.",
    paramsSchema: {
      id: z.string().describe("Task id"),
      text: z.string().min(1).describe("Comment text (markdown supported)"),
    },
    callback: async (args, extra) => {
      const { db, eventHooks } = services;
      if (!getTask(db, args.id)) throw new NotFoundError("task", args.id);

      appendEntry(db, args.id, "agent", args.text);

      insertEvent(db, {
        taskId: args.id,
        type: "comment_added",
        payload: { task_id: args.id, author: "agent", text: args.text },
        origin: "agent",
      }, eventHooks);

      const result = await withPiggyback(db, extra.sessionId, { ok: true, task_id: args.id });
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  });
}
