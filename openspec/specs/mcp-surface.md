# MCP Surface Specification

## Purpose

Defines the MCP tool surface, lazy activation protocol, activation persistence, compactness rules, and configuration options for the `agentboard` MCP endpoint.

---

## Requirements

### Requirement: STDIO Transport

The `agentboard mcp` process MUST use `StdioServerTransport` from `@modelcontextprotocol/sdk`. The transport MUST read from `process.stdin` and write to `process.stdout`. The process MUST block until stdin closes, at which point the process MUST exit cleanly.

No Fastify instance, no TCP port binding, and no HTTP endpoints are present in the `agentboard mcp` process.

#### Scenario: MCP client starts `agentboard mcp`

- GIVEN an MCP client (e.g. Claude Code) is configured to launch `agentboard mcp`
- WHEN the MCP client starts the process
- THEN `agentboard mcp` MUST initialize `StdioServerTransport`, call `McpServer.connect(transport)`, and begin serving tool calls over stdin/stdout
- AND the process MUST NOT attempt to open any TCP port or HTTP connection

#### Scenario: MCP client closes the connection

- GIVEN `agentboard mcp` is running and serving tool calls
- WHEN the MCP client closes stdin (session end)
- THEN the `agentboard mcp` process MUST exit cleanly with code 0
- AND any in-flight DB writes MUST complete before exit

---

### Requirement: Session ID Minting

The SDK's `extra.sessionId` is `undefined` over STDIO. The `agentboard mcp` process MUST mint a UUID (version 4) at startup as the canonical session ID for the duration of the process lifetime.

This minted session ID MUST be:
- Stored in `agent_sessions` in the repo's SQLite database upon `activate()` being called.
- Propagated through any context wrapper (`withPiggyback` or equivalent) so all tool handlers receive the correct session ID.
- Stable for the entire process lifetime; it MUST NOT change between tool calls.

#### Scenario: Session ID is stable across tool calls

- GIVEN `agentboard mcp` has minted session ID `abc-123`
- WHEN the agent calls `agentboard.activate()` followed by `task.list()`
- THEN both calls MUST execute with session ID `abc-123`
- AND the `agent_sessions` row MUST reference `abc-123`

#### Scenario: Session ID is unique per process invocation

- GIVEN two separate `agentboard mcp` processes are started (e.g. two agent sessions)
- WHEN each process mints its session ID
- THEN the two IDs MUST be distinct (UUID v4 collision probability is negligible)

---

### Requirement: Repo Binding at Startup

The STDIO process MUST resolve the repo path exactly once at startup, before initializing the transport or opening any DB connection. Repo resolution follows the rules in `launcher.md` requirement `agentboard mcp` Subcommand.

The resolved repo path MUST be:
- Normalized with `path.resolve()`.
- Lowercased on Windows (`process.platform === "win32"`) to match the daemon's DB cache key convention.
- Validated to exist on the filesystem before the transport is initialized.

The DB connection opened by the STDIO process MUST be scoped to this resolved repo path for the entire lifetime of the process.

#### Scenario: STDIO process opens only the repo-scoped DB

- GIVEN `AGENTBOARD_REPO=/projects/foo`
- WHEN `agentboard mcp` starts and a tool call touches the database
- THEN only `<resolved-repo>/.agentboard/db.sqlite` MUST be opened
- AND no other repo's database MUST be accessed

---

### Requirement: Inter-Process Notification

After any event is inserted into the repo's SQLite database by a tool call, the STDIO process MUST attempt a best-effort `POST` to `http://127.0.0.1:7733/internal/notify` with the payload `{ "repo": "<abs-repo-path>", "event_id": <id> }`.

The notification attempt MUST be:
- Fire-and-forget: the STDIO process MUST NOT await the response before returning the tool result to the agent.
- Silent on failure: if the daemon is unreachable (connection refused, timeout, any network error), the STDIO process MUST NOT surface the error to the agent or fail the tool call.
- Non-retried: one attempt per event; no retry queue.

The database write is authoritative. The notification is a realtime-push optimization only.

The target port MUST default to `7733` and MUST be overridable by the `AGENTBOARD_PORT` environment variable.

#### Scenario: Daemon is running — notification delivered

- GIVEN the daemon is running on port 7733
- AND the agent calls `subtask.update(S1, status: "done")`
- WHEN the STDIO process inserts the event and fires the notification
- THEN the daemon MUST receive `POST /internal/notify` with the repo path and event ID
- AND the daemon MUST broadcast to connected WS clients of that repo
- AND the tool result MUST be returned to the agent regardless of whether the POST was acknowledged

#### Scenario: Daemon is not running — silent failure

- GIVEN no daemon is running on port 7733
- AND the agent calls `task.comment(T1, "done")`
- WHEN the STDIO process inserts the event and fires the notification
- THEN the POST MUST fail (connection refused)
- AND the STDIO process MUST NOT propagate the failure to the agent
- AND the tool MUST return a successful result
- AND the event MUST remain in the database for the browser to fetch on its next poll or reconnect

---

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
- AND the subsequent tool list request MUST return the full set of active tools (14 tools)

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

The server MUST expose 14 of the above core tools when active (excluding `activate`/`deactivate`). Tool count MUST NOT exceed this number without a spec change, to protect system prompt token budget.

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

### Requirement: MCP Client Configuration

The canonical MCP client configuration for agentboard is a STDIO command block. An HTTP URL (`http://localhost:7733/mcp`) MUST NOT be documented as a valid MCP endpoint.

Example snippet (normative):

```json
{
  "mcpServers": {
    "agentboard": {
      "command": "npx",
      "args": ["-y", "@jobshimo/agentboard", "mcp"],
      "env": {
        "AGENTBOARD_REPO": "/absolute/path/to/your/repo"
      }
    }
  }
}
```

This snippet works without the daemon running. The daemon is optional for MCP tool use; its absence degrades only realtime WS push to the browser.

#### Scenario: Agent bootstraps MCP without pre-launching the daemon

- GIVEN no `agentboard daemon` process is running
- AND the MCP client is configured with the STDIO snippet above
- WHEN the MCP client starts `agentboard mcp`
- THEN the STDIO process MUST successfully initialize and serve all tool calls
- AND the agent MUST be able to call all 14 tools without any daemon dependency

---

### Requirement: MCP Activation Mode Configuration

The server MUST support three activation modes, configurable in `~/.agentboard/config.yaml` under `mcp.activation`.

| Mode | Behavior |
|------|----------|
| `lazy` | Default. Single tool until `activate()` is called. |
| `always-on` | Full tool set exposed from session start. STDIO transport overrides to `always-on` (no HTTP handshake, no `notifications/tools/list_changed` support). |
| `prompt` | On first tool call, agent asks the user once whether to activate. Not applicable to STDIO (incompatible with absence of handshake protocol). |

#### Scenario: `always-on` mode on HTTP endpoint

- GIVEN `mcp.activation: always-on` in config
- WHEN the server starts and the host requests the tool list
- THEN the full tool set MUST be returned without requiring `agentboard.activate()`

#### Scenario: STDIO transport forces `always-on` mode

- GIVEN `agentboard mcp` is running over STDIO
- WHEN the agent requests the tool list
- THEN the full tool set MUST be returned immediately (no dormant state, no handshake required)
