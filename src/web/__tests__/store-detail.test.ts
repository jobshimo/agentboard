// Tests for S10c store actions: SET_TASK_DETAIL, SET_DISCUSSION,
// APPEND_DISCUSSION_ENTRY, UPSERT_SUBTASK.
// No React, no DOM — pure store logic.

import { describe, it, expect, beforeEach } from "vitest";
import { dispatch, getState, _resetStore } from "../src/lib/store";
import type { TaskFull, SubtaskCompact, DiscussionEntry } from "../src/lib/store";

function makeSubtask(id: string, taskId = "T-1", custom = false): SubtaskCompact {
  return {
    id,
    task_id: taskId,
    type: "implement",
    step_id: "implement",
    label: "Implementation",
    status: "pending",
    note: null,
    custom,
    triggered_by: null,
    position: 0,
    created_at: "2026-05-15T00:00:00Z",
    updated_at: "2026-05-15T00:00:00Z",
  };
}

function makeTask(id = "T-1"): TaskFull {
  return {
    id,
    title: "Test task",
    type: "local",
    ref_source: null,
    ref_id: null,
    ref_url: null,
    workflow_id: "feature",
    derived_status: "backlog",
    created_at: "2026-05-15T00:00:00Z",
    ref_title: null,
    ref_status: null,
    ref_assignee: null,
    workflow_snapshot: null,
    snapshot_taken_at: null,
    closed_at: null,
    subtasks: [makeSubtask("s-1")],
  };
}

function makeDiscussionEntry(id: number, taskId = "T-1"): DiscussionEntry {
  return {
    id,
    task_id: taskId,
    author: "human",
    body: "Hello",
    tag: null,
    created_at: "2026-05-15T00:00:00Z",
  };
}

beforeEach(() => {
  _resetStore();
});

describe("dispatch SET_TASK_DETAIL", () => {
  it("stores task by id", () => {
    const task = makeTask();
    dispatch({ type: "SET_TASK_DETAIL", task });
    expect(getState().taskDetail["T-1"]).toEqual(task);
  });

  it("stores multiple tasks independently", () => {
    const t1 = makeTask("T-1");
    const t2 = makeTask("T-2");
    dispatch({ type: "SET_TASK_DETAIL", task: t1 });
    dispatch({ type: "SET_TASK_DETAIL", task: t2 });
    expect(getState().taskDetail["T-1"]?.id).toBe("T-1");
    expect(getState().taskDetail["T-2"]?.id).toBe("T-2");
  });

  it("updates existing task by same id", () => {
    const task = makeTask();
    dispatch({ type: "SET_TASK_DETAIL", task });
    const updated = { ...task, title: "Updated title" };
    dispatch({ type: "SET_TASK_DETAIL", task: updated });
    expect(getState().taskDetail["T-1"]?.title).toBe("Updated title");
  });
});

describe("dispatch SET_DISCUSSION", () => {
  it("stores entries by taskId", () => {
    const entries = [makeDiscussionEntry(1)];
    dispatch({ type: "SET_DISCUSSION", taskId: "T-1", entries });
    expect(getState().discussion["T-1"]).toHaveLength(1);
  });

  it("replaces previous entries on re-fetch", () => {
    dispatch({ type: "SET_DISCUSSION", taskId: "T-1", entries: [makeDiscussionEntry(1)] });
    dispatch({ type: "SET_DISCUSSION", taskId: "T-1", entries: [makeDiscussionEntry(2), makeDiscussionEntry(3)] });
    expect(getState().discussion["T-1"]).toHaveLength(2);
    expect(getState().discussion["T-1"]?.[0]?.id).toBe(2);
  });

  it("does not affect other task discussions", () => {
    dispatch({ type: "SET_DISCUSSION", taskId: "T-1", entries: [makeDiscussionEntry(1, "T-1")] });
    dispatch({ type: "SET_DISCUSSION", taskId: "T-2", entries: [makeDiscussionEntry(2, "T-2")] });
    expect(getState().discussion["T-1"]).toHaveLength(1);
    expect(getState().discussion["T-2"]).toHaveLength(1);
  });
});

