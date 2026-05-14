export type WorkflowStepType =
  | "pr_comment"
  | "ci_failed"
  | "ci_passed"
  | "feedback_received"
  | "manual";

export interface WorkflowStep {
  readonly id: string;
  readonly label: string;
  readonly canAgentCompleteAlone: boolean;
  readonly blocksNext?: boolean;
  readonly triggeredBy?: WorkflowStepType;
  readonly agentHint?: string;
}

export interface Workflow {
  readonly id: string;
  readonly label: string;
  readonly steps: readonly WorkflowStep[];
}

/**
 * JSON-serializable shape frozen at task-start time.
 * Round-trips cleanly through JSON.parse(JSON.stringify(s)).
 */
export interface WorkflowSnapshot {
  readonly id: string;
  readonly label: string;
  readonly steps: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly canAgentCompleteAlone: boolean;
    readonly blocksNext?: boolean;
    readonly triggeredBy?: string;
    readonly agentHint?: string;
  }>;
  readonly frozenAt: string;
}

export class DuplicateStepIdError extends Error {
  constructor(workflowId: string, stepId: string) {
    super(
      `Workflow "${workflowId}" has duplicate step id "${stepId}". Step ids must be unique within a workflow.`
    );
    this.name = "DuplicateStepIdError";
  }
}

export function assertStepIdsUnique(workflow: Workflow): void {
  const seen = new Set<string>();
  for (const step of workflow.steps) {
    if (seen.has(step.id)) {
      throw new DuplicateStepIdError(workflow.id, step.id);
    }
    seen.add(step.id);
  }
}
