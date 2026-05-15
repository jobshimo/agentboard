import { z } from "zod";
import { installTool } from "./install.js";
import { withPiggyback } from "../piggyback.js";
import { getTaskExternalRef } from "../../domain/task.js";
import { NotFoundError } from "../../server/errors.js";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServices } from "./types.js";

// Returns the cached external ref metadata stored in the task row.
// The server never fetches externally — agents use gh/jira/linear CLIs for live data.
// This tool returns the snapshot captured at task-creation time (ref_source, ref_id, ref_url, ref_title, ref_status, ref_assignee).
export function installExternalFetchTool(
  activeTools: ReadonlyMap<string, RegisteredTool>,
  services: McpServices,
): void {
  installTool(activeTools, "external.fetch", {
    description: "Returns the cached external reference metadata (ref_source, ref_id, ref_url, etc.) for a task. The server never live-fetches — use gh/jira/linear CLIs for current data.",
    paramsSchema: {
      ref: z.string().describe("Task id whose external ref metadata you want"),
    },
    callback: async (args, extra) => {
      const { db } = services;
      const externalRef = getTaskExternalRef(db, args.ref as string);
      if (!externalRef) throw new NotFoundError("task", args.ref as string);
      const result = await withPiggyback(db, extra.sessionId, { ref: externalRef });
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  });
}
