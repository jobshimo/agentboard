import type { FeedbackEntry, SearchContext } from "./types.js";

const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days in milliseconds
const MAX_RECENCY = 2;

function recencyDecay(createdAt: string): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const halfLives = ageMs / HALF_LIFE_MS;
  return MAX_RECENCY * Math.pow(0.5, halfLives);
}

function severityBoost(severity: string): number {
  if (severity === "failed_in_practice") return 2;
  if (severity === "correction") return 1;
  return 0;
}

function fileOverlapScore(contextPaths: string[], feedbackPaths: string[]): number {
  if (contextPaths.length === 0 || feedbackPaths.length === 0) return 0;
  const contextSet = new Set(contextPaths);
  const matches = feedbackPaths.filter((p) => contextSet.has(p)).length;
  const union = new Set([...contextPaths, ...feedbackPaths]).size;
  return 3 * (matches / union);
}

function keywordOverlap(terms: string[], text: string): number {
  if (terms.length === 0) return 0;
  const lower = text.toLowerCase();
  const matched = terms.some((t) => lower.includes(t.toLowerCase()));
  return matched ? 1 : 0;
}

export function scoreFeedback(entry: FeedbackEntry, context: SearchContext): number {
  const { payload } = entry;

  const workflowMatch = context.workflow_id && payload.workflow_at_capture === context.workflow_id ? 3 : 0;
  const fileOverlap = fileOverlapScore(context.file_paths ?? [], payload.file_paths);
  const taskTypeMatch = context.task_type && payload.target_task_type === context.task_type ? 2 : 0;
  const keyword = keywordOverlap(context.terms ?? [], payload.text);
  const severity = severityBoost(payload.severity);
  const recency = recencyDecay(entry.created_at);

  return workflowMatch + fileOverlap + taskTypeMatch + keyword + severity + recency;
}
