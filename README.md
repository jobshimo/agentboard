# agentboard

Local-first task tracking for the human/agent coding loop. A shared web UI for humans and an MCP STDIO entry point for AI agents — both backed by the same SQLite store per repo, updated in realtime via a global HTTP daemon.

---

## Quick start

```
npx @jobshimo/agentboard
```

No global install required. Opens the web UI at `http://localhost:7733`. The daemon stays running globally; any number of agent sessions can talk to it simultaneously.

**Requirements**: Node >= 20.11.

---

## Two-process architecture

| Process | Transport | Lifetime | Repo scope |
|---------|-----------|----------|------------|
| `agentboard mcp` | STDIO | per agent session | single repo (env or flag) |
| `agentboard` (daemon) | HTTP :7733 | one per machine | all repos |

The daemon handles the web UI, REST API, and WebSocket push. Each `agentboard mcp` process talks to the daemon via a loopback HTTP notify call after inserting events. If the daemon is not running, tool calls still work (DB is authoritative); only WS push to the browser is degraded.

---

## MCP configuration (Claude Code, Cursor, etc.)

Add to your `mcp.json` (Claude Code) or equivalent:

```json
{
  "mcpServers": {
    "agentboard": {
      "command": "npx",
      "args": ["@jobshimo/agentboard", "mcp"],
      "env": {
        "AGENTBOARD_REPO": "${workspaceFolder}"
      }
    }
  }
}
```

This single snippet works in any repo without preflight. The `AGENTBOARD_REPO` environment variable tells the MCP process which repo to scope itself to. Alternatively pass `--repo /absolute/path`.

**Confirmed working hosts**: Claude Code.

---

## CLI commands

```
npx @jobshimo/agentboard                  # start daemon, open browser
npx @jobshimo/agentboard daemon           # alias for start
npx @jobshimo/agentboard mcp              # STDIO MCP (for mcp.json, not manual)
npx @jobshimo/agentboard mcp --repo /path # explicit repo override
npx @jobshimo/agentboard stop             # graceful SIGTERM + cleanup
npx @jobshimo/agentboard status           # print port, PID, repos, uptime
npx @jobshimo/agentboard init             # copy a workflow template into <repo>/.agentboard/
npx @jobshimo/agentboard export           # dump board state to .agentboard/snapshot/*.md
npx @jobshimo/agentboard --port 8080
npx @jobshimo/agentboard --no-open        # start daemon without opening browser
npx @jobshimo/agentboard --help
npx @jobshimo/agentboard --version
```

`agentboard init` copies the first `.yaml` file from `~/.agentboard/workflows/` into `<repo>/.agentboard/workflow.yaml`. On the first daemon launch, the bundled `coding-task` workflow is seeded into `~/.agentboard/workflows/` automatically.

`agentboard export` writes one `.md` file per task to `.agentboard/snapshot/`. Commit the snapshot when you want a versioned record; `db.sqlite` itself stays gitignored.

---

## How it works

- **Global daemon, per-repo DB**: the daemon (`:7733`) holds a `Map<repoPath, Db>` in memory. Every REST request must carry `?repo=<abs-path>`. The daemon opens and caches the SQLite connection on first access.
- **STDIO MCP process**: `agentboard mcp` resolves repo from `AGENTBOARD_REPO` env, opens the DB, and connects a `StdioServerTransport`. No Fastify, no WebSocket — cold start in ~200ms.
- **Realtime**: after each MCP tool call that inserts an event, the STDIO process POSTs a fire-and-forget notify to the daemon (`POST /internal/notify`, loopback only). The daemon re-fetches the event and pushes it to all WS clients subscribed to that repo.
- **Repo switching in the UI**: the TopBar dropdown shows all repos the daemon has seen. Switching triggers a WS reconnect with `?repo=<new>` and a board re-fetch.
- **Resilient**: daemon down → tool calls still work (DB authoritative); WS push degraded only.

---

## Lifecycle

```
agent session start
  └─ agentboard mcp (STDIO)
       ├─ resolves AGENTBOARD_REPO
       ├─ opens ~/.agentboard/db.sqlite (WAL)
       ├─ mints UUID session ID
       ├─ connects StdioServerTransport
       └─ on every insertEvent → POST /internal/notify (fire-and-forget)

daemon (long-lived)
  ├─ GET  /api/health        → { ok, pid, port, uptime_ms, version }
  ├─ GET  /api/daemon/repos  → { repos: [{path, lastSeenAt}] }
  ├─ POST /internal/notify   → loopback only; re-fetches event → WS push
  ├─ GET  /api/tasks?repo=   → per-repo task list
  ├─ GET  /ws?repo=          → WebSocket (repo-scoped push)
  └─ ...all other REST routes carry ?repo=
```

---

## MCP activation modes

Configure in `~/.agentboard/config.yaml`:

```yaml
mcp:
  activation: lazy        # lazy (default) | always-on | prompt
```

For STDIO (`agentboard mcp`), the activation mode is always `always-on` — the full tool set is available immediately without calling `agentboard.activate()`.

---

## Troubleshooting

**`agentboard mcp` exits with "repo not initialized"**  
Run `agentboard init` in the project directory first, then retry.

**`agentboard status` shows "daemon not running"**  
Run `npx @jobshimo/agentboard` to start the daemon, then retry.

**Port `:7733` occupied by another process**  
Run `agentboard status` — if ok=true the daemon is ours. If not, `lsof -i :7733` to find the occupying process, then `agentboard --port 8080` to use a different port.

**Tools work but no WS push in browser**  
The daemon must be running for WS push. Start it with `npx @jobshimo/agentboard` in any terminal.

---

## Workflow files

Workflows define the steps a task goes through. Default location: `~/.agentboard/workflows/*.yaml`. A repo can override with `<repo>/.agentboard/workflow.yaml` via `agentboard init`.

Bundled example (`coding-task`):

```yaml
id: coding-task
label: Coding Task

steps:
  - id: implement
    label: Implement
    can_agent_complete_alone: true

  - id: tests
    label: Write Tests
    can_agent_complete_alone: true
    blocks_next: true

  - id: review
    label: Review
    can_agent_complete_alone: false   # human must unblock this

  - id: commit
    label: Commit & Push
    can_agent_complete_alone: true
```

`can_agent_complete_alone: false` is a first-class constraint. The agent transitions that subtask to `blocked` and the human unblocks it from the UI or by chat.

---

## Not in v1

- Multi-user / realtime collaboration between humans.
- Server-side webhooks for CI, Jira, GitHub, or Linear.
- Cross-machine sync (each machine has its own DB; use `export` + git for transfer).
- Mobile UI.
- Authentication or user accounts.
- Auto-spawn daemon from `agentboard mcp` (starts cold, notifies daemon if running).

---

## Development

See [DESIGN.md](./DESIGN.md) for the full product specification and architecture decisions.

```
pnpm install
pnpm dev:server   # Fastify server (tsx watch)
pnpm dev:web      # Vite SPA (separate process)
pnpm test
```

---

## License

MIT
