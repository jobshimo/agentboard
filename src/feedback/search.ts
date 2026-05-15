import type Database from "better-sqlite3";
import { scoreFeedback } from "./score.js";
import type { FeedbackEntry, FeedbackPayload, SearchContext } from "./types.js";

type Db = InstanceType<typeof Database>;

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 50;

interface RawEventRow {
  id: number;
  task_id: string;
  payload: string;
  created_at: string;
}

function parseRow(row: RawEventRow): FeedbackEntry {
  return {
    id: row.id,
    task_id: row.task_id,
    payload: JSON.parse(row.payload) as FeedbackPayload,
    created_at: row.created_at,
  };
}

export function searchFeedback(
  db: Db,
  context: SearchContext,
  limit?: number,
): FeedbackEntry[] {
  const effectiveLimit = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const rows = db
    .prepare(`SELECT id, task_id, payload, created_at FROM events WHERE type = 'feedback_added' ORDER BY id ASC`)
    .all() as RawEventRow[];

  const entries = rows.map(parseRow);

  const filtered = context.include_same_task
    ? entries
    : entries.filter((e) => e.task_id !== context.task_id);

  const scored = filtered.map((e) => ({ entry: e, score: scoreFeedback(e, context) }));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.entry.created_at.localeCompare(a.entry.created_at);
  });

  return scored.slice(0, effectiveLimit).map((s) => s.entry);
}
