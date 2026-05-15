import { z } from "zod";
import { installTool } from "./install.js";
import { withPiggyback } from "../piggyback.js";
import { ValidationError } from "../../server/errors.js";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServices } from "./types.js";

export function installDeactivateTool(
  activeTools: ReadonlyMap<string, RegisteredTool>,
  services: McpServices,
): void {
  installTool(activeTools, "agentboard.deactivate", {
    description: "Returns agentboard to dormant state, disabling all active tools. The session is marked inactive.",
    paramsSchema: {
      // No required parameters. confirm: true is accepted to match SDK's requirement
      // that registerTool stubs with paramsSchema need at least a valid shape.
      confirm: z.literal(true).optional().describe("Optional — no input required"),
    },
    callback: async (_args, extra) => {
      const { db, activation } = services;
      const sessionId = extra.sessionId;
      if (!sessionId) throw new ValidationError("session_id is required for deactivate — call agentboard.activate() first");

      // Collect any final events before marking session inactive
      const result = await withPiggyback(db, sessionId, { ok: true });
      activation.deactivate(sessionId, db);

      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  });
}
