# agentboard — Design Document

> Status: pre-SDD design capture. This document is the **source of truth** for what `agentboard` is, why it exists, and how it works. Everything below was agreed in conversation before the first line of code was written.
>
> Repo: https://github.com/jobshimo/agentboard.git
> Package (tentative): `@jobshimo/agentboard`
> Local path: `C:\Users\NERO\repos\agentboard`

---

## 1. Why this exists

`agentboard` replaces `TaskBoard` (the previous local task tracker) because TaskBoard failed structurally for our use case:

- Its SQLite DB is locked by the desktop app, so seeding/updating from agents requires bypassing the app entirely.
- Cards live disconnected from the repo they describe — clone the repo on another machine and the tasks are gone.
- The human↔agent loop is broken: the agent cannot reliably move cards, and the human cannot easily inject feedback at the level the agent will actually read.

`agentboard` is **not a Jira clone** and **not a Trello clone**. It is a **state machine of the agent's work**, with a human-facing discussion layer on top. It is designed for the loop where a human and one or more AI agents collaborate on a coding task across multiple sessions.

---

## 2. Naming and distribution

- **Name**: `agentboard`
- **NPM package (tentative)**: `@jobshimo/agentboard`
- **Repo**: `https://github.com/jobshimo/agentboard.git`
- **Distribution**: NPM. Single command launches a local server and opens the browser:

```
$ npx @jobshimo/agentboard
▸ agentboard running at http://localhost:7733
▸ MCP endpoint:    http://localhost:7733/mcp
▸ opening browser…
```

The console is a **launcher only**, not a TUI. All human interaction happens in the web UI. The agent interacts via MCP.

---

## 3. Architecture overview

- **Standalone application** — separate from `browser-link`. Explicitly **not** a module inside `browser-link`. Rationale: users who only want `browser-link` should not be forced to install task-management features.
- **Local-first**. The server runs on the user's machine. No hosted backend, no required cloud service.
- **One process** exposes three surfaces:
  1. **Web UI** (Kanban-style board) served at `http://localhost:7733`
  2. **MCP endpoint** at `http://localhost:7733/mcp` for agents
  3. **REST/WebSocket APIs** for the Web UI itself
- **Realtime UI**: WebSocket push from server → browser whenever the DB changes, so when the agent moves a card the human sees it immediately.

---

## 4. Storage model

### 4.1 Source of truth: SQLite

The canonical store is a SQLite database at `<repo>/.agentboard/db.sqlite`. **Not** a tree of markdown files.

**Why SQLite over filesystem-markdown-as-source-of-truth**:

- Bulk state migrations (e.g. moving 47 cards to a new workflow version) are one query, not 47 file rewrites.
- Cross-card queries ("all cards blocked > 3 days") are trivial.
- Bidirectional references (subtask ↔ task ↔ workflow ↔ events) stay consistent automatically.
- Realtime push to the UI is event-driven from DB writes.
- Concurrent writes (agent + UI) are safe via SQLite WAL.

### 4.2 Markdown as a rendered view

Markdown is a **derived view**, not a source. The server renders markdown on demand:

- `GET /api/tasks/:id/markdown` returns the card as a `.md` file (discussion + subtask list, nicely formatted).
- The UI shows this rendering when the user opens a card detail.
- The user can copy/export it.

### 4.3 Git-committable snapshots

To get the "committable" benefit without making markdown the source of truth:

- Command `agentboard export` dumps current board state to `.agentboard/snapshot/` as a tree of `.md` files.
- The user (or a git hook) commits the snapshot when they want a versioned record.
- `db.sqlite` itself goes in `.gitignore` — regenerable from snapshots if needed.

### 4.4 Storage scope

**Per-repo storage.** Each repo has its own `.agentboard/` directory. Cards are inseparable from the repo that originated them.

Rejected alternative: machine-local global DB (like TaskBoard does). It is part of why TaskBoard fails — cards float disconnected from the work they describe.

---

## 5. Workflow configuration

### 5.1 Global by default, per-repo override optional

- Workflows live in `~/.agentboard/workflows/*.yaml` (global, per-user).
- A repo can opt into a custom workflow via `agentboard init`, which copies a global template into `<repo>/.agentboard/workflow.yaml`.
- **Explicit copy, no magic merge**. What is in the repo wins.

