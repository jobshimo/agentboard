# MCP Surface Specification

## Purpose

Defines the MCP tool surface, lazy activation protocol, activation persistence, compactness rules, and configuration options for the `agentboard` MCP endpoint.

---

## Requirements

### Requirement: Lazy Activation by Default

In `lazy` mode (default), the MCP server MUST expose exactly one tool before activation: `agentboard.activate()`. The system prompt footprint in this dormant state MUST be approximately 200 tokens or less.

When `agentboard.activate()` is called:
1. The server MUST flip to active state.
2. The server MUST emit the standard MCP notification `notifications/tools/list_changed`.
3. The host re-requests the tool list; the full tool set MUST then be available.

#### Scenario: Dormant state — only one tool visible

- GIVEN MCP activation mode is `lazy` and `agentboard.activate()` has not been called
- WHEN the host requests the tool list
- THEN exactly one tool MUST be returned: `agentboard.activate()`

#### Scenario: Activation exposes full tool set

- GIVEN MCP activation mode is `lazy`
- WHEN the agent calls `agentboard.activate()`
- THEN the server MUST emit `notifications/tools/list_changed`
- AND the subsequent tool list request MUST return the full set of active tools (6–8 tools)

#### Scenario: Deactivation returns to dormant

- GIVEN the MCP server is in active state
- WHEN the agent calls `agentboard.deactivate()`
- THEN the server MUST return to dormant state, exposing only `agentboard.activate()`

---

### Requirement: Activation Persistence

Activation MUST persist until explicitly deactivated via `agentboard.deactivate()` or the session ends. The server MUST NOT auto-deactivate based on inactivity timers or elapsed time.

#### Scenario: Long idle session stays active

- GIVEN the agent called `agentboard.activate()` and then made no MCP calls for 60 minutes
- WHEN the agent calls `task.list()`
- THEN the tool MUST succeed; the server MUST still be in active state

---

### Requirement: Active Tool Set

When active, the server MUST expose the following tools. All tool names and behaviors are stable contracts.

| Tool | Signature | Behavior |
|------|-----------|----------|
| `task.list` | `(filter?)` | Returns a compact list of tasks. Full details fetched via `task.get`. |
| `task.get` | `(id, include_discussion?)` | Returns task metadata + subtasks. Discussion is optional and MUST default to excluded. |
| `task.start` | `(id)` | Moves the first `pending` subtask to `in-progress`. |
| `task.complete` | `(id)` | Marks the task as done. All subtasks MUST be in terminal state or this MUST fail. |
| `task.comment` | `(id, text)` | Appends an entry to the task's discussion thread with author `agent`. |
| `task.add_custom_subtask` | `(id, label, type?)` | Adds a custom subtask marked `custom: true`. |
| `subtask.update` | `(id, status, note?)` | Delta update: MUST change only the provided fields. MUST NOT replace the full subtask object. |
| `feedback.add` | `(target, text, severity?)` | Adds retrospective or in-flight feedback. See feedback.md. |
| `agentboard.poll_events` | `(task_id?)` | Non-blocking event poll. See event-queue.md. |
| `agentboard.wait_for_event` | `(timeout_ms, task_id?, types?)` | Long-poll for events. See event-queue.md. |
| `agentboard.notify_human` | `(urgency, text)` | Sends a notification to the UI. `urgency` MUST be one of: `info`, `warning`, `blocked`. |
| `agentboard.activate` | `()` | Activates the full tool set. Always available regardless of state. |
| `agentboard.deactivate` | `()` | Returns to dormant state. Only available when active. |

The server MUST expose between 6 and 8 of the above core tools (excluding `activate`/`deactivate`) when active. Tool count MUST NOT exceed this range without a spec change, to protect system prompt token budget.

#### Scenario: `task.get` excludes discussion by default

- GIVEN task T1 with a 30-entry discussion thread
- WHEN the agent calls `task.get(T1)` without `include_discussion: true`
- THEN the response MUST include task metadata and subtask states
- AND the discussion MUST be omitted from the response

#### Scenario: `task.get` includes discussion on request

- GIVEN task T1 with a 30-entry discussion thread
- WHEN the agent calls `task.get(T1, include_discussion: true)`
- THEN the response MUST include the discussion entries

---

### Requirement: Updates Are Deltas

All update tools MUST apply only the fields explicitly provided. Full-object replacement is prohibited.

#### Scenario: Partial subtask update

- GIVEN subtask S1 with `status: "in-progress"` and `note: ""`
- WHEN the agent calls `subtask.update(S1, status: "done")`
- THEN `status` MUST become `done` and `note` MUST remain unchanged

---

### Requirement: Compact Responses

All tool responses MUST be compact by default. The following compactness rules are non-negotiable:

1. `task.get()` returns metadata + subtask states. Discussion is separate.
2. Updates are deltas, never full-object replace.
3. The agent MUST NOT auto-poll; explicit `poll_events` or `wait_for_event` are required.
4. If a task discussion exceeds 50 entries, `task.get` with `include_discussion: true` MUST return a summary by default; the full thread MUST be available via a dedicated parameter (e.g. `full_discussion: true`).
5. Referenced tasks store only title/status/url/assignee. Additional fields require `external.fetch(ref)`.

#### Scenario: Discussion summary at 50+ entries

- GIVEN task T1 with 60 discussion entries
- WHEN the agent calls `task.get(T1, include_discussion: true)`
- THEN the response MUST include a summarized version of the discussion, not all 60 raw entries

---

### Requirement: MCP Activation Mode Configuration

The server MUST support three activation modes, configurable in `~/.agentboard/config.yaml` under `mcp.activation`.

| Mode | Behavior |
|------|----------|
| `lazy` | Default. Single tool until `activate()` is called. |
| `always-on` | Full tool set exposed from session start. |
| `prompt` | On first tool call, agent asks the user once whether to activate. |

#### Scenario: `always-on` mode

- GIVEN `mcp.activation: always-on` in config
- WHEN the server starts and the host requests the tool list
- THEN the full tool set MUST be returned without requiring `agentboard.activate()`

#### Scenario: `prompt` mode — user approves

- GIVEN `mcp.activation: prompt`
- WHEN the agent makes its first MCP call and the user confirms activation
- THEN the server MUST activate and expose the full tool set

#### Scenario: `prompt` mode — user declines

- GIVEN `mcp.activation: prompt`
- WHEN the agent makes its first MCP call and the user declines activation
- THEN the server MUST remain dormant and the call MUST return a response indicating agentboard is not active
