/**
 * src/events/types.ts
 *
 * Canonical EventType enum and EventOrigin union for the agentboard event
 * queue. Adding a new event type is a single-source change here; the
 * CHECK constraint on events.type is intentionally NOT in SQL (by design
 * decision recorded in design.md §3 notes) so that spec evolution stays
 * in TypeScript, not in migration files.
 */

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

/**
 * Returns true if the given string is a valid EventType.
 * Used in insertEvent to reject unknown types at the application layer.
 */
export function isValidEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}