### 5.2 Workflow file schema

```yaml
# Example: ~/.agentboard/workflows/feature.yaml
id: feature
label: "Feature implementation"

steps:
  - id: implement
    label: "Implementation"
    can_agent_complete_alone: true

  - id: tests
    label: "Tests pass"
    can_agent_complete_alone: true
    blocks_next: true              # downstream steps will not start until this is done

  - id: commit
    label: "Commit"
    can_agent_complete_alone: true

  - id: open-pr
    label: "Open PR"
    can_agent_complete_alone: true

  - id: ci-green
    label: "CI passes"
    can_agent_complete_alone: true
    agent_hint: "Run `gh pr checks <pr> --watch` and wait."

  - id: address-review
    label: "Address PR feedback"
    can_agent_complete_alone: false
    triggered_by: pr_comment        # subtask appears only when a PR comment arrives

  - id: merge
    label: "Merge"
    can_agent_complete_alone: false
```

### 5.3 Field semantics

| Field | Meaning |
|---|---|
| `can_agent_complete_alone: false` | When the agent reaches this step, it transitions to `blocked` and notifies the human. The human destrabes it from the UI, by chat, or by moving the card. |
| `blocks_next: true` | If this step is `pending` or `failed`, no downstream steps start. |
| `triggered_by: <event>` | This subtask is not created upfront. It appears only when the named event arrives (e.g. `pr_comment` from a `gh pr view --comments` poll). |
| `agent_hint: <text>` | Free-form hint to the agent about how to execute this step. **Not a parsed DSL**. The agent reads it and decides what to run. |

### 5.4 Snapshot immutability

When a task starts, the workflow file is **snapshotted into the task** at that moment. If the user later edits the global workflow, active tasks are not affected — they continue under their snapshot. New tasks pick up the new workflow.

Custom ad-hoc subtasks can still be added to a running task via `task.add_custom_subtask(label, type?)`. They are marked `custom: true` and live outside the snapshot. This covers "the workflow did not contemplate this but we need it here" without forcing a workflow rewrite.

---

## 6. Domain model

### 6.1 Task (parent card)

A task is the unit of work. It can be:

- **Referenced** — originated in an external system. The task stores a reference, not a copy:
  - `jira:XYZ-123`, `github:org/repo#42`, `linear:ABC-456`, etc.
  - Minimal snapshot of metadata is cached (title, link, assignee, status).
  - Agent can re-fetch the external source on demand via `external.fetch(ref)`.
- **Local** — created directly in `agentboard` by the human or agent. No external ref.

Every task has:

- **Discussion** (free-form markdown) — the "why". Human and agent discuss approach, decisions, rejected alternatives, business context. This is the layer that survives across sessions.
- **Workflow snapshot** — the immutable steps the task will go through.
- **Subtasks** — instances of the snapshot's steps, plus any custom ad-hoc subtasks.

### 6.2 Subtask (workflow step)

A subtask is a step of the workflow. Subtasks are intentionally minimal:

- A `type` (one of: `implement`, `commit`, `open-pr`, `address-pr-comments`, `fix-ci`, `deploy`, …).
- A `status` (see 6.3).
- **Optional** note or link to an artifact (commit SHA, PR URL, CI run ID).
- **No required free-text body**. The discussion lives on the parent task, not in subtasks.

### 6.3 Subtask states

Exactly six states. No more.

| State | Meaning |
|---|---|
| `pending` | Not started. Waiting its turn. |
| `in-progress` | The agent is actively working on this step. |
| `done` | Completed successfully. |
| `blocked` | Stopped, waiting for human intervention (typically because `can_agent_complete_alone: false` or because an external requirement is not met). |
| `failed` | Agent attempted and failed (test fail, CI red, build broken). Retry is possible. |
| `skipped` | The human decided this step does not apply. |

### 6.4 Custom ad-hoc subtasks

The agent or user can add subtasks outside the workflow snapshot via `task.add_custom_subtask(label, type?)`. These do not have a step ID from the workflow file; they are marked `custom: true` in the DB and rendered with a small indicator in the UI.

