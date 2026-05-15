import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  dispatch,
  getState,
  _resetStore,
  subscribe,
} from "../src/lib/store";
import type { CompactTask, Notification, Action } from "../src/lib/store";

const sampleTask: CompactTask = {
  id: "T-1",
  title: "Test task",
  type: "local",
  ref_source: null,
  ref_id: null,
  ref_url: null,
  workflow_id: "feature",
  derived_status: "backlog",
  created_at: "2026-05-15T00:00:00Z",
};

const sampleNotification: Notification = {
  id: "n-1",
  urgency: "info",
  title: "Test notification",
  body: "body text",
  taskId: "T-1",
  at: "1m ago",
};

beforeEach(() => {
  _resetStore();
});

describe("getState initial shape", () => {
  it("starts with empty tasks", () => {
    expect(getState().tasks).toEqual([]);
  });

  it("starts with empty notifications", () => {
    expect(getState().notifications).toEqual([]);
  });

  it("starts with reconnecting connection", () => {
    expect(getState().connection).toBe("reconnecting");
  });

  it("starts on board route", () => {
    expect(getState().route).toEqual({ view: "board" });
  });
});

describe("dispatch SET_TASKS", () => {
  it("replaces tasks list", () => {
    dispatch({ type: "SET_TASKS", tasks: [sampleTask] });
    expect(getState().tasks).toHaveLength(1);
    expect(getState().tasks[0]).toEqual(sampleTask);
  });

  it("replaces previous tasks on second dispatch", () => {
    dispatch({ type: "SET_TASKS", tasks: [sampleTask] });
    dispatch({ type: "SET_TASKS", tasks: [] });
    expect(getState().tasks).toHaveLength(0);
  });
});

describe("dispatch SET_CONNECTION", () => {
  it("sets connected", () => {
    dispatch({ type: "SET_CONNECTION", connection: "connected" });
    expect(getState().connection).toBe("connected");
  });

  it("sets offline", () => {
    dispatch({ type: "SET_CONNECTION", connection: "offline" });
    expect(getState().connection).toBe("offline");
  });
});

describe("dispatch PUSH_NOTIFICATION", () => {
  it("prepends notification", () => {
    dispatch({ type: "PUSH_NOTIFICATION", notification: sampleNotification });
    expect(getState().notifications).toHaveLength(1);
    expect(getState().notifications[0]).toEqual(sampleNotification);
  });

  it("prepends second notification to front", () => {
    const n2: Notification = { ...sampleNotification, id: "n-2", title: "Second" };
    dispatch({ type: "PUSH_NOTIFICATION", notification: sampleNotification });
    dispatch({ type: "PUSH_NOTIFICATION", notification: n2 });
    expect(getState().notifications[0]?.id).toBe("n-2");
    expect(getState().notifications[1]?.id).toBe("n-1");
  });
});

describe("dispatch MARK_ALL_READ", () => {
  it("clears notifications", () => {
    dispatch({ type: "PUSH_NOTIFICATION", notification: sampleNotification });
    dispatch({ type: "MARK_ALL_READ" });
    expect(getState().notifications).toHaveLength(0);
  });
});

describe("dispatch SET_ROUTE", () => {
  it("sets detail route", () => {
    dispatch({ type: "SET_ROUTE", route: { view: "detail", taskId: "T-5" } });
    expect(getState().route).toEqual({ view: "detail", taskId: "T-5" });
  });

  it("sets settings route", () => {
    dispatch({ type: "SET_ROUTE", route: { view: "settings" } });
    expect(getState().route.view).toBe("settings");
  });
});

describe("subscribe", () => {
  it("calls listener after dispatch", () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    dispatch({ type: "SET_CONNECTION", connection: "connected" });
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("does not call listener after unsubscribe", () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    unsub();
    dispatch({ type: "SET_CONNECTION", connection: "connected" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("calls multiple listeners", () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    const u1 = subscribe(l1);
    const u2 = subscribe(l2);
    dispatch({ type: "SET_CONNECTION", connection: "offline" });
    expect(l1).toHaveBeenCalledTimes(1);
    expect(l2).toHaveBeenCalledTimes(1);
    u1();
    u2();
  });
});
