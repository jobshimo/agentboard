// Tests for pure helper functions in lib/task-detail-helpers.ts.
// No React, no DOM — plain vitest.

import { describe, it, expect } from "vitest";
import {
  currentSubtask,
  partitionSubtasks,
  resolveSubtaskLabel,
  SUBTASK_LABELS,
} from "../src/lib/task-detail-helpers";
import type { SubtaskCompact, TaskFull } from "../src/lib/store";

function makeSubtask(
  id: string,
  status: SubtaskCompact["status"] = "pending",
  opts: Partial<SubtaskCompact> = {}
): SubtaskCompact {
  return {
    id,
    task_id: "T-1",
    type: "implement",
    step_id: "implement",
    label: "",
    status,
    note: null,
    custom: false,
    triggered_by: null,
    position: 0,
    created_at: "2026-05-15T00:00:00Z",
    updated_at: "2026-05-15T00:00:00Z",
    ...opts,
  };
}

function makeTask(subtasks: SubtaskCompact[]): TaskFull {
  return {
    id: "T-1",
    title: "Test",
    type: "local",
    ref_source: null,
    ref_id: null,
    ref_url: null,
    workflow_id: "feature",
    derived_status: "active",
    created_at: "2026-05-15T00:00:00Z",
    ref_title: null,
    ref_status: null,
    ref_assignee: null,
    workflow_snapshot: null,
    snapshot_taken_at: null,
    closed_at: null,
    subtasks,
  };
}

describe("currentSubtask", () => {
  it("returns null for empty subtask list", () => {
    expect(currentSubtask(makeTask([]))).toBeNull();
  });

  it("returns the in-progress subtask when one exists", () => {
    const s1 = makeSubtask("s-1", "pending");
    const s2 = makeSubtask("s-2", "in-progress");
    const s3 = makeSubtask("s-3", "pending");
    expect(currentSubtask(makeTask([s1, s2, s3]))?.id).toBe("s-2");
  });

  it("returns the first pending subtask when none are in-progress", () => {
    const s1 = makeSubtask("s-1", "done");
    const s2 = makeSubtask("s-2", "pending");
    const s3 = makeSubtask("s-3", "pending");
    expect(currentSubtask(makeTask([s1, s2, s3]))?.id).toBe("s-2");
  });

  it("returns null when all subtasks are terminal", () => {
    const s1 = makeSubtask("s-1", "done");
    const s2 = makeSubtask("s-2", "skipped");
    const s3 = makeSubtask("s-3", "failed");
    expect(currentSubtask(makeTask([s1, s2, s3]))).toBeNull();
  });

  it("in-progress takes priority over pending", () => {
    const s1 = makeSubtask("s-1", "pending");
    const s2 = makeSubtask("s-2", "in-progress");
    expect(currentSubtask(makeTask([s1, s2]))?.status).toBe("in-progress");
  });
});

describe("partitionSubtasks", () => {
  it("separates snapshot and custom subtasks", () => {
    const snap = makeSubtask("s-1", "pending", { custom: false });
    const cust = makeSubtask("s-2", "pending", { custom: true });
    const { snapshot, custom } = partitionSubtasks([snap, cust]);
    expect(snapshot).toHaveLength(1);
    expect(custom).toHaveLength(1);
    expect(snapshot[0]?.id).toBe("s-1");
    expect(custom[0]?.id).toBe("s-2");
  });

  it("returns empty arrays for empty input", () => {
    const { snapshot, custom } = partitionSubtasks([]);
    expect(snapshot).toHaveLength(0);
    expect(custom).toHaveLength(0);
  });

  it("preserves position order within each group", () => {
    const s1 = makeSubtask("s-1", "pending", { custom: false, position: 0 });
    const s2 = makeSubtask("s-2", "pending", { custom: false, position: 1 });
    const c1 = makeSubtask("s-3", "pending", { custom: true, position: 2 });
    const { snapshot, custom } = partitionSubtasks([s1, c1, s2]);
    expect(snapshot.map(s => s.id)).toEqual(["s-1", "s-2"]);
    expect(custom.map(s => s.id)).toEqual(["s-3"]);
  });
});

describe("resolveSubtaskLabel", () => {
  it("uses explicit label when present", () => {
    const s = makeSubtask("s-1", "pending", { label: "My custom label", type: "implement" });
    expect(resolveSubtaskLabel(s)).toBe("My custom label");
  });

  it("falls back to SUBTASK_LABELS[type] when label is empty", () => {
    const s = makeSubtask("s-1", "pending", { label: "", type: "implement" });
    expect(resolveSubtaskLabel(s)).toBe("Implementation");
  });

  it("falls back to type string for unknown types", () => {
    const s = makeSubtask("s-1", "pending", { label: "", type: "unknown-custom-step" });
    expect(resolveSubtaskLabel(s)).toBe("unknown-custom-step");
  });

  it("resolves all known step types", () => {
    const known = Object.keys(SUBTASK_LABELS);
    for (const type of known) {
      const s = makeSubtask("s-1", "pending", { label: "", type });
      expect(resolveSubtaskLabel(s)).toBe(SUBTASK_LABELS[type]);
    }
  });
});

describe("SUBTASK_LABELS", () => {
  it("contains 15 entries matching the components.jsx map", () => {
    expect(Object.keys(SUBTASK_LABELS)).toHaveLength(15);
  });

  it("has the canonical lifecycle steps", () => {
    expect(SUBTASK_LABELS["implement"]).toBe("Implementation");
    expect(SUBTASK_LABELS["open-pr"]).toBe("Open PR");
    expect(SUBTASK_LABELS["ci-green"]).toBe("CI passes");
    expect(SUBTASK_LABELS["merge"]).toBe("Merge");
  });
});
