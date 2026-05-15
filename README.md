# agentboard

Local-first task tracking for the human/agent coding loop. One server exposes a Kanban-style web UI for humans and an MCP endpoint for AI agents — both connected to the same SQLite store, updated in realtime.

---

## Quick start

```
npx @jobshimo/agentboard
```

That is the entire install. No global install required. The server starts at `http://localhost:7733`, opens your browser, and the MCP endpoint is live at `http://localhost:7733/mcp`.

**Requirements**: Node >= 20.11.

---

## How it works

- **One process, three surfaces**: web UI at `:7733`, MCP at `:7733/mcp`, REST/WebSocket for the UI.
- **Per-repo storage**: each repo has its own `.agentboard/db.sqlite` (gitignored). Tasks belong to the repo that originated them.
- **Realtime**: when the agent moves a card, the human sees it in the browser immediately via WebSocket push. No polling, no refresh.
- **MCP lazy by default**: the server exposes a single `agentboard.activate()` tool (~200 tokens). Full tool set unlocks on demand. Call `agentboard.deactivate()` to go quiet.
- **No external integrations**: the server knows nothing about GitHub, Jira, or Linear. The agent uses `gh`, `jira`, or `linear` CLIs directly and updates the board via MCP tools.

---

## CLI commands

```
npx @jobshimo/agentboard            # start server, open browser
npx @jobshimo/agentboard init       # copy a workflow template into <repo>/.agentboard/
npx @jobshimo/agentboard export     # dump board state to .agentboard/snapshot/*.md
npx @jobshimo/agentboard --port 8080
npx @jobshimo/agentboard --no-open  # start server without opening browser
npx @jobshimo/agentboard --help
npx @jobshimo/agentboard --version
```

`agentboard init` copies the first `.yaml` file from `~/.agentboard/workflows/` into `<repo>/.agentboard/workflow.yaml`. On the first server launch, the bundled `coding-task` workflow is seeded into `~/.agentboard/workflows/` automatically.

`agentboard export` writes one `.md` file per task to `.agentboard/snapshot/`. Commit the snapshot when you want a versioned record; `db.sqlite` itself stays gitignored.

---

## MCP configuration (Claude Code)

Add to your `claude_desktop_config.json` or MCP server config:

```json
{
  "mcpServers": {
    "agentboard": {
      "command": "npx",
      "args": ["@jobshimo/agentboard", "--no-open"]
    }
  }
}
```

The server must already be running (or you can use the above to launch it as an MCP server process). The MCP endpoint is `http://localhost:7733/mcp`.

**Confirmed working hosts**: Claude Code.

---

## MCP activation modes

Configure in `~/.agentboard/config.yaml`:

```yaml
mcp:
  activation: lazy        # lazy (default) | always-on | prompt
```

- `lazy`: one tool visible until the agent calls `agentboard.activate()`.
- `always-on`: full tool set always exposed.
- `prompt`: agent asks once per session before activating.

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

The following are intentionally out of scope for the current release:

- Multi-user / realtime collaboration between humans.
- Server-side webhooks for CI, Jira, GitHub, or Linear.
- Cross-machine sync (each machine has its own DB; use `export` + git for transfer).
- Mobile UI.
- Authentication or user accounts.
- MCP `sampling/createMessage` push (not portable today).

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
