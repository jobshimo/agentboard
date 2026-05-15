import type Database from "better-sqlite3";

type Db = InstanceType<typeof Database>;

export interface GcOpts {
  zombieThresholdMs: number;
  perTaskBackstop: number;
}

export interface GcReport {
  zombiesDeleted: number;
  eventsDeleted: number;
  backstopDeleted: number;
}

function deleteZombieSessions(db: Db, thresholdMs: number): number {
  const thresholdSec = Math.floor(thresholdMs / 1000);
  const result = db
    .prepare(
      `DELETE FROM agent_sessions
       WHERE last_seen < datetime('now', ? || ' seconds')`,
    )
    .run(`-${thresholdSec}`);
  return Number(result.changes);
}

function deleteConsumedByAll(db: Db): number {
  const row = db
    .prepare("SELECT MIN(last_event_id) as min_cursor FROM agent_sessions")
    .get() as { min_cursor: number | null };

  const minCursor = row.min_cursor;
  if (minCursor === null || minCursor === 0) return 0;

  const result = db
    .prepare("DELETE FROM events WHERE id <= ?")
    .run(minCursor);
  return Number(result.changes);
}

function trimBackstop(db: Db, perTaskBackstop: number): number {
  const overgrown = db
    .prepare(
      `SELECT task_id, COUNT(*) as cnt
       FROM events
       GROUP BY task_id
       HAVING cnt > ?`,
    )
    .all(perTaskBackstop) as { task_id: string; cnt: number }[];

  let total = 0;
  for (const { task_id, cnt } of overgrown) {
    const excess = cnt - perTaskBackstop;
    const result = db
      .prepare(
        `DELETE FROM events
         WHERE task_id = ?
           AND id IN (
             SELECT id FROM events WHERE task_id = ? ORDER BY id ASC LIMIT ?
           )`,
      )
      .run(task_id, task_id, excess);
    total += Number(result.changes);
  }
  return total;
}

export function runEventGc(db: Db, opts: GcOpts): GcReport {
  const zombiesDeleted = deleteZombieSessions(db, opts.zombieThresholdMs);
  const eventsDeleted = deleteConsumedByAll(db);
  const backstopDeleted = trimBackstop(db, opts.perTaskBackstop);
  return { zombiesDeleted, eventsDeleted, backstopDeleted };
}
