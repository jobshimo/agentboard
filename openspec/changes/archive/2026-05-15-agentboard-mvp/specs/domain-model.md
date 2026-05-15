# Domain Model Specification

## Purpose

Defines the core entities — Task, Subtask, and Discussion — their invariants, state machine, and lifecycle rules.

---

## Requirements

### Requirement: Task Types — Referenced vs Local

A task MUST be one of two types:

- **Referenced**: originated in an external system. The task stores a reference string (e.g. `jira:XYZ-123`, `github:org/repo#42`, `linear:ABC-456`) and a minimal cached snapshot of metadata (title, link, assignee, status).
- **Local**: created directly in `agentboard`. No external reference.

Every task, regardless of type, MUST have: a discussion thread, a workflow snapshot, and a set of subtasks.

#### Scenario: Creating a referenced task

- GIVEN the agent or user provides a reference string `github:acme/repo#7`
- WHEN a task is created
- THEN the task MUST store the reference string and MAY store a cached metadata snapshot (title, link, assignee, status)
- AND the task MUST have a discussion thread initialized (empty) and a workflow snapshot applied

#### Scenario: Creating a local task

- GIVEN the agent or user provides a title and no external reference
- WHEN a task is created
- THEN the task MUST be created with `type: local` and no reference string
- AND the task MUST have a discussion thread initialized and a workflow snapshot applied

---

### Requirement: Discussion is Required

Every task MUST have a discussion thread. The discussion is free-form markdown. Entries are appended; they MUST NOT be edited or deleted after creation.

Discussion lives on the parent task. Subtasks MUST NOT have a discussion field.

#### Scenario: Agent appends to discussion

- GIVEN task T1 with an existing discussion entry
- WHEN the agent calls `task.comment(T1, "Decided to use approach X because Y")`
- THEN a new discussion entry MUST be appended with author `agent` and the provided text
- AND the previous entry MUST remain unchanged

#### Scenario: Human appends to discussion via UI

- GIVEN task T1 with an existing discussion
- WHEN the human submits a comment in the task detail view
- THEN a new entry MUST be appended with author `human`

---

### Requirement: Subtask Structure

A subtask MUST have:
- `type` — a string identifying the workflow step type (e.g. `implement`, `commit`, `open-pr`)
- `status` — one of the six valid states (see below)
- `note` — optional free-text annotation or artifact link (commit SHA, PR URL, CI run ID)
- `custom` — boolean; `true` for ad-hoc subtasks, `false` for workflow-snapshot subtasks

A subtask MUST NOT require a free-text body. The discussion thread on the parent task is the long-form communication layer.

#### Scenario: Subtask created from workflow snapshot

- GIVEN a workflow step with `id: commit`, `label: "Commit"`, `can_agent_complete_alone: true`
- WHEN a task is started
- THEN a subtask MUST be created with `type: "commit"`, `status: "pending"`, `custom: false`

#### Scenario: Subtask updated with a note

- GIVEN subtask S1 in `in-progress` state
- WHEN the agent calls `subtask.update(S1, status: "done", note: "sha:abc1234")`
- THEN S1's status MUST be `done` and `note` MUST be `"sha:abc1234"`

---

### Requirement: Exactly Six Subtask States

The system MUST enforce exactly six subtask states. No additional states MAY be introduced without a spec change.

| State | Meaning |
|-------|---------|
| `pending` | Not started; waiting its turn |
| `in-progress` | Agent is actively working on this step |
| `done` | Completed successfully |
| `blocked` | Waiting for human intervention |
| `failed` | Agent attempted and failed; retry is possible |
| `skipped` | Human decided this step does not apply |

`blocked` and `failed` are NOT interchangeable. `blocked` requires human action to proceed. `failed` may be retried by the agent.

#### Scenario: Valid state transition

- GIVEN subtask S1 in `pending` state
- WHEN the agent calls `subtask.update(S1, status: "in-progress")`
- THEN S1 MUST be in `in-progress` state

#### Scenario: Invalid state value rejected

- GIVEN subtask S1 in any state
- WHEN the agent calls `subtask.update(S1, status: "cancelled")`
- THEN the server MUST return an error and S1's state MUST remain unchanged

#### Scenario: `blocked` vs `failed` semantic distinction

- GIVEN a step where `can_agent_complete_alone: false`
- WHEN the agent reaches that step
- THEN the subtask MUST transition to `blocked` (not `failed`)
- AND the human MUST be notified (see event-queue.md and realtime-ui.md)

#### Scenario: Agent retries a `failed` step

- GIVEN subtask S1 in `failed` state
- WHEN the agent calls `subtask.update(S1, status: "in-progress")`
- THEN S1 MUST transition to `in-progress` without requiring human intervention

---

### Requirement: Task Lifecycle States

A task MUST have a macro-level status that reflects its overall progress. This status is derived from subtask states and MUST NOT be set directly.

Derived rules:
- All subtasks `done` or `skipped` → task is `done`
- Any subtask `blocked` → task is `blocked`
- Any subtask `in-progress` (and none `blocked`) → task is `active`
- All subtasks `pending` (none started) → task is `backlog`

#### Scenario: Task auto-completes

- GIVEN task T1 with subtasks S1, S2, S3 all in `done` state
- WHEN the last subtask transitions to `done`
- THEN the task's derived status MUST become `done`
- AND a `task_completed` event MUST be emitted to the event queue
