# Realtime UI Contract Specification

## Purpose

Defines the WebSocket push contract between the server and the browser UI: what triggers pushes, what the payload contains, and the expected client behavior.

Note: UI visual layout, component structure, and design language are delegated to the external design agent (BRIEF-DESIGN.md). This spec defines the server-side push contract and the minimum required browser behavior only.

---

## Requirements

### Requirement: WebSocket Push on DB Change

The server MUST push a notification to all connected browser clients whenever the database state changes in a way that affects the board or task detail views. The push is a signal — not a full data payload. The browser MUST re-fetch the affected entity lazily.

#### Scenario: Agent updates a subtask

- GIVEN a browser has an open WebSocket connection and is viewing the board
- WHEN the agent calls `subtask.update(S1, status: "done")`
- THEN the server MUST push a `subtask_changed` message to all connected browsers containing at minimum the affected `task_id` and `subtask_id`
- AND the browser MUST re-fetch the relevant task data to update its view

#### Scenario: Human adds a comment via another browser tab

- GIVEN two browser tabs both connected via WebSocket
- WHEN the human adds a comment in tab A
- THEN tab B MUST receive a push and update its discussion view without requiring a manual refresh

---

### Requirement: Push Message Shape

Each WebSocket push message MUST conform to the following minimum shape:

```
{
  "event": "<event_type>",   // string; maps to the event-queue type enum
  "task_id": "<id>",         // string; the affected task (may be null for global events)
  "entity_ids": ["<id>"]     // array of affected entity ids (subtask ids, etc.)
}
```

The browser uses `entity_ids` to know which entities to re-fetch. Full entity data MUST NOT be embedded in the push message.

#### Scenario: Push message is minimal

- GIVEN a `status_change` event for subtask S1 on task T1
- WHEN the server pushes the notification
- THEN the message MUST include `event: "status_change"`, `task_id: "T1"`, and `entity_ids: ["S1"]`
- AND the message MUST NOT include the full subtask object, discussion content, or workflow snapshot

---

### Requirement: Events That MUST Trigger a Push

The following event types MUST trigger a WebSocket push to all connected browser sessions:

| Event Type | Reason |
|-----------|--------|
| `comment_added` | Discussion updated; chat thread must refresh |
| `status_change` | Subtask state changed; card must move or update |
| `subtask_added` | New subtask visible on task detail |
| `subtask_updated` | Subtask note or artifact link changed |
| `custom_subtask_added` | New custom subtask appeared on card |
| `feedback_added` | Feedback indicator needs updating |
| `task_completed` | Task moves to done column |
| `task_blocked` | Task moves to blocked state; badge appears |
| `agent_notification` | Notification badge and toast must appear |

Events with `origin: agent` and `origin: system` MUST also trigger pushes. Pushes are not limited to human-originated events.

#### Scenario: Agent action updates the board in realtime

- GIVEN the human is viewing the board
- WHEN the agent calls `task.start(T1)` (which transitions the first subtask to `in-progress`)
- THEN the server MUST emit a `status_change` event AND push a WebSocket notification
- AND the board MUST reflect the updated state within the browser's next render cycle after re-fetch

---

### Requirement: Connection Lifecycle

The browser MUST attempt to reconnect automatically if the WebSocket connection drops. The server MUST accept reconnections without requiring a full page reload.

On reconnection, the browser SHOULD re-fetch the current board state to reconcile any changes that occurred while disconnected.

#### Scenario: Server restart while browser is open

- GIVEN the browser has an active WebSocket connection
- WHEN the server restarts
- THEN the browser MUST detect the disconnection and attempt reconnection
- AND upon reconnection MUST re-fetch board state to display any changes

---

### Requirement: `agentboard.notify_human` Push

When the agent calls `agentboard.notify_human(urgency, text)`, the server MUST:
1. Insert an `agent_notification` event in the event queue.
2. Push a WebSocket notification to all connected browsers with `event: "agent_notification"` and the urgency level.

The browser MUST display the notification prominently. The `urgency` field MUST be one of: `info`, `warning`, `blocked`.

#### Scenario: Agent signals human intervention required

- GIVEN the agent has reached a step with `can_agent_complete_alone: false`
- WHEN the agent calls `agentboard.notify_human("blocked", "Need approval for merge")`
- THEN a WebSocket push with `urgency: "blocked"` MUST be delivered to all connected browsers
- AND the UI MUST display a notification distinguishable from `info` urgency

#### Scenario: No browsers connected

- GIVEN no browser tab has an active WebSocket connection
- WHEN the agent calls `agentboard.notify_human("warning", "CI is red")`
- THEN the event MUST be persisted in the event queue
- AND the server MUST NOT error; the notification will be visible when the browser reconnects and re-fetches state
