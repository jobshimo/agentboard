import { describe, it, expect } from "vitest";
import { WorkflowFileSchema, WorkflowStepSchema } from "../schema.js";

const validStep = {
  id: "implement",
  label: "Implement",
  can_agent_complete_alone: true,
};

const validWorkflow = {
  id: "coding-task",
  label: "Coding Task",
  steps: [validStep],
};

describe("WorkflowStepSchema", () => {
  it("accepts a minimal valid step", () => {
    const result = WorkflowStepSchema.safeParse(validStep);
    expect(result.success).toBe(true);
  });

  it("accepts all optional fields", () => {
    const result = WorkflowStepSchema.safeParse({
      ...validStep,
      blocks_next: true,
      triggered_by: "pr_comment",
      agent_hint: "Open a pull request",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.triggered_by).toBe("pr_comment");
      expect(result.data.agent_hint).toBe("Open a pull request");
    }
  });

  it("rejects when 'id' is missing", () => {
    const result = WorkflowStepSchema.safeParse({ label: "Implement", can_agent_complete_alone: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(" ");
      expect(messages).toMatch(/id/i);
    }
  });

  it("rejects when 'label' is missing", () => {
    const result = WorkflowStepSchema.safeParse({ id: "x", can_agent_complete_alone: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(" ");
      expect(messages).toMatch(/label/i);
    }
  });

  it("rejects when 'can_agent_complete_alone' is missing", () => {
    const result = WorkflowStepSchema.safeParse({ id: "x", label: "Y" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(" ");
      expect(messages).toMatch(/can_agent_complete_alone/i);
    }
  });

  it("rejects when 'can_agent_complete_alone' is a string, not a boolean", () => {
    const result = WorkflowStepSchema.safeParse({ id: "x", label: "Y", can_agent_complete_alone: "yes" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(" ");
      expect(messages).toMatch(/boolean/i);
    }
  });

  it("rejects an unknown 'triggered_by' value with a friendly message", () => {
    const result = WorkflowStepSchema.safeParse({
      ...validStep,
      triggered_by: "magic_trigger",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(" ");
      expect(messages).toMatch(/triggered_by/i);
      expect(messages).toMatch(/pr_comment/);
    }
  });

  it("accepts every valid triggered_by value", () => {
    const validValues = ["pr_comment", "ci_failed", "ci_passed", "feedback_received", "manual"];
    for (const v of validValues) {
      const result = WorkflowStepSchema.safeParse({ ...validStep, triggered_by: v });
      expect(result.success, `expected ${v} to be valid`).toBe(true);
    }
  });

  it("rejects unknown fields (strict mode)", () => {
    const result = WorkflowStepSchema.safeParse({ ...validStep, unknown_field: "oops" });
    expect(result.success).toBe(false);
  });
});

describe("WorkflowFileSchema", () => {
  it("accepts a minimal valid workflow", () => {
    const result = WorkflowFileSchema.safeParse(validWorkflow);
    expect(result.success).toBe(true);
  });

  it("accepts a workflow with multiple steps", () => {
    const result = WorkflowFileSchema.safeParse({
      ...validWorkflow,
      steps: [
        { id: "implement", label: "Implement", can_agent_complete_alone: true },
        { id: "tests", label: "Write Tests", can_agent_complete_alone: true },
        { id: "commit", label: "Commit", can_agent_complete_alone: true, blocks_next: false },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects when 'id' is missing", () => {
    const result = WorkflowFileSchema.safeParse({ label: "Coding Task", steps: [validStep] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(" ");
      expect(messages).toMatch(/id/i);
    }
  });

  it("rejects when 'label' is missing", () => {
    const result = WorkflowFileSchema.safeParse({ id: "coding-task", steps: [validStep] });
    expect(result.success).toBe(false);
  });

  it("rejects when 'steps' is missing", () => {
    const result = WorkflowFileSchema.safeParse({ id: "coding-task", label: "Coding Task" });
    expect(result.success).toBe(false);
  });

  it("rejects when 'steps' is empty", () => {
    const result = WorkflowFileSchema.safeParse({ id: "coding-task", label: "Coding Task", steps: [] });
    expect(result.success).toBe(false);
  });

  it("rejects unknown top-level fields (strict mode)", () => {
    const result = WorkflowFileSchema.safeParse({ ...validWorkflow, extra: "field" });
    expect(result.success).toBe(false);
  });

  it("surfaces a step-level error with path information", () => {
    const result = WorkflowFileSchema.safeParse({
      ...validWorkflow,
      steps: [{ id: "x", label: "Y" }], // missing can_agent_complete_alone
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const pathStrings = result.error.issues.map((i) => i.path.join("."));
      expect(pathStrings.some((p) => p.includes("can_agent_complete_alone"))).toBe(true);
    }
  });
});