describe("dispatch APPEND_DISCUSSION_ENTRY", () => {
  it("appends to empty discussion", () => {
    const entry = makeDiscussionEntry(1);
    dispatch({ type: "APPEND_DISCUSSION_ENTRY", taskId: "T-1", entry });
    expect(getState().discussion["T-1"]).toHaveLength(1);
    expect(getState().discussion["T-1"]?.[0]?.id).toBe(1);
  });

  it("appends to existing discussion", () => {
    dispatch({ type: "SET_DISCUSSION", taskId: "T-1", entries: [makeDiscussionEntry(1)] });
    dispatch({ type: "APPEND_DISCUSSION_ENTRY", taskId: "T-1", entry: makeDiscussionEntry(2) });
    expect(getState().discussion["T-1"]).toHaveLength(2);
    expect(getState().discussion["T-1"]?.[1]?.id).toBe(2);
  });

  it("does not mutate the previous array reference", () => {
    dispatch({ type: "SET_DISCUSSION", taskId: "T-1", entries: [makeDiscussionEntry(1)] });
    const before = getState().discussion["T-1"];
    dispatch({ type: "APPEND_DISCUSSION_ENTRY", taskId: "T-1", entry: makeDiscussionEntry(2) });
    const after = getState().discussion["T-1"];
    expect(before).not.toBe(after);
    expect(before).toHaveLength(1);
  });
});

describe("dispatch UPSERT_SUBTASK", () => {
  it("updates an existing subtask", () => {
    const task = makeTask();
    dispatch({ type: "SET_TASK_DETAIL", task });

    const updated: SubtaskCompact = { ...makeSubtask("s-1"), status: "done" };
    dispatch({ type: "UPSERT_SUBTASK", taskId: "T-1", subtask: updated });

    expect(getState().taskDetail["T-1"]?.subtasks[0]?.status).toBe("done");
  });

  it("appends a new subtask (custom subtask add)", () => {
    const task = makeTask(); // starts with 1 subtask
    dispatch({ type: "SET_TASK_DETAIL", task });

    const newSub: SubtaskCompact = { ...makeSubtask("s-99", "T-1", true), label: "New custom" };
    dispatch({ type: "UPSERT_SUBTASK", taskId: "T-1", subtask: newSub });

    const subtasks = getState().taskDetail["T-1"]?.subtasks ?? [];
    expect(subtasks).toHaveLength(2);
    expect(subtasks[1]?.id).toBe("s-99");
  });

  it("does not mutate other tasks", () => {
    const t1 = makeTask("T-1");
    const t2 = makeTask("T-2");
    dispatch({ type: "SET_TASK_DETAIL", task: t1 });
    dispatch({ type: "SET_TASK_DETAIL", task: t2 });

    const updated: SubtaskCompact = { ...makeSubtask("s-1"), status: "in-progress" };
    dispatch({ type: "UPSERT_SUBTASK", taskId: "T-1", subtask: updated });

    expect(getState().taskDetail["T-1"]?.subtasks[0]?.status).toBe("in-progress");
    // T-2 subtask untouched
    expect(getState().taskDetail["T-2"]?.subtasks[0]?.status).toBe("pending");
  });

  it("is a no-op if task is not in store", () => {
    const updated = makeSubtask("s-1");
    dispatch({ type: "UPSERT_SUBTASK", taskId: "T-999", subtask: updated });
    expect(getState().taskDetail["T-999"]).toBeUndefined();
  });

  it("does not affect the tasks list", () => {
    const task = makeTask();
    dispatch({ type: "SET_TASK_DETAIL", task });
    const updated = { ...makeSubtask("s-1"), status: "done" as const };
    dispatch({ type: "UPSERT_SUBTASK", taskId: "T-1", subtask: updated });
    // tasks[] (compact) is untouched
    expect(getState().tasks).toHaveLength(0);
  });
});

describe("taskDetail initial state", () => {
  it("starts empty", () => {
    expect(getState().taskDetail).toEqual({});
  });
});

describe("discussion initial state", () => {
  it("starts empty", () => {
    expect(getState().discussion).toEqual({});
  });
});
