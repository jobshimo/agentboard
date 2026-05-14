# Proposal — agentboard-mvp

> SDD proposal for the initial implementation of `agentboard`. This is a lift-and-reframe of `DESIGN.md` (the pre-SDD product spec the user wrote before any code) into SDD proposal format. The product rationale, architectural shape, and non-negotiables originate there. Anything new in this proposal is explicitly marked.

## Summary

`agentboard` is a **local-first state machine of an AI agent's coding work** with a human-facing discussion layer on top. One process exposes three surfaces (Web UI, MCP endpoint, REST/WS) on `http://localhost:7733`, backed by a SQLite database living inside the repo it describes (`<repo>/.agentboard/db.sqlite`). It is distributed via NPM (`npx @jobshimo/agentboard`) and is **not** a Jira/Trello clone — it is shared infrastructure used directly by both the human and the agent during multi-step, cross-session coding tasks.

The MVP delivers the smallest end-to-end vertical that makes the human↔agent loop work in practice: per-repo storage, YAML workflows with snapshot immutability, six-state subtasks, a Kanban-style realtime board, MCP lazy activation, the FIFO event queue with consumed-by-all GC, and retrospective feedback. UI/CLI surface design is delegated to the design agent under `BRIEF-DESIGN.md` and is an input to the later `sdd-design` phase.

## Intent

### Problem

The previous local task tracker (`TaskBoard`) fails structurally for the human↔agent coding loop:

1. **Locked DB**: SQLite is held open by a desktop app, so seeding/updating from agents requires bypassing the app entirely.
2. **Cards float**: tasks live machine-locally, disconnected from the repo they describe. Clone the repo on another machine → tasks are gone.
3. **Loop is broken**: the agent cannot reliably move cards; the human cannot easily inject feedback at the level the agent will actually read.

### Why now

The user is starting `agentboard` from a clean slate. There is no installed base to preserve, no migration story, no users to break. The only artifact in the repo today is `DESIGN.md` (the pre-SDD spec) and `BRIEF-DESIGN.md` (the UI/CLI scope contract for the external design agent). This is the moment to formalize the design into SDD artifacts before any code is written — concept-first delivery is a project non-negotiable.

### Success looks like

- An agent can call `agentboard.activate()` and, with ~8 tools, drive a multi-step task end-to-end without losing context across sessions.
- A human running `npx @jobshimo/agentboard` inside a repo gets a Kanban-style board at `http://localhost:7733` that reflects the agent's actions in realtime (no refresh).
- When the agent enters a state it cannot leave alone (`can_agent_complete_alone: false`, missing CLI, ambiguous decision), the human destrabes from UI or chat and the agent resumes — no webhook, no tunnel, no hosted service.
- A task's discussion survives across sessions; decisions are recorded, not re-debated.
- Cards are inseparable from their repo: `git clone` brings the snapshot, `agentboard` rehydrates state.

### Non-goals for this MVP

Explicitly NOT in v1 (from DESIGN.md §13): multi-user/realtime collaboration between humans, server-side webhooks for CI/Jira/etc., MCP sampling-based push, tunnels/hosted services, cross-machine sync, mobile UI, auth/user accounts.

## Scope

### In scope (MVP)

