import type Database from "better-sqlite3";

type Db = InstanceType<typeof Database>;

export type DiscussionAuthor = "human" | "agent" | "system";

export interface DiscussionEntry {
  id: number;
  taskId: string;
  author: DiscussionAuthor;
  body: string;
  tag: string | null;
  createdAt: string;
}

export type DiscussionResult =
  | { type: "entries"; entries: DiscussionEntry[] }
  | { type: "summary"; total: number; summary: string };

const SUMMARY_THRESHOLD = 50;

/**
 * Appends a new discussion entry to the task.
 * Throws with a "task not found" message if the task id is invalid —
 * the FK constraint on discussion_entries would also catch this, but
 * an explicit check gives a cleaner error for the REST/MCP layers.
 */
export function appendEntry(
  db: Db,
  taskId: string,
  author: DiscussionAuthor,
  body: string,
  tag?: string,
): void {
  const task = db.prepare("SELECT id FROM tasks WHERE id = ?").get(taskId);
  if (!task) {
    throw new Error(`task not found: ${taskId}`);
  }

  db.prepare(`
    INSERT INTO discussion_entries (task_id, author, body, tag)
    VALUES (?, ?, ?, ?)
  `).run(taskId, author, body, tag ?? null);
}

// Returns summary mode (not full entries) above SUMMARY_THRESHOLD to avoid bloating MCP tool responses (token-economy.md §discussion).
export function getEntries(
  db: Db,
  taskId: string,
  limit?: number,
): DiscussionResult {
  const total = (
    db
      .prepare("SELECT COUNT(*) AS cnt FROM discussion_entries WHERE task_id = ?")
      .get(taskId) as { cnt: number }
  ).cnt;

  if (total > SUMMARY_THRESHOLD) {
    return {
      type: "summary",
      total,
      summary: `${total} discussion entries — fetch with full_discussion: true to see all`,
    };
  }

  const query = limit !== undefined
    ? db.prepare(
        "SELECT id, task_id, author, body, tag, created_at FROM discussion_entries WHERE task_id = ? ORDER BY id ASC LIMIT ?",
      )
    : db.prepare(
        "SELECT id, task_id, author, body, tag, created_at FROM discussion_entries WHERE task_id = ? ORDER BY id ASC",
      );

  const rows = (
    limit !== undefined ? query.all(taskId, limit) : query.all(taskId)
  ) as Array<{
    id: number;
    task_id: string;
    author: DiscussionAuthor;
    body: string;
    tag: string | null;
    created_at: string;
  }>;

  const entries: DiscussionEntry[] = rows.map((r) => ({
    id: r.id,
    taskId: r.task_id,
    author: r.author,
    body: r.body,
    tag: r.tag,
    createdAt: r.created_at,
  }));

  return { type: "entries", entries };
}

/**
 * Returns all discussion entries for a task without applying the SUMMARY_THRESHOLD.
 * Used when the agent explicitly requests the full thread via `full_discussion: true`.
 */
export function getAllEntries(db: Db, taskId: string): DiscussionResult {
  const rows = (
    db
      .prepare(
        "SELECT id, task_id, author, body, tag, created_at FROM discussion_entries WHERE task_id = ? ORDER BY id ASC",
      )
      .all(taskId)
  ) as Array<{
    id: number;
    task_id: string;
    author: DiscussionAuthor;
    body: string;
    tag: string | null;
    created_at: string;
  }>;

  const entries: DiscussionEntry[] = rows.map((r) => ({
    id: r.id,
    taskId: r.task_id,
    author: r.author,
    body: r.body,
    tag: r.tag,
    createdAt: r.created_at,
  }));

  return { type: "entries", entries };
}
