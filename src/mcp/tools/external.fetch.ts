import { z } from "zod";
import { installTool } from "./install.js";
import { withPiggyback } from "../piggyback.js";
import { getTaskByRef } from "../../domain/task.js";
import { NotFoundError, ValidationError } from "../../server/errors.js";
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
    description: "Returns the cached external reference metadata for a task. Pass ref as '<source>:<identifier>' (e.g. 'github:org/repo#42', 'jira:XYZ-123'). The server never live-fetches — use gh/jira/linear CLIs for current data.",
    paramsSchema: {
      ref: z.string().describe("Reference string in '<source>:<identifier>' format, e.g. 'github:org/repo#42'"),
    },
    callback: async (args, extra) => {
      const { db } = services;
      const colonIndex = (args.ref as string).indexOf(":");
      if (colonIndex <= 0) {
        throw new ValidationError(
          `Invalid ref format: "${args.ref as string}"`,
          "Expected '<source>:<identifier>', e.g. 'github:org/repo#42'",
        );
      }
      const source = (args.ref as string).slice(0, colonIndex);
      const identifier = (args.ref as string).slice(colonIndex + 1);
      const externalRef = getTaskByRef(db, source, identifier);
      if (!externalRef) throw new NotFoundError("task", args.ref as string);
      const result = await withPiggyback(db, extra.sessionId, { ref: externalRef });
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  });
}
