# Event Queue and Coordination Specification

## Purpose

Defines the append-only event queue, per-session cursor, consumer tools, piggy-back delivery, garbage collection, and the complete event type enum.

---

## Requirements

### Requirement: Append-Only Event Table

The event store MUST be an append-only table. Events are NEVER updated or deleted by normal operations. The `id` column MUST be `INTEGER PRIMARY KEY AUTOINCREMENT`, guaranteeing strict monotonic ordering that reflects commit order under SQLite WAL.

The schema MUST include at minimum:

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `task_id` | TEXT | NOT NULL |
| `type` | TEXT | NOT NULL; one of the defined enum values |
| `payload` | JSON | NOT NULL |
| `origin` | TEXT | NOT NULL; one of `human`, `agent`, `system` |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

#### Scenario: Event insertion preserves FIFO ordering

- GIVEN two concurrent producers inserting events E1 and E2
- WHEN both inserts complete
- THEN E1 and E2 MUST have strictly increasing `id` values reflecting their commit order
- AND a consumer reading `ORDER BY id` MUST see them in that order

---

### Requirement: Complete Event Type Enum

The system MUST recognize exactly the following event types. All type values are lowercase with underscores.

| Type | Triggered by | Payload keys (minimum) |
|------|-------------|------------------------|
| `comment_added` | human or agent appending to discussion | `task_id`, `author`, `text` |
| `status_change` | subtask state transition | `task_id`, `subtask_id`, `from_status`, `to_status` |
| `subtask_added` | new subtask created from workflow snapshot at task start | `task_id`, `subtask_id`, `type` |
| `subtask_updated` | subtask `note` or other non-status field updated | `task_id`, `subtask_id`, `field`, `value` |
| `custom_subtask_added` | `task.add_custom_subtask` called | `task_id`, `subtask_id`, `label`, `type` |
| `feedback_added` | `feedback.add` called | `task_id`, `target`, `text`, `severity` |
| `task_completed` | all subtasks in terminal state, task closes | `task_id` |
| `task_blocked` | any subtask transitions to `blocked` | `task_id`, `subtask_id` |
| `agent_notification` | `agentboard.notify_human` called | `task_id` (optional), `urgency`, `text` |
| `pr_comment` | agent records a PR comment arrival from external poll | `task_id`, `pr_url`, `comment_body` |

Additional types MAY be introduced via spec change. The server MUST reject events with unrecognized types.

#### Scenario: Valid event type accepted

- GIVEN a producer attempting to insert an event with `type: "comment_added"`
- WHEN the insert executes
- THEN the event MUST be persisted successfully

#### Scenario: Unknown event type rejected

- GIVEN a producer attempting to insert an event with `type: "card_archived"`
- WHEN the insert executes
- THEN the server MUST reject the insertion and return an error

---

### Requirement: Per-Session Cursor

Each agent session MUST have its own cursor stored in `agent_sessions.last_event_id`. The cursor is monotonically increasing and MUST NEVER reset or decrease.

The `agent_sessions` table MUST include at minimum:

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | TEXT | PRIMARY KEY |
| `last_event_id` | INTEGER | DEFAULT 0 |
| `connected_at` | TIMESTAMP | NOT NULL |
| `last_seen` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

Multiple sessions MUST read independently from the same event queue without interfering with each other.

#### Scenario: Session cursor advances correctly

- GIVEN session S1 with `last_event_id: 10` and events 11, 12, 13 in the queue
- WHEN `poll_events` is called for S1
- THEN events 11, 12, 13 MUST be returned
- AND S1's `last_event_id` MUST be updated to 13

#### Scenario: Two sessions read independently

- GIVEN sessions S1 (`last_event_id: 5`) and S2 (`last_event_id: 10`), with events up to id 15
- WHEN both sessions call `poll_events`
- THEN S1 MUST receive events 6–15, and S2 MUST receive events 11–15
- AND neither session's cursor advance MUST affect the other

---

### Requirement: `poll_events` — Non-Blocking Consumer

