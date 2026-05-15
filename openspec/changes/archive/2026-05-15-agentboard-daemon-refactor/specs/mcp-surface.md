# Delta Spec: MCP Surface

Delta against `openspec/specs/mcp-surface.md`

---

## Changes Summary

### Added
- STDIO transport replaces HTTP/SSE transport.
- Session ID minting: the STDIO process generates a UUID at startup and uses it as the canonical session ID.
- Repo resolution rules for the STDIO process (cross-reference: `launcher.md` delta REQ-L-03).
- Notification path: STDIO process fires a best-effort `POST /internal/notify` to the daemon after any event insertion.
- `agentboard mcp` config snippet as the canonical MCP client configuration.

### Modified
- Transport: `StreamableHTTPServerTransport` → `StdioServerTransport`.
- Activation flow: `activate(db)` receives a repo-scoped `db` instance resolved at process start; no change to the observable contract for tool callers.
- Tool count reference: updated from "6–8 tools" to match the current 14-tool surface (all tools present in the active tool table of the baseline spec remain unchanged in signature and behavior).

### Removed
- MCP endpoint URL (`http://localhost:7733/mcp`) — there is no longer an HTTP MCP endpoint.
- HTTP/SSE-specific activation handshake — the STDIO transport connects directly via the SDK's `McpServer.connect(transport)` call.
- Any requirement that the agentboard daemon must be running before MCP can be used.

### Unchanged
- All 14 tool contracts: names, signatures, behaviors, return shapes.
- Lazy activation protocol (dormant / active states, `activate()`, `deactivate()`).
- Activation persistence rules.
- Compact response rules.
- Activation mode configuration (`lazy`, `always-on`, `prompt`).

Cross-references: `launcher.md` delta (REQ-L-03, repo resolution, `--repo` flag), `daemon.md` delta (REQ-D-05, `/internal/notify`), `storage.md` delta (REQ-S-01, per-request DB cache).

---

## Requirements

### REQ-M-01: STDIO Transport

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

### REQ-M-02: Session ID Minting

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

### REQ-M-03: Repo Binding at Startup

The STDIO process MUST resolve the repo path exactly once at startup, before initializing the transport or opening any DB connection. Repo resolution follows the rules in `launcher.md` delta REQ-L-03.

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

### REQ-M-04: Inter-Process Notification

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

### REQ-M-05: MCP Client Configuration

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

## Open Questions

None.