> **Note on SQL schema**: the complete `tasks` and `subtasks` table definitions are deferred to the `sdd-spec` phase. The `events` table schema appears explicitly in §9 because it is structurally central to the coordination model — the FIFO and GC guarantees only make sense when grounded in the actual storage. Other tables are described here at the level needed for the domain decisions and will be specified concretely during SDD.

---

## 7. External integrations — agent-driven, server-agnostic

### 7.1 The server knows nothing about CI, Jira, GitHub, Linear, etc.

This is a **deliberate architectural choice**, not a deferred one. The server has **zero** adapters, webhooks, tunnels, or polling logic for external systems.

### 7.2 The agent uses the right CLI for the job

When a subtask's `agent_hint` says "wait for CI", the agent runs the appropriate command in its own environment:

| Subtask | Agent action |
|---|---|
| `ci-green` | `gh pr checks <pr> --watch` → mark `done` or `failed` based on exit |
| `address-review` | `gh pr view <pr> --comments` (poll) — start when new comments appear |
| `merge` | If `can_agent_complete_alone: false`, stay `blocked` until human approves |
| Jira task fetch | `jira` CLI or direct REST |
| Linear task fetch | `linear` CLI or GraphQL |

The agent runs these in the background (`run_in_background: true` in Claude Code, equivalent in other hosts). The agent's host (not the server) monitors the process and re-invokes the model when the process exits. This is the same mechanism by which agents already learn when CI finishes today — `agentboard` does not reinvent it, it just delegates to it.

### 7.3 What happens if the user does not have `gh` (or whatever CLI)

The subtask transitions to `blocked` once the agent can't execute `agent_hint`. The human destrabes it manually:

- From the UI: drag-and-drop or "mark done" button.
- From chat: tell the agent "ya está, marcalo done"; the agent calls `subtask.update(id, status: done)` and the card moves in the UI via WebSocket push.

No webhook configuration, no tunnel setup, no hosted middleware required for any of this.

### 7.4 Why this matters

- Server stays simple. Zero lines of integration code.
- User setup is zero (assuming the relevant CLIs are already installed for the platforms they use).
- Scalable to any future service without a server-side feature request.
- Agent pays tokens only when an external subtask is active. Zero idle polling.

---

## 8. MCP integration

### 8.1 Lazy activation

By default, `agentboard`'s MCP server exposes **one** tool: `agentboard.activate()`. System-prompt footprint: ~200 tokens. That is the entire cost when the user is not using the board.

When the agent calls `agentboard.activate()`:

1. The server flips internal state to "active".
2. It emits the standard MCP notification `notifications/tools/list_changed`.
3. The host re-requests the tool list.
4. The full set of ~8 tools is now visible to the agent.

`agentboard.deactivate()` returns to the single-tool state. **Activation persists until explicitly deactivated or the session ends — there is no time-based auto-sleep.** Making tools disappear from under the agent's feet is surprising and non-deterministic for negligible token savings.

### 8.2 Configuration

```yaml
# ~/.agentboard/config.yaml
mcp:
  activation: lazy           # lazy (default) | always-on | prompt
```

- `lazy` — starts dormant. Activate when needed.
- `always-on` — starts active. For long sessions where the user knows they will use the board.
- `prompt` — first tool call in a session, agent asks the user once.

The user can override per-session by telling the agent "trabajá con agentboard" → activate, "dejá agentboard al margen" → deactivate.

### 8.3 Tool surface (active state)

Target: **6–8 tools, not 30**. Concise schemas. Updates always delta, never full-replace.

Core tools (working set, may shift slightly during SDD):

```
task.list(filter?)                 → compact list
task.get(id, include_discussion?)  → metadata + subtasks; discussion optional
task.start(id)                     → moves first pending subtask to in-progress
subtask.update(id, status, note?)  → delta update
task.comment(id, text)             → append to discussion
task.complete(id)                  → close
feedback.add(target, text)         → retro feedback (see §10)

agentboard.poll_events(task_id?)              → see §9.2
agentboard.wait_for_event(timeout, ...)       → see §9.2
agentboard.notify_human(urgency, text)        → toast + UI badge
agentboard.activate() / agentboard.deactivate()
```

### 8.4 Compactness rules (non-negotiable)

