import { z } from "zod";
import { installTool } from "./install.js";
import { compactSubtask, deltaUpdate } from "../compact.js";
import { withPiggyback } from "../piggyback.js";
import {
  SUBTASK_STATUSES,
  getSubtask,
  applySubtaskUpdate,
  applyStatusTransition,
  validTransitions,
  canStartSubtask,
} from "../../domain/subtask.js";
import { insertEvent } from "../../events/insert.js";
import { NotFoundError, StateError } from "../../server/errors.js";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServices } from "./types.js";

export function installSubtaskUpdateTool(
  activeTools: ReadonlyMap<string, RegisteredTool>,
  services: McpServices,
): void {
  installTool(activeTools, "subtask.update", {
    description: "Delta update: changes only the provided fields (status and/or note). Does NOT replace the full subtask.",
    paramsSchema: {
      id: z.string().describe("Subtask id"),
      status: z.enum(SUBTASK_STATUSES).optional().describe("New status. Must be a valid transition from the current status."),
      note: z.string().optional().describe("Optional note or artifact link to attach"),
    },
    callback: async (args, extra) => {
      const { db, eventHooks } = services;

      const current = getSubtask(db, args.id);
      if (!current) throw new NotFoundError("subtask", args.id);

      if (args.status !== undefined) {
        const allowed = validTransitions[current.status] ?? [];
        if (!allowed.includes(args.status)) {
          throw new StateError(
            `Cannot transition subtask ${args.id} from "${current.status}" to "${args.status}"`,
            `Valid transitions: ${allowed.join(", ") || "none (terminal state)"}`,
          );
        }
        if (args.status === "in-progress" && !canStartSubtask(db, current.task_id, args.id)) {
          throw new StateError(
            `Subtask ${args.id} is blocked by a preceding step with blocks_next: true`,
            "Complete or skip the blocking step before starting this one",
          );
        }
      }

      const prevCompact = compactSubtask(current);
      let updated;
      if (args.status !== undefined) {
        const transition = applyStatusTransition(db, args.id, current.status, args.status, args.note);
        updated = transition.updatedRow;
        for (const ev of transition.events) {
          insertEvent(db, { taskId: current.task_id, type: ev.type, payload: ev.payload, origin: "agent" }, eventHooks);
        }
      } else {
        updated = applySubtaskUpdate(db, args.id, { note: args.note });
        insertEvent(db, {
          taskId: current.task_id,
          type: "subtask_updated",
          payload: { task_id: current.task_id, subtask_id: args.id, field: "note", value: args.note },
          origin: "agent",
        }, eventHooks);
      }
      const nextCompact = compactSubtask(updated);
      const delta = deltaUpdate(prevCompact, nextCompact);

      const result = await withPiggyback(db, extra.sessionId, { delta }, services.agentSeesHumanEvents);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  });
}
