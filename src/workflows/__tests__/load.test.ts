import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  loadWorkflowFile,
  WorkflowFileNotFoundError,
  WorkflowParseError,
  WorkflowValidationError,
} from "../load.js";
import { DuplicateStepIdError } from "../../domain/workflow.js";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agentboard-load-"));
}

const VALID_YAML = `
id: coding-task
label: Coding Task
steps:
  - id: implement
    label: Implement
    can_agent_complete_alone: true
  - id: tests
    label: Write Tests
    can_agent_complete_alone: true
  - id: commit
    label: Commit
    can_agent_complete_alone: true
    blocks_next: false
`;

const YAML_WITH_OPTIONAL_FIELDS = `
id: review-task
label: Review Task
steps:
  - id: review
    label: Code Review
    can_agent_complete_alone: false
    triggered_by: pr_comment
    agent_hint: Leave a review on the open PR
`;

describe("loadWorkflowFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns a valid Workflow from a well-formed YAML file", () => {
    const filePath = path.join(tmpDir, "coding-task.yaml");
    fs.writeFileSync(filePath, VALID_YAML);

    const workflow = loadWorkflowFile(filePath);

    expect(workflow.id).toBe("coding-task");
    expect(workflow.label).toBe("Coding Task");
    expect(workflow.steps).toHaveLength(3);
    expect(workflow.steps[0]).toMatchObject({
      id: "implement",
      label: "Implement",
      canAgentCompleteAlone: true,
    });
  });

  it("maps YAML snake_case fields to camelCase domain fields", () => {
    const filePath = path.join(tmpDir, "review.yaml");
    fs.writeFileSync(filePath, YAML_WITH_OPTIONAL_FIELDS);

    const workflow = loadWorkflowFile(filePath);
    const step = workflow.steps[0];

    expect(step.canAgentCompleteAlone).toBe(false);
    expect(step.triggeredBy).toBe("pr_comment");
    expect(step.agentHint).toBe("Leave a review on the open PR");
  });

  it("throws WorkflowFileNotFoundError for a missing file", () => {
    const filePath = path.join(tmpDir, "does-not-exist.yaml");
    expect(() => loadWorkflowFile(filePath)).toThrow(WorkflowFileNotFoundError);
    expect(() => loadWorkflowFile(filePath)).toThrow(/not found/i);
  });

  it("throws WorkflowParseError for malformed YAML", () => {
    const filePath = path.join(tmpDir, "broken.yaml");
    // Tabs in YAML cause a parse error
    fs.writeFileSync(filePath, "id: bad\nsteps:\n\t- id: x\n");

    expect(() => loadWorkflowFile(filePath)).toThrow(WorkflowParseError);
  });

  it("throws WorkflowValidationError when a required step field is missing", () => {
    const filePath = path.join(tmpDir, "missing-field.yaml");
    fs.writeFileSync(
      filePath,
      `id: wf\nlabel: WF\nsteps:\n  - id: step1\n    label: Step 1\n`
    );

    expect(() => loadWorkflowFile(filePath)).toThrow(WorkflowValidationError);
    expect(() => loadWorkflowFile(filePath)).toThrow(/can_agent_complete_alone/i);
  });

  it("throws WorkflowValidationError when workflow 'id' is missing", () => {
    const filePath = path.join(tmpDir, "no-id.yaml");
    fs.writeFileSync(
      filePath,
      `label: WF\nsteps:\n  - id: step1\n    label: S1\n    can_agent_complete_alone: true\n`
    );

    expect(() => loadWorkflowFile(filePath)).toThrow(WorkflowValidationError);
  });

  it("throws WorkflowValidationError for an unknown triggered_by value", () => {
    const filePath = path.join(tmpDir, "bad-trigger.yaml");
    fs.writeFileSync(
      filePath,
      `id: wf\nlabel: WF\nsteps:\n  - id: s1\n    label: S1\n    can_agent_complete_alone: true\n    triggered_by: unknown_trigger\n`
    );

    expect(() => loadWorkflowFile(filePath)).toThrow(WorkflowValidationError);
    expect(() => loadWorkflowFile(filePath)).toThrow(/triggered_by/i);
  });

  it("throws DuplicateStepIdError when two steps share the same id", () => {
    const filePath = path.join(tmpDir, "duplicate-steps.yaml");
    fs.writeFileSync(
      filePath,
      `id: wf\nlabel: WF\nsteps:\n  - id: implement\n    label: A\n    can_agent_complete_alone: true\n  - id: implement\n    label: B\n    can_agent_complete_alone: false\n`
    );

    expect(() => loadWorkflowFile(filePath)).toThrow(DuplicateStepIdError);
    expect(() => loadWorkflowFile(filePath)).toThrow(/implement/);
  });

  it("returns readonly step fields — blocksNext omitted when not in YAML", () => {
    const filePath = path.join(tmpDir, "simple.yaml");
    fs.writeFileSync(filePath, VALID_YAML);

    const workflow = loadWorkflowFile(filePath);
    // blocksNext only present when explicitly set
    expect(workflow.steps[0].blocksNext).toBeUndefined();
    expect(workflow.steps[2].blocksNext).toBe(false);
  });
});
