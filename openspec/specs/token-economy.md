# Token Economy Guarantees Specification

## Purpose

Defines the behavioral guarantees that keep `agentboard` token-efficient across sessions. These are system-level invariants, not implementation suggestions.

---

## Requirements

### Requirement: Compact Default Responses

All MCP tool responses MUST be compact by default. No tool MUST return more data than needed to perform its stated function.

Compact means:
- `task.list` returns only identifiers, titles, macro-status, and current-subtask summary per task. No discussion, no full workflow snapshot.
- `task.get` returns metadata and subtask states. Discussion is excluded unless `include_discussion: true` is explicitly passed.
- `subtask.update` response contains only the updated fields and a confirmation. No full task object.

#### Scenario: `task.list` response is bounded

- GIVEN a board with 20 tasks, each with 50-entry discussions
- WHEN the agent calls `task.list()`
- THEN the response MUST NOT include any discussion entries
- AND total response size MUST NOT grow linearly with discussion length

#### Scenario: `task.get` excludes discussion by default

- GIVEN task T1 with 60 discussion entries and 5 subtasks
- WHEN the agent calls `task.get(T1)` without `include_discussion: true`
- THEN the response MUST include only metadata and subtask states; discussion MUST be absent

---

### Requirement: Updates Are Deltas

Every mutating MCP tool MUST accept and apply partial updates. No tool MUST require the caller to send the full entity state to make a change.

#### Scenario: Subtask status update sends one field

- GIVEN subtask S1 with 5 fields
- WHEN the agent calls `subtask.update(S1, status: "done")`
- THEN only `status` MUST change; all other fields MUST remain as-is
- AND the server MUST NOT require the agent to re-send the unchanged fields

---

### Requirement: No Agent-Side Auto-Polling

The system MUST NOT instruct, encourage, or require the agent to poll `poll_events` on every turn or on a timer. Polling is explicit and agent-initiated.

The `attention.events_in_response` piggy-back mechanism is the default delivery path for ambient event awareness.

#### Scenario: Agent receives events without polling

- GIVEN `attention.events_in_response: true` (default)
- WHEN the agent calls any MCP tool (e.g. `task.get`)
- THEN the response MUST include any pending events in `pending_events`
- AND the agent MUST receive event awareness at zero extra tool-call cost

---

### Requirement: Compressible Discussion

When a task discussion grows beyond 50 entries, the system MUST serve a summarized version by default when `include_discussion: true` is requested. The full thread MUST remain available via an explicit opt-in parameter (e.g. `full_discussion: true`).

The summary MUST be substantially shorter than the full thread. The goal is to prevent re-injecting the complete conversation history into context on every task fetch.

#### Scenario: Long discussion returns summary by default

- GIVEN task T1 with 80 discussion entries
- WHEN the agent calls `task.get(T1, include_discussion: true)`
- THEN the response MUST contain a summary of the discussion, not all 80 raw entries

#### Scenario: Full discussion accessible on demand

- GIVEN task T1 with 80 discussion entries
- WHEN the agent calls `task.get(T1, include_discussion: true, full_discussion: true)`
- THEN all 80 entries MUST be returned

---

### Requirement: Lazy Referenced Data

A task referencing an external system (e.g. `jira:XYZ-123`) MUST store only the minimal cached snapshot: title, status, url, assignee. No additional fields MUST be stored or returned unless explicitly fetched via `external.fetch(ref)`.

#### Scenario: Referenced task returns minimal metadata

- GIVEN task T1 references `jira:XYZ-123` with a full Jira issue behind it
- WHEN the agent calls `task.get(T1)`
- THEN the response MUST contain only the cached fields (title, status, url, assignee)
- AND no full Jira issue payload MUST be present

---

### Requirement: System Prompt Footprint

The MCP server in dormant (`lazy`) state MUST consume no more than approximately 200 tokens in the host's system prompt. In active state, the full tool set of 6–8 tools MUST target approximately 1500–2000 tokens total.

These are behavioral targets, not hard limits. The implementation MUST be measured against these targets during `sdd-verify`.

#### Scenario: Dormant state is token-minimal

- GIVEN MCP activation mode is `lazy` and `agentboard.activate()` has not been called
- WHEN the host constructs its system prompt
- THEN the `agentboard` contribution MUST be at or below 200 tokens

#### Scenario: Active state within budget

- GIVEN the agent has called `agentboard.activate()`
- WHEN the host constructs its system prompt with the full tool set
- THEN the total token cost of all `agentboard` tool definitions MUST be within the 1500–2000 token target range
