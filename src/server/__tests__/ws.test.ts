import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../db/migrate.js";
import { buildApp } from "../app.js";
import { BroadcastManager, type Sendable } from "../broadcaster.js";
import type { InsertedEvent } from "../../events/insert.js";

type Db = InstanceType<typeof Database>;

// ---------------------------------------------------------------------------
// Workflow mocks — same stubs used in rest.test.ts
// ---------------------------------------------------------------------------

vi.mock("../../workflows/discovery.js", () => ({
  resolveWorkflowPaths: () => ["/stub/coding-task.yaml"],
}));

vi.mock("../../workflows/load.js", () => ({
  loadWorkflowFile: () => ({
    id: "coding-task",
    label: "Coding Task",
    steps: [
      { id: "implement", label: "Implement", canAgentCompleteAlone: true },
      { id: "tests", label: "Tests", canAgentCompleteAlone: true },
    ],
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTestDb(): Db {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

function makeEvent(overrides: Partial<InsertedEvent> = {}): InsertedEvent {
  return {
    id: 1,
    taskId: "T-1",
    type: "comment_added",
    payload: { body: "hello" },
    origin: "human",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// BroadcastManager unit tests
// ---------------------------------------------------------------------------

describe("BroadcastManager", () => {
  it("attachClient adds a client to the set", () => {
    const manager = new BroadcastManager();
    const ws = { send: vi.fn(), readyState: 1 };
    manager.attachClient(ws as Sendable);
    expect(manager.clientCount()).toBe(1);
  });

  it("detachClient removes a client from the set", () => {
    const manager = new BroadcastManager();
    const ws = { send: vi.fn(), readyState: 1 };
    manager.attachClient(ws as Sendable);
    manager.detachClient(ws as Sendable);
    expect(manager.clientCount()).toBe(0);
  });

  it("listener sends JSON-serialised event to all attached clients", () => {
    const manager = new BroadcastManager();
    const ws1 = { send: vi.fn(), readyState: 1 };
    const ws2 = { send: vi.fn(), readyState: 1 };
    manager.attachClient(ws1 as Sendable);
    manager.attachClient(ws2 as Sendable);

    const event = makeEvent({ taskId: "T-1", type: "status_change", payload: { subtask_id: "s-1", from_status: "pending", to_status: "in-progress" } });
    manager.listener(event);

    const expected = JSON.stringify({
      event: "status_change",
      task_id: "T-1",
      entity_ids: ["s-1"],
    });
    expect(ws1.send).toHaveBeenCalledWith(expected);
    expect(ws2.send).toHaveBeenCalledWith(expected);
  });

  it("listener sends entity_ids as empty array for events without entity ids", () => {
    const manager = new BroadcastManager();
    const ws = { send: vi.fn(), readyState: 1 };
    manager.attachClient(ws as Sendable);

    const event = makeEvent({ taskId: "T-2", type: "task_completed", payload: { task_id: "T-2" } });
    manager.listener(event);

    const msg = JSON.parse(ws.send.mock.calls[0][0] as string) as unknown;
    expect(msg).toMatchObject({ event: "task_completed", task_id: "T-2", entity_ids: [] });
  });

  it("a client that throws on send does not stop other clients from receiving", () => {
    const manager = new BroadcastManager();
    const badWs = {
      send: vi.fn().mockImplementation(() => { throw new Error("socket closed"); }),
      readyState: 1,
    };
    const goodWs = { send: vi.fn(), readyState: 1 };
    manager.attachClient(badWs as Sendable);
    manager.attachClient(goodWs as Sendable);

    const event = makeEvent();
    expect(() => manager.listener(event)).not.toThrow();
    expect(goodWs.send).toHaveBeenCalledOnce();
  });

  it("listener with no clients does nothing", () => {
    const manager = new BroadcastManager();
    expect(() => manager.listener(makeEvent())).not.toThrow();
  });

  it("listener is bound — can be passed as a callback without losing context", () => {
    const manager = new BroadcastManager();
    const ws = { send: vi.fn(), readyState: 1 };
    manager.attachClient(ws as Sendable);

    const listener = manager.listener; // destructured — no explicit bind
    listener(makeEvent());

    expect(ws.send).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Integration: POST comment triggers WS broadcast
// ---------------------------------------------------------------------------
// Note: the WebSocket upgrade handshake itself is covered by Phase 3 e2e tests
// (Fastify's `inject` cannot complete a 101 Switching Protocols response).

describe("WS integration — POST /api/tasks/:id/comments triggers broadcast", () => {
  let db: Db;

  beforeEach(() => { db = makeTestDb(); });
  afterEach(async () => { db.close(); });

  it("calls the broadcaster listener when a comment is inserted", async () => {
    const app = buildApp({ db });
    await app.ready();

    // Inject a spy client into the broadcaster via the app's broadcaster instance
    const received: string[] = [];
    const fakeWs = {
      send: (msg: string) => { received.push(msg); },
      readyState: 1,
    };

    // Access broadcaster exposed on app to inject client
    const broadcaster = (app as unknown as { broadcaster: BroadcastManager }).broadcaster;
    broadcaster.attachClient(fakeWs as Sendable);

    // Create a task first
    await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Test task", workflow_id: "coding-task" }),
    });

    const taskRes = await app.inject({ method: "GET", url: "/api/tasks" });
    const tasks = taskRes.json<Array<{ id: string }>>() ;
    const taskId = tasks[0]!.id;

    // Post a comment — should trigger WS broadcast
    await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/comments`,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "integration test comment" }),
    });

    expect(received).toHaveLength(1);
    const push = JSON.parse(received[0]!) as { event: string; task_id: string; entity_ids: string[] };
    expect(push.event).toBe("comment_added");
    expect(push.task_id).toBe(taskId);
    expect(push.entity_ids).toBeInstanceOf(Array);

    await app.close();
  });

  it("WS broadcast does not interfere with REST response on subtask patch", async () => {
    const app = buildApp({ db });
    await app.ready();

    // Create task + get its first subtask
    await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Patch test", workflow_id: "coding-task" }),
    });

    const tasksRes = await app.inject({ method: "GET", url: "/api/tasks" });
    const taskId = (tasksRes.json<Array<{ id: string }>>())[0]!.id;

    const taskFullRes = await app.inject({ method: "GET", url: `/api/tasks/${taskId}` });
    const subtaskId = (taskFullRes.json<{ subtasks: Array<{ id: string }> }>()).subtasks[0]!.id;

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/subtasks/${subtaskId}`,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "in-progress" }),
    });

    expect(patchRes.statusCode).toBe(200);
    const updated = patchRes.json<{ status: string }>();
    expect(updated.status).toBe("in-progress");

    await app.close();
  });
});
