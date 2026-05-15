import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServices } from "./types.js";
import { installTaskListTool } from "./task.list.js";
import { installTaskGetTool } from "./task.get.js";
import { installTaskStartTool } from "./task.start.js";
import { installTaskCompleteTool } from "./task.complete.js";
import { installTaskCommentTool } from "./task.comment.js";
import { installTaskAddCustomSubtaskTool } from "./task.add_custom_subtask.js";
import { installSubtaskUpdateTool } from "./subtask.update.js";
import { installFeedbackAddTool } from "./feedback.add.js";
import { installFeedbackSearchTool } from "./feedback.search.js";
import { installExternalFetchTool } from "./external.fetch.js";
import { installPollEventsTool } from "./agentboard.poll_events.js";
import { installWaitForEventTool } from "./agentboard.wait_for_event.js";
import { installNotifyHumanTool } from "./agentboard.notify_human.js";
import { installDeactivateTool } from "./agentboard.deactivate.js";

// Installs real schemas + handlers into the 14 pre-registered stubs.
// Adding a new tool = add a file + one line here. Never edit a switch (OCP).
export function installTools(
  activeTools: ReadonlyMap<string, RegisteredTool>,
  services: McpServices,
): void {
  installTaskListTool(activeTools, services);
  installTaskGetTool(activeTools, services);
  installTaskStartTool(activeTools, services);
  installTaskCompleteTool(activeTools, services);
  installTaskCommentTool(activeTools, services);
  installTaskAddCustomSubtaskTool(activeTools, services);
  installSubtaskUpdateTool(activeTools, services);
  installFeedbackAddTool(activeTools, services);
  installFeedbackSearchTool(activeTools, services);
  installExternalFetchTool(activeTools, services);
  installPollEventsTool(activeTools, services);
  installWaitForEventTool(activeTools, services);
  installNotifyHumanTool(activeTools, services);
  installDeactivateTool(activeTools, services);
}
