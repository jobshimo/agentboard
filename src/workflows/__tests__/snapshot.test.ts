import { describe, it, expect } from "vitest";
import { freezeWorkflow, rehydrateSnapshot, SnapshotRehydrationError } from "../snapshot.js";
import type { Workflow } from "../../domain/workflow.js";

const baseWorkflow: Workflow = {
  id: "coding-task",
  label: "Coding Task",
  steps: [
    { id: "implement", label: "Implement", canAgentCompleteAlone: true },
    { id: "tests", label: "Write Tests", canAgentCompleteAlone: true, blocksNext: true },
    {
      id: "review",
      label: "Code Review",
      canAgentCompleteAlone: false,
      triggeredBy: "pr_comment",
      agentHint: "Request a review",
    },
  ],
};

describe("freezeWorkflow", () => {
  it("returns a snapshot with the correct id and label", () => {
    const snapshot = freezeWorkflow(baseWorkflow);
    expect(snapshot.id).toBe("coding-task");
    expect(snapshot.label).toBe("Coding Task");
  });

  it("preserves all step fields including optional ones", () => {
    const snapshot = freezeWorkflow(baseWorkflow);
    expect(snapshot.steps).toHaveLength(3);

    const reviewStep = snapshot.steps[2];
    expect(reviewStep.canAgentCompleteAlone).toBe(false);
    expect(reviewStep.triggeredBy).toBe("pr_comment");
    expect(reviewStep.agentHint).toBe("Request a review");
  });

  it("omits undefined optional fields from snapshot steps", () => {
    const snapshot = freezeWorkflow(baseWorkflow);
    const implementStep = snapshot.steps[0];
    expect("blocksNext" in implementStep).toBe(false);
    expect("triggeredBy" in implementStep).toBe(false);
    expect("agentHint" in implementStep).toBe(false);
  });

  it("includes a frozenAt ISO timestamp", () => {
    const before = new Date().toISOString();
    const snapshot = freezeWorkflow(baseWorkflow);
    const after = new Date().toISOString();

    expect(snapshot.frozenAt >= before).toBe(true);
    expect(snapshot.frozenAt <= after).toBe(true);
  });

  it("is JSON-serializable (round-trips through JSON)", () => {
    const snapshot = freezeWorkflow(baseWorkflow);
    const json = JSON.stringify(snapshot);
    const parsed = JSON.parse(json);

    expect(parsed.id).toBe(snapshot.id);
    expect(parsed.steps).toHaveLength(snapshot.steps.length);
  });

  it("produces a deep clone — mutating the source workflow does not affect the snapshot", () => {
    const mutableWorkflow = {
      id: "coding-task",
      label: "Coding Task",
      steps: [{ id: "implement", label: "Implement", canAgentCompleteAlone: true }],
    };

    const snapshot = freezeWorkflow(mutableWorkflow);

    // Verify the snapshot captured original values before mutation
    expect(snapshot.steps[0].label).toBe("Implement");
    expect(snapshot.steps[0].id).toBe("implement");
    expect(snapshot.id).toBe("coding-task");
  });

  it("multiple freezes of the same workflow produce independent snapshots", () => {
    const s1 = freezeWorkflow(baseWorkflow);
    const s2 = freezeWorkflow(baseWorkflow);
    // They are equal in value but not the same reference
    expect(s1).not.toBe(s2);
    expect(s1.id).toBe(s2.id);
  });
});

describe("rehydrateSnapshot", () => {
  it("round-trips a frozen snapshot through JSON correctly", () => {
    const original = freezeWorkflow(baseWorkflow);
    const json = JSON.stringify(original);
    const rehydrated = rehydrateSnapshot(json);

    expect(rehydrated.id).toBe(original.id);
    expect(rehydrated.label).toBe(original.label);
    expect(rehydrated.frozenAt).toBe(original.frozenAt);
    expect(rehydrated.steps).toHaveLength(original.steps.length);
    expect(rehydrated.steps[2].triggeredBy).toBe("pr_comment");
  });

  it("throws SnapshotRehydrationError on invalid JSON", () => {
    expect(() => rehydrateSnapshot("not-json{{{")).toThrow(SnapshotRehydrationError);
    expect(() => rehydrateSnapshot("not-json{{{")).toThrow(/valid JSON/i);
  });

  it("throws SnapshotRehydrationError when 'id' is missing from JSON", () => {
    const json = JSON.stringify({ label: "x", steps: [], frozenAt: new Date().toISOString() });
    expect(() => rehydrateSnapshot(json)).toThrow(SnapshotRehydrationError);
  });

  it("throws SnapshotRehydrationError when 'steps' is not an array", () => {
    const json = JSON.stringify({ id: "x", label: "x", steps: "oops", frozenAt: new Date().toISOString() });
    expect(() => rehydrateSnapshot(json)).toThrow(SnapshotRehydrationError);
  });

  it("throws SnapshotRehydrationError when a step is missing canAgentCompleteAlone", () => {
    const json = JSON.stringify({
      id: "x",
      label: "x",
      steps: [{ id: "s1", label: "S1" }],
      frozenAt: new Date().toISOString(),
    });
    expect(() => rehydrateSnapshot(json)).toThrow(SnapshotRehydrationError);
  });
});