| Area | What |
|------|------|
| Storage | SQLite at `<repo>/.agentboard/db.sqlite` (canonical); markdown is a derived view via `GET /api/tasks/:id/markdown`; `agentboard export` dumps snapshot under `.agentboard/snapshot/`; `db.sqlite` is gitignored. |
| Workflow config | YAML workflows at `~/.agentboard/workflows/*.yaml` (global) with optional `<repo>/.agentboard/workflow.yaml` override (explicit copy via `agentboard init`, no merge). Per-task **immutable snapshot** at task start. Ad-hoc custom subtasks allowed via `task.add_custom_subtask(...)`. |
| Domain | Task (referenced or local) + Subtask (six states: `pending`, `in-progress`, `done`, `blocked`, `failed`, `skipped`) + Discussion (markdown on the parent task). |
| Web UI | Kanban-style board, task detail with discussion, settings/workflows view, global chrome. Single-page app, desktop-only, dark + light, English-first. Specific structure delegated to design agent (`BRIEF-DESIGN.md`). |
| Realtime | WebSocket push from server to browser on DB writes. |
| MCP | Lazy activation by default (`agentboard.activate()` is the only tool until called). Target tool surface ~6–8 tools, compact responses, delta updates only. Compactness rules from DESIGN.md §8.4 are non-negotiable. |
| Event queue | Append-only `events` table, strict FIFO via `INTEGER PRIMARY KEY AUTOINCREMENT`, per-session cursor in `agent_sessions`. Tools: `poll_events`, `wait_for_event`, plus piggy-back on responses. GC strategy: consumed-by-all + zombie-session cleanup + hard backstop. Time-based event expiry is rejected. |
| Retrospective feedback | `feedback.add(target, text, severity?)` stored as `feedback_added` event; `feedback.search(context)` surfaces relevant prior feedback at task start. |
| CLI | `npx @jobshimo/agentboard` launcher (plain text, ASCII-safe), `init`, `export`, `--port`, `--no-open`, `--help`, `--version`. Detailed UX delegated to design agent. |
| External integration model | Server has **zero** external adapters. Agent uses `gh`/`jira`/`linear` CLIs in its own environment. Subtasks that need an external CLI block when it's missing; human destrabes from UI/chat. |

### Out of scope (MVP)

From DESIGN.md §13, restated:

