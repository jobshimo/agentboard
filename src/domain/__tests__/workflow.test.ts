import { describe, it, expect } from "vitest";
import {
  assertStepIdsUnique,
  DuplicateStepIdError,
} from "../workflow.js";
import type { Workflow } from "../workflow.js";

const workflowWithUniqueIds: Workflow = {
  id: "coding-task",
  label: "Coding Task",
  steps: [
    { id: "implement", label: "Implement", canAgentCompleteAlone: true },
    { id: "tests", label: "Write Tests", canAgentCompleteAlone: true },
    { id: "commit", label: "Commit", canAgentCompleteAlone: true },
  ],
};

describe("assertStepIdsUnique", () => {
  it("passes silently for a workflow with all unique step ids", () => {
    expect(() => assertStepIdsUnique(workflowWithUniqueIds)).not.toThrow();
  });

  it("passes for a single-step workflow", () => {
    const single: Workflow = {
      id: "simple",
      label: "Simple",
      steps: [{ id: "do-it", label: "Do it", canAgentCompleteAlone: true }],
    };
    expect(() => assertStepIdsUnique(single)).not.toThrow();
  });

  it("throws DuplicateStepIdError when two steps share an id", () => {
    const duplicate: Workflow = {
      id: "bad-workflow",
      label: "Bad",
      steps: [
        { id: "implement", label: "Implement", canAgentCompleteAlone: true },
        { id: "implement", label: "Implement again", canAgentCompleteAlone: false },
      ],
    };
    expect(() => assertStepIdsUnique(duplicate)).toThrow(DuplicateStepIdError);
  });

  it("error message includes the workflow id and the duplicate step id", () => {
    const duplicate: Workflow = {
      id: "my-workflow",
      label: "My Workflow",
      steps: [
        { id: "review", label: "Review", canAgentCompleteAlone: false },
        { id: "review", label: "Another Review", canAgentCompleteAlone: false },
      ],
    };
    expect(() => assertStepIdsUnique(duplicate)).toThrow(/my-workflow/);
    expect(() => assertStepIdsUnique(duplicate)).toThrow(/review/);
  });

  it("only reports the first duplicate encountered", () => {
    const multiDuplicate: Workflow = {
      id: "wf",
      label: "WF",
      steps: [
        { id: "a", label: "A", canAgentCompleteAlone: true },
        { id: "a", label: "A2", canAgentCompleteAlone: true },
        { id: "b", label: "B", canAgentCompleteAlone: true },
        { id: "b", label: "B2", canAgentCompleteAlone: true },
      ],
    };
    // Should throw on first duplicate 'a'
    expect(() => assertStepIdsUnique(multiDuplicate)).toThrow(/"a"/);
  });
});
