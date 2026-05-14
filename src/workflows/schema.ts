import { z } from "zod";

const TRIGGERED_BY_VALUES = [
  "pr_comment",
  "ci_failed",
  "ci_passed",
  "feedback_received",
  "manual",
] as const;

export const WorkflowStepSchema = z.object({
  id: z.string({ required_error: "Step field 'id' is required" }).min(1, "Step 'id' must not be empty"),
  label: z.string({ required_error: "Step field 'label' is required" }).min(1, "Step 'label' must not be empty"),
  can_agent_complete_alone: z.boolean({
    required_error: "Step field 'can_agent_complete_alone' is required and must be a boolean",
    invalid_type_error: "Step field 'can_agent_complete_alone' must be a boolean",
  }),
  blocks_next: z.boolean().optional(),
  triggered_by: z
    .enum(TRIGGERED_BY_VALUES, {
      errorMap: () => ({
        message: `Step field 'triggered_by' must be one of: ${TRIGGERED_BY_VALUES.join(", ")}`,
      }),
    })
    .optional(),
  agent_hint: z.string().optional(),
}).strict();

export const WorkflowFileSchema = z.object({
  id: z.string({ required_error: "Workflow field 'id' is required" }).min(1, "Workflow 'id' must not be empty"),
  label: z.string({ required_error: "Workflow field 'label' is required" }).min(1, "Workflow 'label' must not be empty"),
  steps: z
    .array(WorkflowStepSchema, { required_error: "Workflow field 'steps' is required" })
    .min(1, "Workflow 'steps' must contain at least one step"),
}).strict();

export type WorkflowFileRaw = z.infer<typeof WorkflowFileSchema>;
export type WorkflowStepRaw = z.infer<typeof WorkflowStepSchema>;
