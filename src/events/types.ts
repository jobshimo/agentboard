// CHECK constraint on events.type is intentionally NOT in SQL (design.md §3) — type validation lives here so spec evolution stays in TypeScript, not in migration files.
export const EVENT_TYPES = [
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

export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_ORIGINS = ["human", "agent", "system"] as const;

export type EventOrigin = (typeof EVENT_ORIGINS)[number];

export function isValidEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}
