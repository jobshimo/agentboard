import fs from "node:fs";
import yaml from "js-yaml";
import { ZodError } from "zod";
import { WorkflowFileSchema } from "./schema.js";
import type { WorkflowFileRaw } from "./schema.js";
import { assertStepIdsUnique } from "../domain/workflow.js";
import type { Workflow, WorkflowStep } from "../domain/workflow.js";

export class WorkflowFileNotFoundError extends Error {
  constructor(filePath: string) {
    super(`Workflow file not found: ${filePath}`);
    this.name = "WorkflowFileNotFoundError";
  }
}

export class WorkflowParseError extends Error {
  constructor(filePath: string, cause: unknown) {
    super(`Failed to parse YAML in "${filePath}": ${String(cause)}`);
    this.name = "WorkflowParseError";
  }
}

export class WorkflowValidationError extends Error {
  constructor(filePath: string, zodError: ZodError) {
    const issues = zodError.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    super(`Workflow file "${filePath}" failed validation:\n${issues}`);
    this.name = "WorkflowValidationError";
  }
}

function rawToWorkflow(raw: WorkflowFileRaw): Workflow {
  const steps: WorkflowStep[] = raw.steps.map((s) => ({
    id: s.id,
    label: s.label,
    canAgentCompleteAlone: s.can_agent_complete_alone,
    ...(s.blocks_next !== undefined && { blocksNext: s.blocks_next }),
    ...(s.triggered_by !== undefined && { triggeredBy: s.triggered_by }),
    ...(s.agent_hint !== undefined && { agentHint: s.agent_hint }),
  }));

  return { id: raw.id, label: raw.label, steps };
}

/**
 * Reads a single YAML file, validates it, and returns a domain Workflow.
 * Throws WorkflowFileNotFoundError, WorkflowParseError, WorkflowValidationError,
 * or DuplicateStepIdError — all typed, all with human-readable messages.
 */
export function loadWorkflowFile(filePath: string): Workflow {
  if (!fs.existsSync(filePath)) {
    throw new WorkflowFileNotFoundError(filePath);
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    throw new WorkflowParseError(filePath, err);
  }

  const result = WorkflowFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new WorkflowValidationError(filePath, result.error);
  }

  const workflow = rawToWorkflow(result.data);
  assertStepIdsUnique(workflow);
  return workflow;
}
