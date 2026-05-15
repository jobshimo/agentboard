// Tests for S10d store actions: SET_WORKFLOWS, SET_HEALTH.
// No React, no DOM — pure store logic.

import { describe, it, expect, beforeEach } from "vitest";
import { dispatch, getState, _resetStore } from "../src/lib/store";
import type { WorkflowSummary, HealthInfo } from "../src/lib/store";

function makeWorkflow(id: string, stepCount = 2): WorkflowSummary {
  return {
    id,
    label: `Workflow ${id}`,
    steps: Array.from({ length: stepCount }, (_, i) => ({
      id: `step-${i + 1}`,
      label: `Step ${i + 1}`,
      type: "implement",
    })),
  };
}

function makeHealth(overrides: Partial<HealthInfo> = {}): HealthInfo {
  return {
    ok: true,
    version: "0.1.0",
    uptime_ms: 60_000,
    ...overrides,
  };
}

beforeEach(() => {
  _resetStore();
});

describe("dispatch SET_WORKFLOWS", () => {
  it("stores workflow list", () => {
    const wfs = [makeWorkflow("feature"), makeWorkflow("bugfix")];
    dispatch({ type: "SET_WORKFLOWS", workflows: wfs });
    expect(getState().workflows).toHaveLength(2);
    expect(getState().workflows[0]?.id).toBe("feature");
    expect(getState().workflows[1]?.id).toBe("bugfix");
  });

  it("replaces previous list on re-fetch", () => {
    dispatch({ type: "SET_WORKFLOWS", workflows: [makeWorkflow("feature")] });
    dispatch({ type: "SET_WORKFLOWS", workflows: [makeWorkflow("bugfix"), makeWorkflow("hotfix")] });
    expect(getState().workflows).toHaveLength(2);
    expect(getState().workflows[0]?.id).toBe("bugfix");
  });

  it("accepts empty list", () => {
    dispatch({ type: "SET_WORKFLOWS", workflows: [makeWorkflow("feature")] });
    dispatch({ type: "SET_WORKFLOWS", workflows: [] });
    expect(getState().workflows).toHaveLength(0);
  });

  it("does not mutate other state slices", () => {
    dispatch({ type: "SET_WORKFLOWS", workflows: [makeWorkflow("feature")] });
    expect(getState().tasks).toHaveLength(0);
    expect(getState().health).toBeNull();
  });

  it("workflows start empty", () => {
    expect(getState().workflows).toHaveLength(0);
  });
});

describe("dispatch SET_HEALTH", () => {
  it("stores health info", () => {
    const h = makeHealth();
    dispatch({ type: "SET_HEALTH", health: h });
    expect(getState().health).toEqual(h);
  });

  it("updates health on subsequent fetch", () => {
    dispatch({ type: "SET_HEALTH", health: makeHealth({ uptime_ms: 1000 }) });
    dispatch({ type: "SET_HEALTH", health: makeHealth({ uptime_ms: 5000 }) });
    expect(getState().health?.uptime_ms).toBe(5000);
  });

  it("health starts null", () => {
    expect(getState().health).toBeNull();
  });

  it("preserves version string", () => {
    dispatch({ type: "SET_HEALTH", health: makeHealth({ version: "1.2.3" }) });
    expect(getState().health?.version).toBe("1.2.3");
  });

  it("does not affect workflows slice", () => {
    dispatch({ type: "SET_WORKFLOWS", workflows: [makeWorkflow("feature")] });
    dispatch({ type: "SET_HEALTH", health: makeHealth() });
    expect(getState().workflows).toHaveLength(1);
  });
});

describe("wfColor determinism (pure logic)", () => {
  // The color hash is a pure function defined inside WorkflowsSection.tsx.
  // We test the invariant here: same id always produces the same color index.
  // We inline the hash so the test stays pure (no JSX import).
  function wfColorIndex(id: string): number {
    const WF_COLORS_LEN = 6;
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = ((hash * 31) + id.charCodeAt(i)) >>> 0;
    }
    return hash % WF_COLORS_LEN;
  }

  it("same id produces same index", () => {
    expect(wfColorIndex("feature")).toBe(wfColorIndex("feature"));
  });

  it("different ids can produce different indices", () => {
    const results = ["feature", "bugfix", "hotfix", "release", "chore", "docs"].map(wfColorIndex);
    const unique = new Set(results);
    expect(unique.size).toBeGreaterThan(1);
  });

  it("index is always in valid range", () => {
    const ids = ["a", "ab", "feature-flow", "x".repeat(50), ""];
    for (const id of ids) {
      const idx = wfColorIndex(id);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(6);
    }
  });
});
