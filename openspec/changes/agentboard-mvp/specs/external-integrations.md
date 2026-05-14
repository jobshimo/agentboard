# External Integrations — Server Posture Specification

## Purpose

Defines the server's zero-integration posture, the `external.fetch(ref)` contract for referenced tasks, and the fallback behavior when a required CLI is unavailable.

---

## Requirements

### Requirement: Server Has Zero External Adapters

The server MUST NOT contain any integration code for GitHub, Jira, Linear, or any other external service. No webhooks, polling loops, HTTP clients for external APIs, or tunnel setups.

This is a deliberate architectural choice, not a deferred implementation detail.

#### Scenario: Agent requests external data

- GIVEN task T1 references `github:acme/repo#7`
- WHEN the agent needs fresh metadata from GitHub
- THEN the agent MUST use its own environment (e.g. `gh` CLI) to fetch the data — the server has no mechanism to perform this fetch

---

### Requirement: `external.fetch(ref)` Contract

The system MUST expose `external.fetch(ref)` as part of the active MCP tool set. This tool signals the agent to fetch external data using its own CLI tooling.

`ref` MUST be a reference string in the format `<source>:<identifier>` (e.g. `github:acme/repo#7`, `jira:XYZ-123`, `linear:ABC-456`).

The tool response MUST contain the cached metadata stored in the task (title, link, assignee, status). It MUST NOT make any outbound network calls from the server.

The agent is responsible for using the appropriate CLI to fetch fresh data and may call `task.comment` or `subtask.update` to record the result.

#### Scenario: Agent fetches a referenced GitHub issue

- GIVEN task T1 with reference `github:acme/repo#7` and cached metadata `{title: "Fix login bug", status: "open"}`
- WHEN the agent calls `external.fetch("github:acme/repo#7")`
- THEN the server MUST return the cached metadata from the task record
- AND the server MUST NOT make any call to the GitHub API

#### Scenario: Agent updates cached metadata after CLI fetch

- GIVEN the agent ran `gh issue view 7` in its environment and received updated data
- WHEN the agent calls `task.comment(T1, "Updated status: closed (merged PR #12)")` 
- THEN the comment MUST be appended to the discussion; the agent may also update the cached metadata via a dedicated update call if the API supports it

---

### Requirement: Missing CLI Blocks Subtask

When the agent determines it cannot execute an `agent_hint` because the required CLI is not available in its environment, the agent MUST transition the affected subtask to `blocked`. The human then destrabes it from the UI or chat.

The server MUST support this pattern: `subtask.update(id, status: "blocked", note: "gh CLI not available")` MUST succeed and MUST trigger the standard `status_change` event and WebSocket push.

#### Scenario: `gh` CLI not installed

- GIVEN a subtask with `agent_hint: "Run gh pr checks <pr> --watch"` and `can_agent_complete_alone: true`
- WHEN the agent cannot locate the `gh` CLI in its environment
- THEN the agent MUST call `subtask.update(S1, status: "blocked", note: "gh CLI not available")`
- AND the task MUST transition to `blocked` macro-status
- AND the human MUST receive a WebSocket push via `task_blocked` event

#### Scenario: Human destrabes a blocked subtask

- GIVEN subtask S1 is `blocked` because the required CLI was unavailable
- WHEN the human manually changes the subtask state to `done` in the UI (or instructs the agent via chat)
- THEN S1 MUST transition to `done` and the task MUST resume its normal flow

---

### Requirement: No Webhook or Tunnel Configuration Required

The system MUST function fully without any webhook registration, tunnel setup, or hosted middleware. The setup path is: install NPM package, run command, done.

#### Scenario: Complete human-agent loop without webhooks

- GIVEN a user with no webhook configured and no ngrok/cloudflare tunnel
- WHEN the agent works through a multi-step task that includes CI, PR review, and merge steps
- THEN the agent MUST be able to complete autonomous steps using its own CLI tools
- AND blocked steps MUST be resolved by the human via the web UI or chat
- AND the entire loop MUST complete without any server-side integration calls