- Multi-user / realtime collaboration between humans.
- Server-side webhooks (CI/Jira/etc).
- MCP `sampling/createMessage` push (host support too weak today).
- Tunnels, hosted services, cross-machine sync.
- Mobile UI / responsive beyond what comes for free.
- Auth, user accounts, permissions.
- Time-based event expiry (rejected by design — events are GC'd by consumption, not by age).

## Approach

### Architectural shape

A **single local Node process** (specific runtime/framework deferred — see "Deferred decisions") exposes three surfaces concurrently:

1. **Web UI** at `/` — single-page app served as static assets.
2. **MCP endpoint** at `/mcp` — for agents to drive the board.
3. **REST + WebSocket** at `/api/*` and `/ws` — for the Web UI itself.

All three speak to one SQLite database. SQLite WAL mode handles concurrent writes from agent + UI safely. DB writes emit internal events that fan out to (a) WebSocket clients (UI) and (b) the `events` table (agent queue).

### Storage model — SQLite canonical, markdown derived

- **Canonical**: `<repo>/.agentboard/db.sqlite`. Per-repo. In `.gitignore`.
- **Derived view**: markdown rendered on demand by the server (`GET /api/tasks/:id/markdown`) and via `agentboard export` to `.agentboard/snapshot/*.md`.
- **Git story**: the user (or a hook) commits the snapshot when they want a versioned record. The DB itself is regenerable.

Rationale: bulk migrations, cross-card queries, realtime push, and concurrent-write safety are all trivial in SQL and painful with markdown-as-source-of-truth. Markdown-as-rendered keeps the "committable / portable" benefit without the consistency tax.

### Workflow snapshot immutability

When a task starts, its workflow YAML is **frozen into the task row**. Editing the global workflow later affects only new tasks. Existing tasks continue under their snapshot. Ad-hoc subtasks are permitted via `task.add_custom_subtask(...)` and marked `custom: true`. This pattern is load-bearing: it lets workflows evolve without retroactively breaking in-flight work.

### Six subtask states, no more

`pending` | `in-progress` | `done` | `blocked` | `failed` | `skipped`. The visual language must distinguish all six. `blocked` is the human-handoff state; `failed` is the retry-by-agent state; they are not the same.

### MCP — lazy activation + compactness

- Single tool `agentboard.activate()` is the entire MCP surface until called (~200 tokens system-prompt footprint).
- On activation: server emits `notifications/tools/list_changed`; host re-requests the tool list; full ~6–8 tools become visible.
- Activation persists until explicit deactivation or session end. **No time-based auto-sleep** — making tools disappear silently is non-deterministic for negligible savings.
- All responses compact by default; updates are deltas; discussion fetched separately; referenced data lazy.

### Event queue — FIFO, consumed-by-all GC

The agent loop is single-threaded; MCP does not portably support server push today. Coordination uses:

- **`agentboard.poll_events(task_id?)`** — non-blocking cursor advance.
- **`agentboard.wait_for_event(timeout, ...)`** — long-poll, parallels `gh ... --watch`.
- **Piggy-back** — every tool response carries `pending_events: [...]` when `attention.events_in_response: true`.
- **Hard-interrupt channel**: the host's chat input. We **coexist** with it; we do not replicate or replace it.

GC: events are purged only when **every live session has already consumed them** (consumed-by-all). The only time-based rule applies to **sessions** (zombie cleanup, default 30 days, configurable). A per-task hard backstop (default 10000 events, configurable) catches pathological cases. Events themselves are **never aged out by time**.

### External integrations — agent-driven, server-agnostic

The server has **zero** integration code. When a subtask says "wait for CI", the agent runs `gh pr checks <pr> --watch` in its host's background-process facility. When the agent needs PR comments, it runs `gh pr view <pr> --comments`. Jira/Linear: the agent uses their CLIs/REST/GraphQL directly. If the user lacks a CLI, the subtask blocks and the human destrabes.

This is **a deliberate architectural choice**, not a deferred one: it keeps the server tiny, removes per-platform feature requests, removes idle polling token cost, and scales to any future integration without server work.

### Distribution

NPM. Single command launches the server and opens the browser:

```
$ npx @jobshimo/agentboard
▸ agentboard running at http://localhost:7733
▸ MCP endpoint:    http://localhost:7733/mcp
▸ opening browser…
```

The console is a **launcher**, not a TUI. All human interaction happens in the browser. The agent interacts via MCP.

## Deferred decisions

Routed to `sdd-design`. Each must produce a decision with rationale before implementation. The list is verbatim from DESIGN.md §14:

| Decision | Why deferred |
|----------|--------------|
| **Backend stack** (Fastify vs Express vs Hono vs other Node framework) | Bundle size, MCP HTTP/SSE support, WebSocket ergonomics differ. Needs a real call, not a guess. |
| **Frontend stack** (React+Vite vs SvelteKit vs Solid vs other) | Bundle size + dev velocity tradeoff; ties to UI design agent's component model. |
| **SQLite driver** (`better-sqlite3` sync vs `node:sqlite` built-in vs other) | Concurrency model + Node-version reach differ; impacts WAL handling and migration story. |
| **MCP transport** (stdio per-agent-process vs HTTP/SSE shared multi-agent) | Likely HTTP/SSE given the local-server model, but needs validation against host support. |
| **Port assignment** | `7733` is tentative. A real port-allocation strategy is needed (default + collision fallback). |
| **Workflow YAML schema validation** | JSON Schema vs Zod-based vs other, with friendly error messages. |
| **Event types enum** | The complete list of `events.type` values — to be enumerated during `sdd-spec`, finalized in `sdd-design`. |
| **Feedback relevance heuristic** | How `feedback.search(context)` decides what is relevant (workflow id, task type, files touched, embeddings, …). |
| **Session ID stability** | How an agent reconnects with the same `agent_sessions.id` so its cursor survives a reload (stable client identifier? host-provided? negotiated handshake at activation?). |
| **GC defaults** | Zombie-session threshold (30 days?) and per-task hard backstop (10000 events?). Both configurable, but defaults need justification. |

## Affected modules / packages

Greenfield. The proposed top-level module layout (subject to refinement during `sdd-design`):

| Module | Responsibility |
|--------|----------------|
| `server/` | Process bootstrap, HTTP routing, WebSocket fanout, lifecycle. |
| `db/` | SQLite connection, migrations, WAL configuration, schema. |
| `workflows/` | YAML loading, validation, snapshot logic, custom-subtask handling. |
| `domain/` | Task / Subtask / Discussion / Event domain entities and state transitions (the six-state machine lives here). |
| `mcp/` | MCP endpoint, lazy activation, tool registry, compactness rules, piggy-back wiring. |
| `events/` | Event queue: insert, FIFO consumer cursors, GC (consumed-by-all + zombie session cleanup + hard backstop), `poll_events` / `wait_for_event` implementations. |
| `feedback/` | `feedback.add` + `feedback.search` relevance heuristic. |
| `web/` | Single-page app served at `/`. Built artifact; source layout follows the design agent's component model (`BRIEF-DESIGN.md`). |
| `cli/` | `npx @jobshimo/agentboard` launcher, `init`, `export`, flags. UX delegated to the design agent. |
| `config/` | `~/.agentboard/config.yaml` loading, defaults, validation. |

This list is **a target**, not a final structure. Concrete file boundaries are an `sdd-design` deliverable.

## Dependencies on external work

**`sdd-design` is blocked on the design agent's deliverables** described in `BRIEF-DESIGN.md`:

1. **Open questions list** — anything in the brief or `DESIGN.md` that the designer cannot resolve.
2. **Components inventory** — reusable building blocks (`TaskCard`, `SubtaskRow`, `DiscussionThread`, `ExternalRefChip`, `WorkflowStepBadge`, …) — needed before `sdd-design` can decide the frontend stack and the API contract that the UI consumes.
3. **Mockups** — board view, task detail view, empty state, blocked state, settings.
4. **CLI transcripts** — sample stdout for `default`, `init`, `export`, `--port`, `--no-open`, `--help`, `--version` (success + error variants).

Until those land, `sdd-spec` can proceed (it is product-level, UI-independent) but `sdd-design` should not.

## Rollback plan

Greenfield repo, so rollback is trivial:

1. `git revert` (or reset) the SDD-introduced commits up to `7b2b262` (`docs: add v0 design document and engram config`).
2. Delete any local `.agentboard/` directories that were generated during development.
3. Engram artifacts under topic keys `sdd/agentboard-mvp/*` can be archived or left in place — they do not affect repo state.

There is no user data to migrate, no installed base to preserve, no published NPM package to deprecate. This rollback footprint is one of the reasons the proposal scope is comfortably aggressive: the cost of being wrong is low and the cost of half-implementing is much higher than the cost of starting fresh.

## Non-negotiables (carried forward from DESIGN.md §12)

These are not up for revisit during `sdd-spec` / `sdd-design`:

- **Concepts > code.** Design docs lead; code follows.
- **The human directs, the agent executes.** `can_agent_complete_alone: false` is first-class.
- **Don't reinvent what CLIs already do.** `gh`, `jira`, `linear` are the integration layer.
- **Server stays minimal.** No external adapters in-process.
- **Useful for both sides.** Shared infrastructure, not a one-side tool.
- **Ágil.** Low token cost, low friction, zero setup beyond `npx`.
- **One thing well, then the next.** No half-implementations.
- **Conventional Commits.** No `Co-Authored-By` trailers.
- **Voseo Rioplatense** for Spanish UX copy; English for code/docs.

## Next step

Proceed in parallel (no ordering dependency between them):

- `sdd-spec` — enumerate product-level requirements and scenarios (UI-independent, no framework specifics).
- `sdd-design` — **blocked** on the design agent's deliverables from `BRIEF-DESIGN.md`. Resolves the deferred decisions table.

`sdd-tasks` is blocked on both. `sdd-apply` is blocked on `sdd-tasks`.
