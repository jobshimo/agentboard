# Workflow Configuration Specification

## Purpose

Defines how workflow YAML files are discovered, validated, applied to tasks, and snapshotted. Covers global vs per-repo scope, field semantics, and ad-hoc subtask extension.

---

## Requirements

### Requirement: Global Workflow Directory

The system MUST load workflow definitions from `~/.agentboard/workflows/*.yaml` by default. Every `.yaml` file in that directory is treated as one workflow definition.

#### Scenario: Global workflow available

- GIVEN a file `~/.agentboard/workflows/feature.yaml` with a valid workflow definition
- WHEN the server starts
- THEN the workflow MUST be available for selection when creating a new task

#### Scenario: No global workflows directory

- GIVEN `~/.agentboard/workflows/` does not exist
- WHEN the server starts
- THEN the server MUST start successfully and SHOULD log a warning that no workflows are configured

---

### Requirement: Per-Repo Override via Explicit Copy

A repo MAY opt into a custom workflow by running `agentboard init`, which copies a chosen global template into `<repo>/.agentboard/workflow.yaml`.

The copy is explicit and permanent. The server MUST NOT merge the global template with the repo file. The repo file wins in its entirety.

#### Scenario: Repo file overrides global

- GIVEN `~/.agentboard/workflows/feature.yaml` exists globally AND `<repo>/.agentboard/workflow.yaml` exists
- WHEN the server loads workflows for that repo
- THEN only the repo-local file MUST be used; the global file MUST be ignored for this repo

#### Scenario: User edits global after repo copy

- GIVEN `agentboard init` was run and produced `<repo>/.agentboard/workflow.yaml`
- WHEN the user later edits `~/.agentboard/workflows/feature.yaml`
- THEN active tasks in that repo MUST NOT be affected; the repo file remains unchanged until the user explicitly re-runs `agentboard init`

---

### Requirement: Workflow File Schema

Every workflow YAML file MUST conform to the following schema. The system MUST reject files that violate it and MUST surface a human-readable validation error.

| Field | Level | Required | Type | Meaning |
|-------|-------|----------|------|---------|
| `id` | workflow | yes | string | Unique identifier for the workflow |
| `label` | workflow | yes | string | Human-readable name |
| `steps` | workflow | yes | array | Ordered list of step definitions |
| `id` | step | yes | string | Unique within the workflow |
| `label` | step | yes | string | Human-readable step name |
| `can_agent_complete_alone` | step | yes | boolean | Whether the agent can finish this step without human input |
| `blocks_next` | step | no | boolean | If true, downstream steps MUST NOT start while this step is pending or failed |
| `triggered_by` | step | no | string | Event name that creates this subtask; step is not created upfront when set |
| `agent_hint` | step | no | string | Free-form text hint to the agent on how to execute this step. NOT a parsed DSL. |

#### Scenario: Valid workflow file

- GIVEN a YAML file with `id`, `label`, and at least one step containing `id`, `label`, and `can_agent_complete_alone`
- WHEN the server loads it
- THEN the workflow MUST be registered without error

#### Scenario: Missing required field

- GIVEN a YAML file where a step is missing `can_agent_complete_alone`
- WHEN the server loads it
- THEN the server MUST reject the file and MUST log or surface a validation error naming the missing field

#### Scenario: `blocks_next` semantics

- GIVEN a task whose workflow has step A with `blocks_next: true` and step B after A
- WHEN step A is in `pending` or `failed` state
- THEN step B MUST NOT transition to `in-progress`

#### Scenario: `triggered_by` step deferred creation

- GIVEN a workflow step with `triggered_by: pr_comment`
- WHEN a task is started
- THEN that subtask MUST NOT be created at task start time
- AND it MUST be created only when an event of type `pr_comment` is recorded for that task

---

### Requirement: Workflow Snapshot Immutability

When a task starts, the entire workflow definition MUST be frozen into the task record. Changes to the workflow YAML after task creation MUST NOT affect in-flight tasks.

#### Scenario: Workflow edited while task is active

- GIVEN task T1 was started with workflow snapshot W1 (containing steps A, B, C)
- WHEN the user edits the global workflow to add step D
- THEN T1 MUST continue to show and execute only steps A, B, C from its snapshot
- AND new tasks created after the edit MUST include step D

---

### Requirement: Custom Ad-Hoc Subtasks

The system MUST allow adding ad-hoc subtasks to a running task via `task.add_custom_subtask(task_id, label, type?)`. These subtasks MUST be marked `custom: true` and MUST be independent of the immutable workflow snapshot.

#### Scenario: Agent adds a custom subtask

- GIVEN task T1 is active with its immutable workflow snapshot
- WHEN the agent calls `task.add_custom_subtask(T1, "Write migration script", "implement")`
- THEN a new subtask MUST appear on T1 with `custom: true`, starting in `pending` state
- AND the workflow snapshot MUST remain unmodified

#### Scenario: Custom subtask is distinguishable from snapshot subtasks

- GIVEN task T1 has both snapshot subtasks and a custom subtask
- WHEN the UI or agent retrieves task T1
- THEN each custom subtask MUST have `custom: true` in the response; snapshot subtasks MUST have `custom: false` or omit the field
