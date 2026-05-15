/**
 * Token budget test: ensure the piggyback payload stays under 4k chars
 * for a typical 10-event burst.
 *
 * W5: cross-cutting integration tests — token-budget
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrate.js";
import { withPiggyback } from "../mcp/piggyback.js";
import { insertEvent } from "../events/insert.js";

type Db = InstanceType<typeof Database>;

const SESSION_ID = "budget-session";
const TASK_ID = "T-budget-1";
const MAX_CHARS = 4096;

function makeDb(): Db {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

function seedSession(db: Db, id: string): void {
  db.prepare(
    `INSERT INTO agent_sessions (id, last_event_id, connected_at, last_seen)
     VALUES (?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  ).run(id);
}

function seedTask(db: Db, id: string): void {
  db.prepare(
    `INSERT INTO tasks (id, type, title, workflow_id, workflow_snapshot)
     VALUES (?, 'local', 'Budget Task', 'wf', '{}')`,
  ).run(id);
}

describe("token budget — piggyback payload", () => {
  let db: Db;

  beforeEach(() => {
    db = makeDb();
    seedSession(db, SESSION_ID);
    seedTask(db, TASK_ID);
  });

  afterEach(() => {
    db.close();
  });

  it("10-event burst piggyback payload stays under 4096 chars", async () => {
    // Insert 10 diverse events
    const eventTypes = [
      "comment_added",
      "status_change",
      "subtask_added",
      "subtask_updated",
      "custom_subtask_added",
      "feedback_added",
      "task_completed",
      "task_blocked",
      "agent_notification",
      "pr_comment",
    ] as const;

    for (const type of eventTypes) {
      insertEvent(db, {
        taskId: TASK_ID,
        type,
        payload: { type, text: "This is a representative event payload for token budget testing." },
        origin: "agent",
      });
    }

    const result = await withPiggyback(db, SESSION_ID, {
      id: TASK_ID,
      status: "active",
    });

    expect(result.pending_events).toHaveLength(10);

    const serialized = JSON.stringify(result);
    expect(serialized.length).toBeLessThanOrEqual(MAX_CHARS);
  });

  it("empty burst returns minimal payload (well under budget)", async () => {
    const result = await withPiggyback(db, SESSION_ID, { ok: true });
    const serialized = JSON.stringify(result);
    expect(serialized.length).toBeLessThan(100);
  });

  it("single event stays under budget", async () => {
    insertEvent(db, {
      taskId: TASK_ID,
      type: "comment_added",
      payload: { text: "A".repeat(200) }, // 200-char text is a realistic comment
      origin: "agent",
    });

    const result = await withPiggyback(db, SESSION_ID, { id: TASK_ID });
    const serialized = JSON.stringify(result);
    expect(serialized.length).toBeLessThanOrEqual(MAX_CHARS);
  });
});
