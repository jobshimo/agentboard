import { z } from "zod";
import { installTool } from "./install.js";
import { withPiggyback } from "../piggyback.js";
import { getTask, getTaskSubtasks } from "../../domain/task.js";
import { applyStatusTransition, validTransitions, canStartSubtask } from "../../domain/subtask.js";
import { insertEvent } from "../../events/insert.js";
import { NotFoundError, StateError } from "../../server/errors.js";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServices } from "./types.js";

export function installTaskStartTool(
  activeTools: ReadonlyMap<string, RegisteredTool>,
  services: McpServices,
): void {
  installTool(activeTools, "task.start", {
    description: "Moves the first pending subtask to in-progress. Emits a status_change event.",
    paramsSchema: {
      id: z.string().describe("Task id"),
    },
    callback: async (args, extra) => {
      const { db, eventHooks } = services;
      if (!getTask(db, args.id)) throw new NotFoundError("task", args.id);

      const subtasks = getTaskSubtasks(db, args.id);
      const pending = subtasks.find((s) => s.status === "pending");

      if (!pending) {
        // No pending subtask — all are in-progress, done, or terminal
        throw new StateError("No pending subtasks to start on this task");
      }

      const allowed = validTransitions[pending.status];
      if (!allowed.includes("in-progress")) {
        throw new StateError(`Cannot transition subtask ${pending.id} to in-progress`);
      }

      if (!canStartSubtask(db, args.id, pending.id)) {
        throw new StateError(
          `Subtask ${pending.id} is blocked by a preceding step with blocks_next: true`,
          "Complete or skip the blocking step before starting this one",
        );
      }

      const { updatedRow: updated, events } = applyStatusTransition(
        db,
        pending.id,
        pending.status,
        "in-progress",
      );

      for (const ev of events) {
        insertEvent(db, { taskId: args.id, type: ev.type, payload: ev.payload, origin: "agent" }, eventHooks);
      }

      // REQ-M-02: STDIO transport does not synthesize extra.sessionId; fall back to mintedSessionId
      const result = await withPiggyback(db, extra.sessionId ?? services.mintedSessionId, {
        started_subtask: updated.id,
        task_id: args.id,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  });
}
