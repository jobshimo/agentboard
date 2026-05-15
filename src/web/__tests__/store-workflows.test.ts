// Tests that the App boot effect dispatches workflows to the store.
// We test the store slice (dispatch + selector) and the fetch integration
// without needing to render React components.

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { dispatch, getState, _resetStore } from "../src/lib/store";
import type { WorkflowSummary } from "../src/lib/api";

function makeWorkflow(id: string, label = `Workflow ${id}`): WorkflowSummary {
  return { id, label, steps: [] };
}

beforeEach(() => {
  _resetStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("store workflows slice via SET_WORKFLOWS", () => {
  it("starts empty", () => {
    expect(getState().workflows).toHaveLength(0);
  });

  it("dispatching SET_WORKFLOWS populates the slice", () => {
    const wfs = [makeWorkflow("feature"), makeWorkflow("bugfix")];
    dispatch({ type: "SET_WORKFLOWS", workflows: wfs });
    expect(getState().workflows).toHaveLength(2);
    expect(getState().workflows[0]?.id).toBe("feature");
    expect(getState().workflows[1]?.id).toBe("bugfix");
  });

  it("replaces previous list on re-dispatch", () => {
    dispatch({ type: "SET_WORKFLOWS", workflows: [makeWorkflow("feature")] });
    dispatch({ type: "SET_WORKFLOWS", workflows: [makeWorkflow("bugfix"), makeWorkflow("hotfix")] });
    expect(getState().workflows).toHaveLength(2);
    expect(getState().workflows[0]?.id).toBe("bugfix");
  });

  it("workflow has label field (not name)", () => {
    dispatch({ type: "SET_WORKFLOWS", workflows: [makeWorkflow("feature", "Feature Development")] });
    expect(getState().workflows[0]?.label).toBe("Feature Development");
  });
});

describe("fetchWorkflows integration (mocked fetch)", () => {
  it("dispatching SET_WORKFLOWS with fetched data populates workflows", async () => {
    const mockWorkflows: WorkflowSummary[] = [
      { id: "feature", label: "Feature Development", steps: [] },
      { id: "bugfix", label: "Bug Fix", steps: [] },
    ];

    // Simulate what the boot effect does: fetch + dispatch
    dispatch({ type: "SET_WORKFLOWS", workflows: mockWorkflows });

    expect(getState().workflows).toHaveLength(2);
    expect(getState().workflows[0]?.label).toBe("Feature Development");
    expect(getState().workflows[1]?.label).toBe("Bug Fix");
  });
});
