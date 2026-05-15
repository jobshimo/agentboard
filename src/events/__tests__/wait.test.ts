import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../db/migrate.js";
import { WaiterRegistry } from "../wait.js";
import type { InsertedEvent } from "../insert.js";

type Db = InstanceType<typeof Database>;

function makeDb(): Db {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

function seedSession(db: Db, id: string, lastEventId = 0): void {
  db.prepare(
    `INSERT INTO agent_sessions (id, last_event_id, connected_at, last_seen)
     VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  ).run(id, lastEventId);
}

function makeEvent(overrides: Partial<InsertedEvent> = {}): InsertedEvent {
  return {
    id: 1,
    taskId: "T-1",
    type: "comment_added",
    payload: {},
    origin: "human",
    ...overrides,
  };
}

describe("WaiterRegistry", () => {
  let db: Db;
  let registry: WaiterRegistry;

  beforeEach(() => {
    vi.useFakeTimers();
    db = makeDb();
    registry = new WaiterRegistry();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("size() returns 0 initially", () => {
    expect(registry.size()).toBe(0);
  });

  it("resolves immediately with matching event when one arrives before timeout", async () => {
    seedSession(db, "S-1", 0);

    const promise = registry.register(db, "S-1", { timeoutMs: 5000 });
    expect(registry.size()).toBe(1);

    const event = makeEvent({ id: 1 });
    registry.listener(event);

    const result = await promise;
    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
    expect(registry.size()).toBe(0);
  });

  it("resolves with null on timeout when no event arrives", async () => {
    seedSession(db, "S-1", 0);

    const promise = registry.register(db, "S-1", { timeoutMs: 3000 });

    vi.advanceTimersByTime(3000);

    const result = await promise;
    expect(result).toBeNull();
    expect(registry.size()).toBe(0);
  });

  it("filters by taskId — ignores events for a different task", async () => {
    seedSession(db, "S-1", 0);

    const promise = registry.register(db, "S-1", { taskId: "T-1", timeoutMs: 5000 });

    registry.listener(makeEvent({ id: 1, taskId: "T-2" }));

    // Event for T-2 must NOT wake the T-1 waiter
    // Advance time to settle microtasks without triggering timeout
    await Promise.resolve();
    expect(registry.size()).toBe(1); // still waiting

    vi.advanceTimersByTime(5000);
    const result = await promise;
    expect(result).toBeNull();
  });

  it("filters by event types — ignores non-matching types", async () => {
    seedSession(db, "S-1", 0);

    const promise = registry.register(db, "S-1", {
      types: ["status_change"],
      timeoutMs: 5000,
    });

    registry.listener(makeEvent({ id: 1, type: "comment_added" }));

    await Promise.resolve();
    expect(registry.size()).toBe(1); // still waiting

    const event = makeEvent({ id: 2, type: "status_change" });
    registry.listener(event);

    const result = await promise;
    expect(result).not.toBeNull();
    expect(result!.type).toBe("status_change");
  });

  it("handles multiple concurrent waiters independently", async () => {
    seedSession(db, "S-1", 0);
    seedSession(db, "S-2", 0);

    const p1 = registry.register(db, "S-1", { taskId: "T-1", timeoutMs: 5000 });
    const p2 = registry.register(db, "S-2", { taskId: "T-2", timeoutMs: 5000 });

    expect(registry.size()).toBe(2);

    registry.listener(makeEvent({ id: 1, taskId: "T-1" }));

    const r1 = await p1;
    expect(r1).not.toBeNull();
    expect(registry.size()).toBe(1); // S-2 still waiting

    vi.advanceTimersByTime(5000);
    const r2 = await p2;
    expect(r2).toBeNull();
    expect(registry.size()).toBe(0);
  });

  it("listener is bound and can be destructured and called as a plain function", async () => {
    seedSession(db, "S-1", 0);

    const promise = registry.register(db, "S-1", { timeoutMs: 5000 });

    const { listener } = registry;
    listener(makeEvent({ id: 1 }));

    const result = await promise;
    expect(result).not.toBeNull();
  });

  it("advances the session cursor when a waiter is resolved by an event", async () => {
    seedSession(db, "S-1", 0);

    const promise = registry.register(db, "S-1", { timeoutMs: 5000 });
    registry.listener(makeEvent({ id: 7 }));
    await promise;

    const row = db
      .prepare("SELECT last_event_id FROM agent_sessions WHERE id = ?")
      .get("S-1") as { last_event_id: number };
    expect(row.last_event_id).toBe(7);
  });

  it("does not advance cursor on timeout", async () => {
    seedSession(db, "S-1", 0);

    const promise = registry.register(db, "S-1", { timeoutMs: 1000 });
    vi.advanceTimersByTime(1000);
    await promise;

    const row = db
      .prepare("SELECT last_event_id FROM agent_sessions WHERE id = ?")
      .get("S-1") as { last_event_id: number };
    expect(row.last_event_id).toBe(0);
  });
});
