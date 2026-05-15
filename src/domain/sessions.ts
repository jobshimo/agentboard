import type Database from "better-sqlite3";

type Db = InstanceType<typeof Database>;

export interface InsertAgentSessionOpts {
  db: Db;
  sessionId: string;
}

export interface UpdateAgentSessionLastSeenOpts {
  db: Db;
  sessionId: string;
}

/**
 * Insert a new active agent session row.
 * Called once per MCP session on activation.
 */
export function insertAgentSession({ db, sessionId }: InsertAgentSessionOpts): void {
  db.prepare(
    `INSERT INTO agent_sessions (id, last_event_id, connected_at, last_seen, active)
     VALUES (?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`,
  ).run(sessionId);
}

/**
 * Update the last_seen timestamp for an existing agent session.
 * Fire-and-forget; silently ignored if the session id is unknown.
 */
export function updateAgentSessionLastSeen({ db, sessionId }: UpdateAgentSessionLastSeenOpts): void {
  db.prepare(
    `UPDATE agent_sessions SET last_seen = CURRENT_TIMESTAMP WHERE id = ?`,
  ).run(sessionId);
}

/**
 * Mark an agent session as inactive (active = 0).
 * Called on explicit deactivation or session end.
 */
export function deactivateAgentSession({ db, sessionId }: UpdateAgentSessionLastSeenOpts): void {
  db.prepare(`UPDATE agent_sessions SET active = 0 WHERE id = ?`).run(sessionId);
}
