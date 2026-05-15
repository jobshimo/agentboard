import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { withPiggyback } from "../piggyback.js";
import { runMigrations } from "../../db/migrate.js";
import { insertEvent } from "../../events/insert.js";

type Db = InstanceType<typeof Database>;

function makeDb(): Db {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

const SESSION_ID = "test-session-pb";

function seedSession(db: Db, id: string, cursor = 0): void {
  db.prepare(
    `INSERT INTO agent_sessions (id, last_event_id, connected_at, last_seen)
     VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  ).run(id, cursor);
}

function seedTask(db: Db, id = "T-1"): void {
  db.prepare(
    `INSERT INTO tasks (id, type, title, workflow_id, workflow_snapshot)
     VALUES (?, 'local', 'Task', 'wf', '{}')`,
  ).run(id);
}

describe("withPiggyback", () => {
  let db: Db;

  beforeEach(() => {
    db = makeDb();
    seedSession(db, SESSION_ID);
    seedTask(db);
  });

  afterEach(() => {
    db.close();
  });

  it("attaches pending_events to the result object", async () => {
    insertEvent(db, {
      taskId: "T-1",
      type: "comment_added",
      payload: { text: "hi" },
      origin: "agent",
    });

    const result = await withPiggyback(db, SESSION_ID, { ok: true });
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.pending_events)).toBe(true);
    expect(result.pending_events).toHaveLength(1);
    expect(result.pending_events[0].type).toBe("comment_added");
  });

  it("advances the session cursor so a second call returns empty events", async () => {
    insertEvent(db, {
      taskId: "T-1",
      type: "comment_added",
      payload: {},
      origin: "agent",
    });

    await withPiggyback(db, SESSION_ID, { ok: true });

    const result2 = await withPiggyback(db, SESSION_ID, { ok: true });
    expect(result2.pending_events).toHaveLength(0);
  });

  it("returns empty pending_events when no events are pending", async () => {
    const result = await withPiggyback(db, SESSION_ID, { data: "test" });
    expect(result.pending_events).toHaveLength(0);
    expect(result.data).toBe("test");
  });

  it("preserves all original result fields alongside pending_events", async () => {
    insertEvent(db, {
      taskId: "T-1",
      type: "status_change",
      payload: { from_status: "pending", to_status: "in-progress" },
      origin: "agent",
    });

    const result = await withPiggyback(db, SESSION_ID, {
      id: "s-1",
      status: "in-progress",
      label: "implement",
    });

    expect(result.id).toBe("s-1");
    expect(result.status).toBe("in-progress");
    expect(result.label).toBe("implement");
    expect(result.pending_events).toHaveLength(1);
  });

  it("returns result with empty pending_events when sessionId is undefined", async () => {
    insertEvent(db, {
      taskId: "T-1",
      type: "comment_added",
      payload: {},
      origin: "agent",
    });

    const result = await withPiggyback(db, undefined, { ok: true });
    // No session to poll from — return empty events
    expect(result.pending_events).toHaveLength(0);
    expect(result.ok).toBe(true);
  });

  describe("agentSeesHumanEvents flag", () => {
    it("includes human-origin events when agentSeesHumanEvents is true (default)", async () => {
      insertEvent(db, {
        taskId: "T-1",
        type: "comment_added",
        payload: { text: "human comment" },
        origin: "human",
      });

      const result = await withPiggyback(db, SESSION_ID, { ok: true }, true);
      expect(result.pending_events).toHaveLength(1);
      expect(result.pending_events[0]!.origin).toBe("human");
    });

    it("filters out human-origin events when agentSeesHumanEvents is false", async () => {
      insertEvent(db, {
        taskId: "T-1",
        type: "comment_added",
        payload: { text: "human comment" },
        origin: "human",
      });
      insertEvent(db, {
        taskId: "T-1",
        type: "comment_added",
        payload: { text: "agent comment" },
        origin: "agent",
      });

      const result = await withPiggyback(db, SESSION_ID, { ok: true }, false);
      expect(result.pending_events).toHaveLength(1);
      expect(result.pending_events[0]!.origin).toBe("agent");
    });

    it("preserves agent and system events when agentSeesHumanEvents is false", async () => {
      insertEvent(db, {
        taskId: "T-1",
        type: "comment_added",
        payload: {},
        origin: "system",
      });

      const result = await withPiggyback(db, SESSION_ID, { ok: true }, false);
      expect(result.pending_events).toHaveLength(1);
      expect(result.pending_events[0]!.origin).toBe("system");
    });
  });
});