These exist to prevent the system from bloating over time:

1. **Responses are compact by default.** `task.get()` returns metadata + subtask states. The discussion is fetched separately when needed.
2. **Updates are deltas, never full-object replace.** `subtask.update(id, status, note?)`, not `subtask.update(id, full_subtask_object)`.
3. **No agent-side auto-polling.** The agent does not ask "did anything change?" every turn. It either piggybacks on responses (§9) or explicitly long-polls when waiting.
4. **Discussion is compressible.** If a card accumulates 50+ comments, the agent gets a summary by default; full comments are fetched on demand. The UI always shows them in full to the human.
5. **Referenced data is lazy.** A task referencing `jira:XYZ-123` stores only title/status/url/assignee. Anything more is fetched on demand via `external.fetch`.

---

## 9. Event queue and human↔agent coordination

### 9.1 The honest limit we are working around

The LLM is **linear**: one turn = one inference = one output. There is no fork of control. The agent cannot "listen in the background while doing something else" — it has a single thread of execution.

MCP also does **not** offer a portable mechanism for a server to push a message into the running conversation. `sampling/createMessage` exists in the spec, but host support is too weak today to depend on it. We do **not** rely on sampling.

What we **can** rely on:

- The agent can explicitly call a tool that blocks server-side until something happens (long-poll). This is exactly how `gh pr checks --watch` works.
- The agent can call a tool that returns immediately with any events accumulated since its last read (queue consumer).

**The hard-interrupt channel** (always available, not invented by us): the human can write to the host's chat (Claude Code, Cursor, etc.) at any time. That message lands in the agent's next turn directly, bypassing `agentboard` entirely. This is the emergency line — use it when something must be reacted to *now* and you cannot wait for the agent to next poll. We coexist with it; we do not replicate or replace it.

### 9.2 The queue

A persistent server-side event log. Producers (UI, future webhooks, system) append to it without coordination. Consumers (agent sessions) read from it with their own cursor.

```sql
CREATE TABLE events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     TEXT NOT NULL,
  type        TEXT NOT NULL,        -- 'comment_added', 'status_change', 'subtask_added', 'feedback_added', ...
  payload     JSON NOT NULL,
  origin      TEXT NOT NULL,        -- 'human' | 'agent' | 'system'
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE agent_sessions (
  id             TEXT PRIMARY KEY,
  last_event_id  INTEGER DEFAULT 0,
  connected_at   TIMESTAMP,
  last_seen      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 9.2.1 FIFO and ordering guarantees

The queue is **strictly FIFO**, per task and globally:

- `events.id` is `INTEGER PRIMARY KEY AUTOINCREMENT` — monotonic. SQLite serializes concurrent inserts under WAL, so the `id` order is the commit order.
- Consumers always `ORDER BY id`. The cursor (`agent_sessions.last_event_id`) only moves forward — never resets, never rolls back.
- The schema is **append-only** by design: events are inserted, never updated. **Nothing gets overwritten or rewritten.** A producer cannot accidentally mutate a past event.

This applies whether one or many agent sessions read the same queue. Each session has its own cursor and reads independently — sessions do not interfere with each other.

#### 9.2.2 Garbage collection — no time-based event expiry

The queue must not grow unbounded if a session disconnects and never returns. The design **rejects time-based event expiry** ("delete events older than 30 days") because that loses information that might still be needed. Instead:

**A) Consumed-by-all GC** (primary mechanism)

```sql
DELETE FROM events
 WHERE id < (
   SELECT MIN(last_event_id) FROM agent_sessions
    WHERE last_seen > datetime('now', '-N days')
 );
```

Events are deleted only when every currently-active consumer session has already read them. **An event is purged because its purpose was fulfilled**, never because it aged. A non-zombie session can leave its cursor unmoved for years and still receive every event in order.

**B) Zombie-session cleanup** (the only time-based rule, and it applies to **sessions**, not to events)

A session whose `last_seen` is older than the abandoned-session threshold (default: 30 days, configurable) is excluded from the GC `MIN(last_event_id)` calculation. The session row itself is then removed. This prevents one disconnected agent from blocking GC forever. **The events themselves are not aged out — they are removed downstream by mechanism A once no live session needs them.**

**C) Hard backstop** (degeneration guard)

Per task, a maximum retention of N events (default: 10000, configurable). On insert past the limit, the oldest entries are purged regardless. This is a safety net for pathological cases — in normal operation it never fires.

### 9.3 Consumer tools

```
agentboard.poll_events(task_id?)
  → Returns events since this session's last_event_id, advances the cursor.
  → Non-blocking. Returns [] if nothing new.

