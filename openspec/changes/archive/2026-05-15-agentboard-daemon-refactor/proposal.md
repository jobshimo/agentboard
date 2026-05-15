
# Proposal: agentboard-daemon-refactor

Status: proposed
Owner: project owner
Persistence: hybrid (engram topic `sdd/agentboard-daemon-refactor/proposal` + this file)
Related decision: engram #609 (`agentboard/daemon-refactor-architecture`)
Related flaw: engram #608 (`agentboard/lifecycle-flaw`)
Exploration: `openspec/changes/agentboard-daemon-refactor/exploration.md` (engram #610)

---

## 1. Intent

The MVP collapsed a multi-surface design ("one process exposes MCP, REST, WS") into a single per-repo process bound to `process.cwd()` at startup, with MCP transported over HTTP/SSE. That model breaks the two core user expectations: the agent should bootstrap MCP without the user pre-launching anything, and the human should open one local web that shows every repo they use, not one server per repo. This change re-aligns implementation with the original design intent by splitting the binary into a per-session STDIO MCP entry point and an on-demand global HTTP daemon, with all repo binding moved to per-request resolution. Success is measured by: a single `mcp.json` snippet works in any repo without preflight, and `npx @jobshimo/agentboard` from any directory opens one shared web pointing at that repo.

## 2. Scope

### In scope

- New STDIO MCP entry point: `agentboard mcp` subcommand, transport switched from `StreamableHTTPServerTransport` to `StdioServerTransport`.
- Repo binding for the STDIO process: `AGENTBOARD_REPO` env var (primary) + `--repo` CLI flag (secondary), env wins.
- Synthetic MCP session ID minted by the STDIO process (UUID at startup, propagated through the existing `withPiggyback` / activation flow).
- Daemon decoupling from `cwd`: replace the module-level `_db` singleton in `src/db/connection.ts` with a per-key `Map<string, Db>` and a `getDbForRepo(repoPath)` accessor. Windows path keys normalized to lowercase.
- Per-request DB injection in the HTTP daemon: Fastify `onRequest` hook reads `?repo=<abs-path>`, validates it, decorates `req.db` + `req.repoRoot`. All current `process.cwd()` reads in `src/server/rest.ts` (lines 216, 369, 387) move to `req.repoRoot`.
- Repo registry: `~/.agentboard/daemon.json` for persistence across daemon restarts. Daemon exposes `GET /api/daemon/repos`. Registry updated on first request for a new repo (debounced write).
- Inter-process notification: STDIO process POSTs to `http://127.0.0.1:<port>/internal/notify` with `{ repo, event_id }`. Daemon re-dispatches through `BroadcastManager`. Best-effort; failures silent (DB is authoritative).
- Idempotent daemon launch: `npx @jobshimo/agentboard` (and `agentboard daemon`) probes `:7733`, confirms agentboard ownership via `/api/health`, opens browser at active repo if already running, otherwise spawns the daemon.
- New CLI subcommands: `agentboard stop` (SIGTERM + cleanup), `agentboard status` (running/PID/port/known repos).
- SPA repo selector: `App.tsx` `activeRepo` state, repo list from `GET /api/daemon/repos`, `?repo=` query param appended in every `api.ts` helper, WS reconnect when active repo changes, TopBar dropdown using the existing `Folder + ChevronDown` slot at `TopBar.tsx:27-30`.
- README documentation: `mcp.json` STDIO snippet for Claude Code / Cursor.

### Out of scope (follow-ups, not this change)

- Auth on the daemon (single-user local-first per `DESIGN.md`).
- Multi-user / shared remote state.
- Mobile UI.
- Auto-spawn of daemon from `agentboard mcp` (v2 follow-up; v1 requires the user to launch the web explicitly).
- Related-but-separate engram items: #600 activation-sql, #601 task_id naming, #602 sidebar workflows, #603 feedback.add task_id — these are independent changes and stay out.

## 3. Approach summary

- **Two processes, shared SQLite.** `agentboard mcp` runs as an ephemeral STDIO child of the MCP client; one process per agent session. `agentboard daemon` runs as one global HTTP server on `:7733`; one process for the whole machine. They share state through per-repo SQLite (`<repo>/.agentboard/db.sqlite`) under WAL mode, which is multi-process safe.
- **Repo binding is per-request, not per-process.** The daemon never inspects its own `cwd`. Every REST/WS call carries `?repo=<absolute-path>`. The STDIO process resolves its repo once at startup (env or flag) and reuses it for the lifetime of that agent session.
- **DB caching by repo path.** A `Map<normalizedRepoPath, Database>` in each process opens connections lazily and caches them. The same seam (`getDb`) survives, but the singleton goes away. Windows path keys are lowercased to avoid `C:\` vs `c:\` cache misses.
- **Realtime push is best-effort.** When the STDIO process inserts an event, it POSTs `/internal/notify` to the daemon (bound to `127.0.0.1`). The daemon broadcasts through its existing `BroadcastManager`. If the daemon is down, the event is still in the DB and surfaces when the user opens the web — no retries, no queue.
- **Idempotent spawn via `/api/health` probe.** The daemon registers itself with `~/.agentboard/daemon.pid` for fast presence checks; falls back to a 500ms `fetch('/api/health')` probe. `npx @jobshimo/agentboard` always succeeds — it either launches or piggybacks on the running daemon, then opens the browser at the current repo.
- **SPA gets a real repo selector.** The existing TopBar `Folder + name + ChevronDown` skeleton becomes a dropdown sourced from `GET /api/daemon/repos`. Switching repos triggers WS reconnect (or re-subscribe) and re-fetches all panels with the new `?repo=`.

## 4. Capability surfaces affected

The spec phase will produce delta updates against:

- `openspec/specs/launcher.md` — new `mcp`, `daemon`, `stop`, `status` subcommands; idempotent spawn semantics; daemon PID file at `~/.agentboard/daemon.pid`.
- `openspec/specs/mcp-surface.md` — transport switch HTTP/SSE → STDIO; STDIO session-ID minting protocol (UUID at process start, env override `AGENTBOARD_SESSION_ID` for tests); repo resolution rules (env > flag); inter-process notification contract.
- `openspec/specs/storage.md` — per-repo DB cache (`Map<repoPath, Db>`); path normalization rules; per-request DB resolution contract; multi-process WAL safety guarantee.
- New `openspec/specs/daemon.md` — global daemon lifecycle; `~/.agentboard/daemon.json` registry schema; `/internal/notify` endpoint contract (loopback only, optional shared-secret env var); `/api/daemon/repos` endpoint; spawn/probe protocol.
- `openspec/specs/realtime-ui.md` — SPA repo selector contract; `?repo=` on every request; WS rebinding on active-repo change.

`event-queue.md`, `feedback.md`, `workflows.md`, `domain-model.md`, `token-economy.md`, `external-integrations.md` are not touched.

## 5. Risks

Carried over from exploration with annotations:

1. **STDIO `extra.sessionId` is undefined.** The MCP SDK does not synthesize a session ID for STDIO. The STDIO process must mint one (UUID) at startup and propagate it through `withPiggyback` and `ActivationState.activate(db)` so existing piggyback / poll-events code paths continue to work. This is the highest-effort implementation detail. Severity: Medium.
2. **Windows path normalization for the DB cache key.** Mixed-case drive letters or trailing slashes would cause cache misses and double connections to the same file (and `better-sqlite3` will not complain). Must be specified explicitly. Severity: Low.
3. **STDIO clients and `notifications/tools/list_changed`.** Claude Code and Cursor support this notification, but it must be verified once at apply time. Severity: Low.
4. **Daemon unreachable from STDIO process.** HTTP POST to `/internal/notify` fails silently. Documented as known degraded mode — DB write is authoritative; UI catches up on page open. Severity: Low.
5. **Repo root protocol.** `AGENTBOARD_REPO` env var (primary, MCP-client-config friendly) + `--repo` flag (secondary, explicit). Env wins. If neither set, the STDIO process exits with a clear error. Severity: Medium — must be locked in the spec.
6. **`better-sqlite3` multi-instance per process.** Already confirmed safe in exploration. Severity: Low.
7. **NEW — Registry write contention.** Two daemon instances racing during a spawn window could both try to write `~/.agentboard/daemon.json`. Mitigation: only the running daemon writes it; spawn probe must complete before any write. The PID file is the authoritative single-writer signal. Severity: Low.
8. **NEW — Port conflict on `:7733` from non-agentboard processes.** `/api/health` probe distinguishes our daemon from a stranger. If the port is held by something else, the daemon must fail loudly and surface the conflict in `agentboard status`. Severity: Low.

## 6. Open questions

All previously open questions are resolved by the locked decisions (transport, two processes, env+flag for repo, JSON registry, no auto-spawn in v1). No new blockers for the spec phase.

## 7. Estimated review workload

Medium. Ballpark: **650-850 LOC changed**, distributed roughly as:

- `src/cli/` — ~150 LOC (new subcommands, spawn logic, signal handlers).
- `src/db/connection.ts` — ~40 LOC (Map cache, normalization).
- `src/server/app.ts` + `src/server/rest.ts` — ~200 LOC (Fastify hook, `req.db` plumbing, `process.cwd()` removal).
- `src/mcp/transport.ts` + new `src/mcp/server.ts` STDIO entry — ~120 LOC.
- New daemon endpoints (`/internal/notify`, `/api/daemon/repos`) — ~80 LOC.
- SPA (`App.tsx`, `api.ts`, `ws.ts`, `TopBar.tsx`) — ~150 LOC.
- README + `mcp.json` snippet — ~30 LOC.

This is above the 400-line single-PR comfort threshold, so the tasks phase should plan for either chained PRs (daemon decoupling → STDIO entry → SPA selector) or an upfront `size:exception` decision.

## 8. Acceptance criteria

Binary and testable. The change is done when all of these hold:

1. **STDIO bootstrap works cold.** An MCP client configured with `{ "command": "npx", "args": ["-y", "@jobshimo/agentboard", "mcp"], "env": { "AGENTBOARD_REPO": "<abs-path>" } }` initializes successfully without any agentboard daemon running.
2. **Daemon is not required for MCP.** Killing `:7733` does not break MCP tool calls; `pollEvents` still works (DB is authoritative).
3. **`npx @jobshimo/agentboard` is idempotent.** Running it from repo A then repo B without killing in between: B's invocation opens the browser at repo B against the already-running daemon; no port conflict, no second daemon process.
4. **Per-request DB resolution.** `GET /api/health?repo=/path/to/repoA` and `GET /api/health?repo=/path/to/repoB` from the same daemon return responses scoped to each repo's DB. Removing `?repo=` returns a 400 with a clear error.
5. **SPA repo switching.** TopBar dropdown lists every repo the daemon has seen (from `~/.agentboard/daemon.json`). Selecting one re-fetches Activity, Tasks, Workflows, and Feedback for that repo and rebinds the WS. State persists across page reloads via `localStorage`.
6. **Inter-process notification path.** An MCP tool call from the STDIO process produces an event row in `<repo>/.agentboard/db.sqlite` AND, if the daemon is up, a WS push to any SPA client viewing that repo, within 500ms.
7. **`agentboard status` is honest.** Returns running state, PID, port, and the list of known repos. Exits non-zero if the daemon is not running.
8. **`agentboard stop` is graceful.** Sends SIGTERM, waits for handlers to flush, removes the PID file, returns exit 0. Repeat invocations return a clear "not running" message, exit 0.
9. **No `process.cwd()` reads remain in request handlers.** Grep is clean for `process.cwd()` inside `src/server/rest.ts` and `src/server/app.ts`.
10. **Windows path keys do not double-open the DB.** Two requests with `?repo=C:\Users\X\repo` and `?repo=c:\users\x\repo` resolve to the same cached `Database` instance.

---

## Appendix: what is NOT changing

To prevent scope creep during spec and design:

- `src/domain/`, `src/events/`, `src/feedback/`, `src/workflows/`, `src/config/`, all 14 MCP tools in `src/mcp/tools/`, the SQLite schema, the activation logic, the SPA layout outside TopBar — all untouched.
- `DESIGN.md` root document — the proposal supersedes the ambiguous "one process exposes three surfaces" wording for implementation purposes, but the design document itself is not rewritten here.
