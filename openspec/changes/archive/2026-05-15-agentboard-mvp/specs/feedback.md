# Feedback Specification

## Purpose

Defines the retrospective and in-flight feedback API, severity levels, storage, and surface contract for `feedback.search`.

---

## Requirements

### Requirement: `feedback.add` — Store Feedback

The system MUST provide `feedback.add(target, text, severity?)` callable by the agent (via MCP) or the human (via UI).

| Parameter | Required | Values | Default |
|-----------|----------|--------|---------|
| `target` | yes | task id or subtask id (string) | — |
| `text` | yes | free-form markdown string | — |
| `severity` | no | `info`, `correction`, `failed_in_practice` | `info` |

The feedback MUST be stored as a `feedback_added` event in the event queue. It MUST NOT create a separate database table — the event queue is the canonical store.

#### Scenario: Human adds correction feedback via UI

- GIVEN a completed task T1 with subtask S1
- WHEN the human adds feedback "This approach broke staging" with `severity: correction` targeting T1
- THEN a `feedback_added` event MUST be appended to the event queue with `task_id: T1`, `target: T1`, `text: "This approach broke staging"`, `severity: "correction"`

#### Scenario: Agent adds in-flight feedback

- GIVEN task T1 is active and the agent observes unexpected behavior
- WHEN the agent calls `feedback.add(T1, "Build cache is stale on this machine", severity: "info")`
- THEN a `feedback_added` event MUST be appended to the queue
- AND any sessions watching T1 MUST receive the event on their next `poll_events` or `wait_for_event` call

#### Scenario: Invalid severity rejected

- GIVEN a feedback submission with `severity: "urgent"`
- WHEN `feedback.add` is called
- THEN the server MUST return an error and MUST NOT insert the event

---

### Requirement: Severity Semantics

The system MUST enforce the following three severity levels only.

| Severity | Meaning |
|----------|---------|
| `info` | Neutral observation. Agent should be aware but no correction needed. |
| `correction` | The approach taken was wrong or suboptimal. Agent should not repeat it. |
| `failed_in_practice` | The approach was theoretically valid but failed when executed. Strongest signal. |

#### Scenario: `failed_in_practice` treated as highest signal

- GIVEN stored feedback with `severity: "failed_in_practice"` on task T1
- WHEN `feedback.search` returns results for a related context
- THEN entries with `severity: "failed_in_practice"` MUST be surfaced before entries with lower severity, all else being equal

---

### Requirement: `feedback.search` — Surface Prior Feedback

The system MUST provide `feedback.search(context)` that returns a list of prior feedback entries relevant to the given context.

`context` MAY include any combination of: current task id, current workflow id, file paths being worked on, or keyword terms.

The relevance heuristic MUST be designed in `sdd-design`. This spec defines only the behavioral contract:

- MUST return zero or more feedback entries from the event queue with `type: feedback_added`.
- MUST rank results so that higher-severity entries appear first among equally-relevant candidates.
- MUST NOT return feedback from unrelated tasks when no relevance signal exists.
- SHOULD limit the default response to 5 entries to respect token budget.
- MUST allow callers to request more results via a `limit` parameter.

#### Scenario: Relevant feedback found

- GIVEN prior `feedback_added` events for tasks that share the workflow `feature` with the current context
- WHEN the agent calls `feedback.search({workflow_id: "feature"})`
- THEN one or more feedback entries MUST be returned, most-severe first

#### Scenario: No relevant feedback found

- GIVEN no prior `feedback_added` events exist
- WHEN the agent calls `feedback.search({task_id: "T99"})`
- THEN an empty list MUST be returned without error

#### Scenario: Default result limit respected

- GIVEN 20 relevant feedback entries
- WHEN `feedback.search` is called without a `limit` parameter
- THEN at most 5 entries MUST be returned

#### Scenario: Custom limit honored

- GIVEN 20 relevant feedback entries
- WHEN `feedback.search({limit: 10})` is called
- THEN at most 10 entries MUST be returned

---

### Requirement: Feedback on Closed Tasks

Feedback MUST be addable to a completed or closed task at any time. Task completion MUST NOT lock the feedback mechanism.

#### Scenario: Feedback added after task closes

- GIVEN task T1 in `done` state
- WHEN the human adds feedback targeting T1
- THEN the `feedback_added` event MUST be persisted successfully regardless of T1's status
