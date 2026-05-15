// Tests for pure grouping functions in lib/board-grouping.ts.
// No React, no DOM — plain vitest.

import { describe, it, expect } from "vitest";
import {
  groupTasks,
  getColumns,
  COLUMNS_MACRO,
  COLUMNS_WORKFLOW,
  type ColumnMode,
} from "../src/lib/board-grouping";
import type { CompactTask } from "../src/lib/store";

// Minimal CompactTask factory — only fields needed by groupTasks.
function makeTask(id: string, derived_status: CompactTask["derived_status"], workflow_id = "feature"): CompactTask {
  return {
    id,
    title: `Task ${id}`,
    type: "local",
    ref_source: null,
    ref_id: null,
    ref_url: null,
    workflow_id,
    derived_status,
    created_at: "2026-01-01T00:00:00Z",
  };
}

const SAMPLE_TASKS: CompactTask[] = [
  makeTask("T-1", "backlog"),
  makeTask("T-2", "active"),
  makeTask("T-3", "blocked"),
  makeTask("T-4", "done"),
  makeTask("T-5", "backlog"),
  makeTask("T-6", "active"),
  makeTask("T-7", "backlog", "hotfix"),
];

// --- COLUMNS_MACRO ---

describe("COLUMNS_MACRO", () => {
  it("has exactly four columns: backlog, active, blocked, done", () => {
    const ids = COLUMNS_MACRO.map(c => c.id);
    expect(ids).toEqual(["backlog", "active", "blocked", "done"]);
  });

  it("backlog column matches only backlog tasks", () => {
    const col = COLUMNS_MACRO.find(c => c.id === "backlog")!;
    const match = SAMPLE_TASKS.filter(col.match);
    expect(match.map(t => t.id)).toEqual(["T-1", "T-5", "T-7"]);
  });

  it("active column matches only active tasks", () => {
    const col = COLUMNS_MACRO.find(c => c.id === "active")!;
    expect(SAMPLE_TASKS.filter(col.match).map(t => t.id)).toEqual(["T-2", "T-6"]);
  });

  it("blocked column matches only blocked tasks", () => {
    const col = COLUMNS_MACRO.find(c => c.id === "blocked")!;
    expect(SAMPLE_TASKS.filter(col.match).map(t => t.id)).toEqual(["T-3"]);
  });

  it("done column matches only done tasks", () => {
    const col = COLUMNS_MACRO.find(c => c.id === "done")!;
    expect(SAMPLE_TASKS.filter(col.match).map(t => t.id)).toEqual(["T-4"]);
  });
});

// --- COLUMNS_WORKFLOW ---

describe("COLUMNS_WORKFLOW", () => {
  it("has exactly six columns", () => {
    expect(COLUMNS_WORKFLOW).toHaveLength(6);
  });

  it("labels match expected values", () => {
    const labels = COLUMNS_WORKFLOW.map(c => c.label);
    expect(labels).toEqual(["Implementing", "Tests", "Open PR", "CI", "Review", "Merge"]);
  });

  it("tasks without _currentSubtype fall into no column (returns false for all)", () => {
    const task = makeTask("T-99", "active");
    const matches = COLUMNS_WORKFLOW.filter(c => c.match(task));
    // CompactTask has no _currentSubtype — all workflow columns return false
    expect(matches).toHaveLength(0);
  });

  it("workflow column matches when _currentSubtype is injected", () => {
    const task = { ...makeTask("T-99", "active"), _currentSubtype: "implement" };
    const implementCol = COLUMNS_WORKFLOW.find(c => c.id === "implement")!;
    expect(implementCol.match(task as CompactTask)).toBe(true);
  });
});

// --- groupTasks ---

describe("groupTasks — macro mode, no filter", () => {
  it("each task lands in exactly one column", () => {
    const grouped = groupTasks(SAMPLE_TASKS, "macro", null);
    const total = [...grouped.values()].reduce((n, arr) => n + arr.length, 0);
    expect(total).toBe(SAMPLE_TASKS.length);
  });

  it("backlog group contains T-1, T-5, T-7", () => {
    const grouped = groupTasks(SAMPLE_TASKS, "macro", null);
    expect(grouped.get("backlog")!.map(t => t.id)).toEqual(["T-1", "T-5", "T-7"]);
  });

  it("done group contains T-4", () => {
    const grouped = groupTasks(SAMPLE_TASKS, "macro", null);
    expect(grouped.get("done")!.map(t => t.id)).toEqual(["T-4"]);
  });

  it("preserves column order in the Map", () => {
    const grouped = groupTasks(SAMPLE_TASKS, "macro", null);
    expect([...grouped.keys()]).toEqual(["backlog", "active", "blocked", "done"]);
  });
});

describe("groupTasks — macro mode, with workflow filter", () => {
  it("filters tasks to those matching workflowFilter", () => {
    const grouped = groupTasks(SAMPLE_TASKS, "macro", "hotfix");
    const backlog = grouped.get("backlog")!;
    expect(backlog.map(t => t.id)).toEqual(["T-7"]);
    // all other columns empty
    const active = grouped.get("active")!;
    expect(active).toHaveLength(0);
  });

  it("empty filter returns all tasks", () => {
    const grouped = groupTasks(SAMPLE_TASKS, "macro", null);
    const total = [...grouped.values()].reduce((n, arr) => n + arr.length, 0);
    expect(total).toBe(SAMPLE_TASKS.length);
  });
});

describe("groupTasks — workflow mode", () => {
  it("returns six columns in workflow mode", () => {
    const grouped = groupTasks(SAMPLE_TASKS, "workflow", null);
    expect(grouped.size).toBe(6);
  });

  it("tasks without _currentSubtype land in no workflow column", () => {
    const grouped = groupTasks(SAMPLE_TASKS, "workflow", null);
    const total = [...grouped.values()].reduce((n, arr) => n + arr.length, 0);
    // all tasks fall into zero workflow columns since they have no _currentSubtype
    expect(total).toBe(0);
  });
});

// --- getColumns ---

describe("getColumns", () => {
  it("returns COLUMNS_MACRO for 'macro'", () => {
    expect(getColumns("macro")).toBe(COLUMNS_MACRO);
  });

  it("returns COLUMNS_WORKFLOW for 'workflow'", () => {
    expect(getColumns("workflow")).toBe(COLUMNS_WORKFLOW);
  });
});
