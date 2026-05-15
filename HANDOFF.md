# HANDOFF — agentboard

State as of commit `f1af13b`. Read this before continuing work on the project.

## What works (verified, end-to-end)

- 494/494 vitest tests pass.
- Backend: SQLite + Fastify (REST + WS + MCP HTTP/SSE) starts, accepts requests, serves the SPA when `dist/web/` is built.
- SPA renders in dev (`pnpm dev:web` + `pnpm dev:server`); WS upgrade verified live (`101 Switching Protocols`); chrome + Board + TaskDetail + Settings views all functional.
- MCP: 14 tools wired, lazy activation, piggyback events.
- Event queue: FIFO + 3-phase GC + trigger materializer + waiter registry.
- Feedback heuristic implemented and returning real results.
- Three rounds of `sdd-verify` resolved all CRITICALs. Specs canonical in `openspec/specs/`. Change archived at `openspec/changes/archive/2026-05-15-agentboard-mvp/`.

## What is broken at the product level

The implementation ties the **server process lifecycle to a single `cwd`**. The DB is opened from `process.cwd()/.agentboard/db.sqlite` when the server starts. Consequences:

- A user with 3 projects needs 3 separate `agentboard` processes on 3 different ports.
- Each must be started manually from the project root, with the terminal left open.
- The agent has no way to start the server — MCP HTTP/SSE requires the server to be already running.
- Switching projects means stopping and restarting the server.

This is wrong. `DESIGN.md` §3 explicitly said "one process". The intent was a single daemon that serves multiple repos. The implementation collapsed that into one-process-per-repo.

## The correct model

One agentboard daemon listening on a fixed port (default `:7733`). When an agent or browser connects, the request context identifies which repo is being acted upon. The daemon opens the corresponding `.agentboard/db.sqlite` from the agent's working directory (or one specified in the MCP session).

Concretely, the changes needed are roughly:

1. The CLI default invocation starts the daemon without binding it to `cwd`. The DB connection becomes per-session/per-request, keyed by a repo path provided by the caller.
2. MCP `activate()` accepts a `repo_root` (or derives it from the agent's process working directory if the host exposes that). All subsequent tool calls in that session operate on that repo's DB.
3. REST/SPA accept a `repo` query param or path prefix; the SPA picks a repo (settings dropdown) and sends it on every request.
4. `getDb({ cwd })` already takes a cwd — that's a good seam. The work is plumbing the cwd through from request context, not refactoring storage.
5. Idempotent spawn: `npx @jobshimo/agentboard` in a repo checks if `:7733` already has a daemon; if so, it just opens the browser pointed at this repo. If not, starts the daemon.
6. `agentboard stop` / `status` subcommands for managing the daemon.

Estimated scope: one medium SDD change. The domain layer doesn't move; only `src/server/`, `src/mcp/`, `src/cli/`, and a small slice of the SPA need updating.

## Other follow-ups already tracked in engram

- `agentboard/followup-activation-sql` (#600) — extract SQL on `agent_sessions` from `src/mcp/activation.ts` into a domain function.
- `agentboard/followup-task-add-custom-subtask-param` (#601) — `task_id` vs `id` param mismatch with spec.
- `agentboard/followup-sidebar-workflows` (#602) — sidebar workflow list is always empty; needs `useWorkflows()` boot fetch.
- `agentboard/followup-feedback-add-task-id` (#603) — `feedback.add` requires `task_id` alongside `target`; spec lists only `target/text/severity`.
- Original W1 (verify round 1) — spec says 6–8 active MCP tools, code exposes 14. Needs a spec amendment PR.
- Original W2 — `attention.agent_sees_human_events` config flag is never read by `withPiggyback`.
- Original W5 — Phase 3 cross-cutting tests (e2e, token-budget, gc-integration) not implemented.
- `agentboard/s10b-compact-task-subtask-gap` — `GET /api/tasks` compact shape has no subtasks; board workflow strip renders empty until full task is fetched.
- `agentboard/build-migrations-asset` (#583) — RESOLVED in S9 build script; documented for reference.

## How to run today (despite the lifecycle flaw)

Development:
- Terminal 1: `pnpm dev:server` — Fastify on `:7733` with `tsx watch`.
- Terminal 2: `pnpm dev:web` — Vite on `:5173`, proxies `/api/*` and `/ws` to the backend.
- Browser: `http://localhost:5173`.

Production (single repo):
- `pnpm build && pnpm build:web` — produces `dist/cli/` + `dist/web/` + `dist/db/migrations/`.
- `node dist/cli/index.js` (or `npx @jobshimo/agentboard` after publish) from the target repo.
- Browser: `http://localhost:7733` (Fastify serves the built SPA via `@fastify/static`).

MCP client setup is **not documented**. Each agent host needs its own `mcp.json` (or equivalent) entry pointing at `http://localhost:7733/mcp` with Streamable HTTP transport. README does not currently include these snippets.

## Where to start in the next session

If you continue this project, the highest-value next move is the daemon refactor. Order:

1. Write the proposal/spec for the "one daemon, many repos" change (new SDD change, ~3 specs to update: `launcher.md`, `storage.md`, `mcp-surface.md`).
2. Implement the request-context-to-repo plumbing.
3. Add `agentboard daemon`, `agentboard stop`, `agentboard status` subcommands.
4. Update README with the MCP client setup snippets.
5. Then revisit the smaller followups.