agentboard.wait_for_event(timeout_ms, task_id?, types?)
  → If pending events exist, returns immediately.
  → Otherwise, the call stays open server-side until a matching event arrives
    or timeout expires. Equivalent to `gh ... --watch` for board events.

(piggy-back, automatic)
  → If config attention.events_in_response is true, every tool response
    includes a `pending_events: [...]` field with anything new since the
    last cursor advance. Zero extra tool calls.
```

### 9.4 Configuration

```yaml
attention:
  agent_sees_human_events: true   # piggy-back on/off (default on)
  notify_human_on_block: true     # OS notification when agent enters `blocked` (default on)
```

### 9.5 What this resolves

- **Agent working, human comments**: comment hits the queue. Next `poll_events()` (or piggy-back) the agent sees it before advancing.
- **Agent must wait for human approval** (e.g. `can_agent_complete_alone: false`): instead of returning to chat, the agent calls `wait_for_event(timeout: 1800s, types: ['status_change', 'comment_added'])`. The call stays open. The human drags the card in the UI → server inserts event → call returns → agent continues. No chat interaction required.
- **Agent disconnected**: human makes 8 changes. They all queue. When the agent reconnects, `poll_events()` returns them. Zero loss.
- **Human wants the agent to ignore them**: set `agent_sees_human_events: false` and the agent simply does not call `poll_events`. Quiet mode.

---

## 10. Human retrospective feedback

The human can leave feedback on a closed card at any time:

- From the UI, on a specific subtask or on the parent task: text + optional severity (`info`, `correction`, `failed_in_practice`).
- Stored as an event of type `feedback_added`, not as a task reopen.
- Next time the agent works on something the system considers related (same workflow, same task type, same files touched — heuristic to be designed), `feedback.search(context)` surfaces relevant prior feedback.
- The agent reads 2–3 lines of human feedback and adjusts — instead of re-explaining the same correction across sessions.

> **Realtime feedback** (the human marks "esto está mal" *while the agent is still working*) uses the same `feedback.add(...)` API but lands as a `feedback_added` event in the queue described in §9. The agent sees it on its next `poll_events()` or `wait_for_event()` cycle, exactly like any other human event. This section documents retrospective feedback specifically — the API and storage mechanism are unified for both cases.

---

## 11. Token economics — honest assessment

**Net effect**: ahorra tokens on multi-step / cross-session work. Costs tokens on trivial one-shots.

> The numbers in this section are **rough estimates based on shape-of-the-system analysis**, not measured benchmarks. They establish the order of magnitude and the direction of the tradeoff. Real numbers should be measured once a working MVP exists and updated here.

### 11.1 Where it costs tokens

- **Tool definitions in system prompt**: ~1.5–2k tokens when active (8 tools with schemas). Fixed per session.
- **Incremental updates**: each `subtask.update()` is a tool call. A task with 6 subtasks = 6 calls that would not exist without `agentboard`.
- **Re-fetch on session resume**: ~300–800 tokens depending on discussion size.

Estimated fixed cost per active session: ~3–5k tokens.

### 11.2 Where it saves tokens

- **State externalized**: agent does not reconstruct context from `git log` + file reads + user re-explanation on every session change. `task.get(active)` returns ~500 tokens of compact state. Saves 5–15k tokens of catch-up per session resume.
- **Decisions recorded, not re-debated**: the discussion captures "decidimos A en vez de B porque Z". Next session reads it instead of re-deliberating. Saves 2–4k tokens per re-occurrence.
- **Retro feedback is compact input**: agent reads 3 lines of human correction instead of repeating the error and being re-corrected. Saves a full failed-task cycle of tokens.
- **Workflow eliminates "what do I do now" meta-deliberation**: agent reads the next pending subtask and executes. Zero free-form planning between steps.

### 11.3 When to NOT use agentboard

For a single-file 30-second change, agentboard is overhead. Recommendation in the agent's own usage policy: **do not use agentboard for tasks expected to take less than 5 minutes of agent work**. Same way a human does not open a Jira ticket to fix a typo.

For everything else (multi-step features, anything with PR + CI + review, anything spanning sessions), agentboard's break-even is fast and net savings are usually 15–40k tokens per task.

---

## 12. Design philosophy and non-negotiables

- **Concepts > code**: this design document exists because the user explicitly does not want code without understood foundations.
- **The human directs, the agent executes.** The board's mechanics enforce this — `can_agent_complete_alone: false` is a first-class concept.
- **Don't reinvent what CLIs already do.** `gh`, `jira`, `linear` are the integration layer. Server stays out of it.
- **Server stays minimal.** No external adapters, no business logic for tools the user already knows how to operate.
- **Useful for both sides.** The board is not "the human's tool that the agent updates" or "the agent's tool that the human watches". It is shared infrastructure, used directly by both.
- **Ágil**: low token cost, low friction, no required setup beyond installing the package.
- **One thing well, then the next.** No half-implementations. No features-for-the-future.

---

## 13. Out of scope for MVP

Explicitly NOT in the first version:

- Multi-user / realtime collaboration between humans (single-user local only).
- Server-side webhooks for CI/Jira/etc. (agent uses CLIs).
- MCP sampling-based push (not portable today).
- Tunnels or hosted services.
- Cross-machine sync (each machine its own DB; export to git for transfer).
- Mobile UI.
- Authentication / user accounts (single local user assumed).

---

## 14. Open decisions for the SDD phase

These were intentionally deferred from this conversation, to be resolved during `sdd-propose` / `sdd-design`:

- **Backend stack**: Node (most likely, matches `browser-link`) — but specifics like Fastify vs Express vs Hono need a call.
- **Frontend stack**: React + Vite, SvelteKit, Solid, or other. To be decided based on bundle size and dev velocity.
- **SQLite driver**: `better-sqlite3` (sync, fast, locks) vs `node:sqlite` (built-in in newer Node) vs other.
- **MCP transport**: stdio (per-agent-process) vs HTTP/SSE (shared, multi-agent). Most likely HTTP/SSE given the local server model.
- **Port assignment**: `7733` is a tentative default; needs a real port-allocation strategy that avoids common conflicts.
- **Workflow YAML schema validation**: JSON Schema or Zod-based, with friendly error messages.
- **Event types enum**: complete list of `event.type` values needs to be enumerated during `sdd-spec`.
- **Feedback relevance heuristic**: how `feedback.search(context)` actually decides what's relevant.
- **Session ID stability**: how an agent reconnects with the same `agent_sessions.id` so its cursor survives a reload. (Stable client identifier? Host-provided? Negotiated handshake at activation time?)
- **GC defaults**: the abandoned-session threshold (30 days?) and the per-task hard backstop retention (10000 events?). Both configurable, but reasonable defaults need to be picked and justified.

---

## 15. Repository state as of writing

- Path: `C:\Users\NERO\repos\agentboard`
- Git initialized with branch `main`
- Remote `origin`: `https://github.com/jobshimo/agentboard.git`
- First commit: `chore: initial commit` (SHA `458f1e9`) — only contains `README.md` placeholder
- This `DESIGN.md` is the next file to add

---

## 16. Next steps

1. **Reconnect Claude Code with `agentboard` as the primary working directory.** Current session's primary cwd is `browser-link`; cannot be changed mid-session. User exits Claude Code, `cd C:\Users\NERO\repos\agentboard`, relaunches `claude`.
2. **`sdd-init`** in the new session to bootstrap SDD context for the project.
3. **`sdd-propose`** to formalize this design document as a proper SDD proposal artifact.
4. **`sdd-spec` + `sdd-design` + `sdd-tasks`** to break the proposal into actionable, ordered work.
5. **`sdd-apply`** — first implementation batch.

Cross-session continuity guarantees:

- This file (`DESIGN.md`) committed to the repo.
- Engram memory entry with topic key `agentboard/design-v0` containing the same content.
- Both must be checked at session resume; the file is canonical, engram is the searchable index.
