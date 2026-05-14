import { WorkflowFileSchema } from "./schema.js";
import type { Workflow, WorkflowSnapshot } from "../domain/workflow.js";

export class SnapshotRehydrationError extends Error {
  constructor(detail: string) {
    super(`Workflow snapshot failed rehydration: ${detail}`);
    this.name = "SnapshotRehydrationError";
  }
}

/**
 * Produces a deep-cloned, JSON-serializable snapshot of a Workflow.
 * The returned object is safe to pass to JSON.stringify() for DB storage.
 */
export function freezeWorkflow(workflow: Workflow): WorkflowSnapshot {
  return {
    id: workflow.id,
    label: workflow.label,
    steps: workflow.steps.map((s) => ({
      id: s.id,
      label: s.label,
      canAgentCompleteAlone: s.canAgentCompleteAlone,
      ...(s.blocksNext !== undefined && { blocksNext: s.blocksNext }),
      ...(s.triggeredBy !== undefined && { triggeredBy: s.triggeredBy }),
      ...(s.agentHint !== undefined && { agentHint: s.agentHint }),
    })),
    frozenAt: new Date().toISOString(),
  };
}

/**
 * Parses a JSON string back into a WorkflowSnapshot and validates
 * its core schema shape for backward integrity.
 * Throws SnapshotRehydrationError on any failure.
 */
export function rehydrateSnapshot(json: string): WorkflowSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new SnapshotRehydrationError("input is not valid JSON");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)["id"] !== "string" ||
    typeof (parsed as Record<string, unknown>)["label"] !== "string" ||
    !Array.isArray((parsed as Record<string, unknown>)["steps"]) ||
    typeof (parsed as Record<string, unknown>)["frozenAt"] !== "string"
  ) {
    throw new SnapshotRehydrationError(
      "snapshot is missing required top-level fields: id, label, steps, frozenAt"
    );
  }

  const raw = parsed as Record<string, unknown>;
  const steps = raw["steps"] as unknown[];

  const rehydratedSteps = steps.map((step, index) => {
    const result = WorkflowFileSchema.shape.steps.element.safeParse({
      id: (step as Record<string, unknown>)["id"],
      label: (step as Record<string, unknown>)["label"],
      can_agent_complete_alone:
        (step as Record<string, unknown>)["canAgentCompleteAlone"],
      blocks_next: (step as Record<string, unknown>)["blocksNext"],
      triggered_by: (step as Record<string, unknown>)["triggeredBy"],
      agent_hint: (step as Record<string, unknown>)["agentHint"],
    });

    if (!result.success) {
      throw new SnapshotRehydrationError(
        `step[${index}] failed validation: ${result.error.issues[0]?.message ?? "unknown"}`
      );
    }

    const s = result.data;
    return {
      id: s.id,
      label: s.label,
      canAgentCompleteAlone: s.can_agent_complete_alone,
      ...(s.blocks_next !== undefined && { blocksNext: s.blocks_next }),
      ...(s.triggered_by !== undefined && { triggeredBy: s.triggered_by }),
      ...(s.agent_hint !== undefined && { agentHint: s.agent_hint }),
    };
  });

  return {
    id: raw["id"] as string,
    label: raw["label"] as string,
    steps: rehydratedSteps,
    frozenAt: raw["frozenAt"] as string,
  };
}
