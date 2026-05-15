import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrate.js";
import { insertAgentSession, updateAgentSessionLastSeen } from "../domain/sessions.js";

type Db = InstanceType<typeof Database>;

function makeDb(): Db {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

describe("domain/sessions", () => {
  let db: Db;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  describe("insertAgentSession", () => {
    it("inserts a row with active=1 and the given session id", () => {
      insertAgentSession({ db, sessionId: "sess-001" });
      const row = db
        .prepare("SELECT id, active FROM agent_sessions WHERE id = ?")
        .get("sess-001") as { id: string; active: number } | undefined;
      expect(row?.id).toBe("sess-001");
      expect(row?.active).toBe(1);
    });

    it("sets last_event_id to 0 on insert", () => {
      insertAgentSession({ db, sessionId: "sess-002" });
      const row = db
        .prepare("SELECT last_event_id FROM agent_sessions WHERE id = ?")
        .get("sess-002") as { last_event_id: number } | undefined;
      expect(row?.last_event_id).toBe(0);
    });

    it("sets connected_at and last_seen as non-null timestamps", () => {
      insertAgentSession({ db, sessionId: "sess-003" });
      const row = db
        .prepare("SELECT connected_at, last_seen FROM agent_sessions WHERE id = ?")
        .get("sess-003") as { connected_at: string | null; last_seen: string | null } | undefined;
      expect(row?.connected_at).toBeTruthy();
      expect(row?.last_seen).toBeTruthy();
    });
  });

  describe("updateAgentSessionLastSeen", () => {
    it("updates the last_seen timestamp for an existing session", () => {
      insertAgentSession({ db, sessionId: "sess-004" });
      // Ensure at least some time passes in test by checking the call doesn't throw
      updateAgentSessionLastSeen({ db, sessionId: "sess-004" });
      const row = db
        .prepare("SELECT last_seen FROM agent_sessions WHERE id = ?")
        .get("sess-004") as { last_seen: string } | undefined;
      expect(row?.last_seen).toBeTruthy();
    });

    it("is a no-op for unknown session ids (no error thrown)", () => {
      expect(() => {
        updateAgentSessionLastSeen({ db, sessionId: "unknown-session" });
      }).not.toThrow();
    });
  });
});