`agentboard.poll_events(task_id?)` MUST return immediately with any events accumulated since the session's last cursor position. If no new events exist, it MUST return an empty list without blocking.

After the call, the cursor MUST be advanced to the highest event id returned (or unchanged if empty).

#### Scenario: Events exist

- GIVEN three events since the cursor
- WHEN `poll_events()` is called
- THEN all three events MUST be returned and the cursor MUST advance

#### Scenario: No new events

- GIVEN no events since the cursor
- WHEN `poll_events()` is called
- THEN an empty list MUST be returned immediately and the cursor MUST remain unchanged

---

### Requirement: `wait_for_event` — Long-Poll Consumer

`agentboard.wait_for_event(timeout_ms, task_id?, types?)` MUST:
- Return immediately if pending events matching the filter exist.
- Otherwise, hold the connection open server-side until a matching event arrives OR the timeout expires.
- On timeout, return an empty list without error.
- Advance the cursor to the last event returned (if any).

#### Scenario: Event arrives before timeout

- GIVEN no pending events at call time, timeout of 1800000ms
- WHEN a `status_change` event is inserted 5 seconds after the call
- THEN `wait_for_event` MUST return that event and advance the cursor

#### Scenario: Timeout with no events

- GIVEN no events arrive within the timeout window
- WHEN the timeout expires
- THEN `wait_for_event` MUST return an empty list without error

#### Scenario: Type filter applied

- GIVEN pending events of types `comment_added` and `status_change`
- WHEN `wait_for_event(timeout: 5000, types: ["status_change"])` is called
- THEN only `status_change` events MUST be returned; `comment_added` events MUST be excluded

---

### Requirement: Piggy-Back Event Delivery

When `attention.events_in_response` is `true` (default), every MCP tool response MUST include a `pending_events` field containing any events accumulated since the session's last cursor advance. If no pending events exist, `pending_events` MUST be an empty array (never omitted).

#### Scenario: Tool response includes pending events

- GIVEN `attention.events_in_response: true` and 2 pending events since the cursor
- WHEN the agent calls `task.list()`
- THEN the response MUST include `pending_events: [{...}, {...}]`
- AND the cursor MUST advance to cover those events

---

### Requirement: Garbage Collection — Three-Mechanism Model

The event queue MUST implement exactly three GC mechanisms in priority order:

**Mechanism A — Consumed-by-All (Primary)**

Events MUST be purged only when every currently-active session has consumed them (cursor past the event id). Active is defined as `last_seen` within the zombie threshold.

**Mechanism B — Zombie Session Cleanup**

Sessions with `last_seen` older than the zombie threshold (default: 30 days, configurable) MUST be excluded from the consumed-by-all calculation and then removed from `agent_sessions`. This prevents a disconnected session from blocking GC indefinitely.

**Mechanism C — Hard Backstop**

Per task, a maximum of N events MUST be retained (default: 10000, configurable). When inserting past the limit, the oldest events for that task MUST be purged. This is a safety net; it MUST NOT fire under normal conditions.

Time-based event expiry is explicitly prohibited. Events MUST NEVER be deleted solely because they aged past a time threshold.

#### Scenario: Events purged after all sessions consume

- GIVEN events 1–10 and two sessions S1 and S2 both with `last_event_id >= 10`
- WHEN Mechanism A runs
- THEN events 1–10 MUST be eligible for deletion and MUST be purged

#### Scenario: Zombie session excluded from GC calculation

- GIVEN session S1 (last_seen: 40 days ago, zombie threshold: 30 days) with `last_event_id: 3`
- AND session S2 (active, `last_event_id: 100`)
- WHEN Mechanism A calculates the minimum consumed cursor
- THEN S1 MUST be excluded from the MIN calculation
- AND events up to id 100 MUST be eligible for purging

#### Scenario: Hard backstop fires on pathological task

- GIVEN task T1 with 10001 events and backstop of 10000
- WHEN event 10001 is inserted
- THEN the oldest event for T1 MUST be purged to stay within the 10000 limit
