# Tasks — agentboard-mvp

> Implementation checklist for the agentboard MVP.
> Derived from: spec (`openspec/changes/agentboard-mvp/specs/`), design (`openspec/changes/agentboard-mvp/design.md`), and UI deliverables (`agentboard/`).
> Every task names the conventional commit it will produce. Group = work-unit-commit slice.
> Phase ordering: Infrastructure → Implementation (S0–S10) → Testing → Documentation.

---

## Phase 1 — Infrastructure

| # | Task | Commit type | Spec refs | Can parallel? |
|---|------|-------------|-----------|---------------|
| 1.1 | [x] Bootstrap repo: `package.json` (name `@jobshimo/agentboard`, `engines: {node: ">=20.11"}`), `tsconfig.json` (strict, NodeNext for server; Bundler for web), `tsconfig.web.json`, root `.gitignore` (`.agentboard/`, `dist/`, `node_modules/`). Install runtime deps: `fastify`, `@fastify/websocket`, `@modelcontextprotocol/sdk`, `better-sqlite3`, `js-yaml`, `zod`, `pino`. | `chore(infra): bootstrap package and tsconfig` | storage.md, launcher.md, design §2.1–2.6 | No (foundation) |
| 1.2 | [x] Install and configure Vitest: dev-deps `vitest`, `@vitest/coverage-v8`, `jsdom`. Add `scripts.test` (`vitest run`) and `scripts.test:watch` (`vitest`). Add `vitest.config.ts` with two environments: `node` for `src/server\|db\|…`, `jsdom` for `src/web`. Add a single passing smoke-test `src/__tests__/smoke.test.ts` (`expect(1+1).toBe(2)`). | `chore(test): install Vitest and add smoke test` | design §2.11, design §8 item 4 | After 1.1 |
| 1.3 | [x] Vite SPA scaffold: `src/web/index.html`, `src/web/vite.config.ts` (output to `dist/web/`), React 18 + TypeScript dev-deps (`vite`, `react`, `react-dom`, `@types/react`, `@types/react-dom`, `react-markdown`). Add `scripts.build:web` and `scripts.dev:web`. Wire `dist/web/` into `.gitignore`. | `chore(web): scaffold Vite + React SPA` | design §2.9, design §5, realtime-ui.md | After 1.1 |
| 1.4 | [x] Directory skeleton: create all `src/` subdirectories (server, db/migrations, workflows, domain, events, feedback, mcp/tools, web/src/{components,views,lib,chrome,icons,i18n}, cli, config) with a `.gitkeep` where no code yet. This makes the module layout visible before any code lands. | `chore(infra): create src module skeleton` | design §1 module layout | After 1.1 |

---

## Phase 2 — Implementation

Slices are ordered by dependency. Sequential constraints noted per slice.

---

### S0 — No separate slice (infra tasks 1.2 & 1.3 cover it)

---

### Slice S1 — DB Foundation

**Depends on**: Phase 1 complete.
**Commit scope**: `feat(db)`

| # | Task | Commit | Spec refs |
|---|------|--------|-----------|
| 2.1.1 | [x] `src/db/connection.ts`: open `better-sqlite3` DB at `<cwd>/.agentboard/db.sqlite`; set `pragma journal_mode=WAL; pragma synchronous=NORMAL; pragma foreign_keys=ON`. Export `getDb()` singleton. | `feat(db): SQLite connection with WAL pragmas` | storage.md invariant 1, design §2.5, design §3 notes |
| 2.1.2 | [x] `src/db/migrations/0001_init.sql`: full schema — `tasks`, `subtasks`, `discussion_entries`, `events`, `agent_sessions`, `schema_migrations` tables with all CHECK constraints and indexes. Matches design §3 field-for-field. | `feat(db): initial schema migration (all tables)` | storage.md, domain-model.md, event-queue.md, design §3 |
| 2.1.3 | [x] `src/db/migrate.ts`: versioned, idempotent runner — reads `schema_migrations`, applies numbered SQL files in order, records each in a transaction. Called from server start and `agentboard init`. | `feat(db): idempotent migration runner` | storage.md, launcher.md (first-run), design §6.5 |
| 2.1.4 | [x] `src/domain/ids.ts`: `T-NN` task id generator + `s-NN` subtask id generator. Scoped to current DB max. | `feat(domain): T-NN / s-NN id generator` | domain-model.md §ID format, design §1 |
| 2.1.5 | [x] Tests: `src/db/__tests__/migrate.test.ts` — in-memory (`:memory:`) migration run is idempotent; all tables exist after two runs; schema_migrations has one row per migration file. | `test(db): migration idempotency` | design §2.11 (Vitest) |

---

### Slice S2 — Domain Core + Event Emit

**Depends on**: S1 complete.
**Commit scope**: `feat(domain)`, `feat(events)`

| # | Task | Commit | Spec refs |
|---|------|--------|-----------|
| 2.2.1 | `src/domain/subtask.ts`: six-state machine — `SubtaskStatus` union type; `validTransitions` map; `advanceState(current)` (returns next valid state for click-dot UX); `isTerminal(status)` predicate. | `feat(domain): six-state subtask machine` | domain-model.md (exactly 6 states), design §5.4 subtask controls |
| 2.2.2 | `src/domain/task.ts`: `createReferenced(opts)` and `createLocal(opts)` — insert into `tasks` table, apply workflow snapshot placeholder (empty until S3). `derivedStatus(subtasks[])` — formula: all terminal → `done`; any `blocked` → `blocked`; any `in-progress` → `active`; else → `backlog`. Recomputed in same tx as subtask writes. | `feat(domain): task create and derivedStatus` | domain-model.md, design §3 notes on derived_status |
| 2.2.3 | `src/domain/discussion.ts`: `appendEntry(taskId, author, body, tag?)` — insert into `discussion_entries`; throw if task not found. `getEntries(taskId, limit?)` — returns entries in id ASC order; if count > 50 returns a summary block per spec. | `feat(domain): discussion append-only entries` | domain-model.md, design §4.1 discussion endpoint |
| 2.2.4 | `src/events/types.ts`: `EventType` const enum with all 10 types from `event-queue.md` (`status_change`, `comment_added`, `task_blocked`, `task_started`, `task_completed`, `feedback_added`, `agent_notification`, `custom_subtask_added`, `pr_comment`, `export_completed`). `EventOrigin` union. | `feat(events): event type enum (10 types)` | event-queue.md §event types, design §3.4 |
| 2.2.5 | `src/events/insert.ts`: `insertEvent(db, event)` — appends row to `events` table; calls `notifyWaiters(event)` (stub until S6); queues WS broadcast (stub until S5). Wraps in the caller's existing transaction — does NOT open its own. | `feat(events): event insert with waiter/WS hooks` | event-queue.md, design §7.3 concurrency |
| 2.2.6 | Tests: `src/domain/__tests__/subtask.test.ts` — state machine transitions; `isTerminal`; `advanceState`. `src/domain/__tests__/task.test.ts` — `derivedStatus` formula for all boundary cases. | `test(domain): subtask machine and derivedStatus` | domain-model.md invariants |

---

### Slice S3 — Workflows

**Depends on**: S2 complete (uses `domain/task` start hook).
**Commit scope**: `feat(workflows)`

| # | Task | Commit | Spec refs |
|---|------|--------|-----------|
| 2.3.1 | `src/workflows/schema.ts`: Zod schema for `WorkflowFile` — 8 fields: `id`, `name`, `description`, `steps[]` (each: `id`, `label`, `type`, `triggered_by?`, `blocks_next?`, `agent_hint?`, `can_agent_complete_alone?`, `requires_human?`). `triggered_by` validated against initial enum from design §2.15. Export `WorkflowFile` type. | `feat(workflows): Zod schema for WorkflowFile` | workflows.md §schema, design §2.7, §2.15 |
| 2.3.2 | `src/workflows/load.ts`: discover `~/.agentboard/workflows/*.yaml`; if per-repo override present (`.agentboard/workflows/`), use it exclusively (no merge). Parse with `js-yaml`, validate with Zod, return `WorkflowFile[]`. Friendly errors on schema violation. | `feat(workflows): YAML loader with Zod validation` | workflows.md §discovery, §override |
| 2.3.3 | `src/workflows/snapshot.ts`: `freezeWorkflow(workflow: WorkflowFile): JSON` — returns the workflow as immutable JSON ready to store in `tasks.workflow_snapshot`. `rehydrateSnapshot(json)` — parse back with Zod (no mutation after freeze). Wire into `domain/task.ts` `createReferenced`/`createLocal` to freeze at task-start time. | `feat(workflows): snapshot freeze/rehydrate` | workflows.md §snapshot immutability, design §1 S3 |
| 2.3.4 | Tests: `src/workflows/__tests__/schema.test.ts` — valid workflow passes; missing required field fails with message; unknown `triggered_by` value fails with message. `src/workflows/__tests__/snapshot.test.ts` — frozen snapshot survives round-trip; mutation of the original after freeze does not affect snapshot. | `test(workflows): schema validation and snapshot immutability` | workflows.md invariants |

---

### Slice S4 — Server + REST

**Depends on**: S2 complete (domain), S3 complete (workflows endpoint).
**Commit scope**: `feat(server)`

| # | Task | Commit | Spec refs |
|---|------|--------|-----------|
| 2.4.1 | `src/config/schema.ts` + `src/config/defaults.ts` + `src/config/load.ts`: Zod schema for `~/.agentboard/config.yaml` (6 keys per design §2.16). `loadConfig()` reads file if present, merges with defaults, validates. CLI flags override per-invocation (passed in, not stored). | `feat(config): YAML config loader with defaults` | design §2.16, launcher.md §flags |
| 2.4.2 | `src/server/port.ts`: `resolvePort(preferred: number): Promise<number>` — bind test; throw `PortInUseError` on conflict (never auto-increment). `formatPortError(port)` — message matching `TermErrPort` mock from `agentboard/cli.jsx`. | `feat(server): port resolution with non-zero-exit error` | launcher.md §port conflict, design §2.8, design §6.5 |
| 2.4.3 | `src/server/app.ts`: `buildApp(opts: AppOpts): FastifyInstance` — registers plugins: `@fastify/websocket`, `pino` logger (stderr). Mounts REST routes (`/api/*`), serves static `dist/web/` at `/`, health at `/api/health`. Pure factory; no `listen()` — that's `cli/start.ts`. | `feat(server): Fastify app factory (no listen)` | design §2.2, §7.1, §7.4 |
| 2.4.4 | `src/server/rest.ts`: all 12 REST routes from design §4.1. Zod-validated request bodies. Responses serialized through compactness rules (no discussion unless explicitly fetched; no internal fields). Error shape `{error:{code,message,hint?}}`. Routes: `GET /api/tasks`, `GET /api/tasks/:id`, `GET /api/tasks/:id/discussion`, `GET /api/tasks/:id/markdown`, `POST /api/tasks`, `POST /api/tasks/:id/comments`, `POST /api/tasks/:id/subtasks`, `PATCH /api/subtasks/:id`, `POST /api/tasks/:id/feedback`, `GET /api/workflows`, `POST /api/export`, `GET /api/health`. | `feat(server): REST API routes (12 endpoints)` | design §4.1, token-economy.md, domain-model.md |
| 2.4.5 | `src/server/markdown.ts`: `renderTaskMarkdown(task: TaskFull): string` — produce the markdown view per storage.md §derived-view spec. Used by `GET /api/tasks/:id/markdown`. | `feat(server): task markdown renderer` | storage.md §derived view, design §4.1 |
| 2.4.6 | Tests: `src/server/__tests__/rest.test.ts` — in-memory DB; test `GET /api/health` 200; `POST /api/tasks` creates task + returns compact shape; `PATCH /api/subtasks/:id` returns delta; `GET /api/tasks/:id/discussion` returns entries. Use `buildApp` factory directly. | `test(server): REST endpoint integration tests` | design §4.1 |

---

### Slice S5 — Realtime WebSocket

**Depends on**: S4 complete (`server/app.ts` already registers `@fastify/websocket`).
**Commit scope**: `feat(server)` (ws submodule)

| # | Task | Commit | Spec refs |
|---|------|--------|-----------|
| 2.5.1 | `src/server/ws.ts`: WS handler at `/ws`. `BroadcastManager` — maintains `Set<WebSocket>` of connected clients; `broadcast(msg)` sends to all. No subscribe protocol (single-user, MVP). Registered on `buildApp`. Replace stub in `events/insert.ts` with real `broadcastManager.broadcast(...)`. | `feat(server): WebSocket broadcast manager` | realtime-ui.md §push contract, design §4.2, §6.2 |
| 2.5.2 | Wire WS broadcast on every DB write: `domain/task.ts` and `domain/subtask.ts` writes call `insertEvent` → `insertEvent` calls `broadcastManager.broadcast` after commit. Push shape: `{event: EventType, task_id: string, entity_ids: string[]}` per realtime-ui.md §message shape. All 9 WS-triggering event types covered. | `feat(server): wire WS broadcast on domain writes` | realtime-ui.md §9 event types, design §6.2 |
| 2.5.3 | Tests: `src/server/__tests__/ws.test.ts` — connect to test server WS; `PATCH /api/subtasks/:id` triggers WS push with correct shape; disconnect + reconnect does not error. | `test(server): WebSocket push on write` | realtime-ui.md |

---

### Slice S6 — Event Queue (poll / wait / GC)

**Depends on**: S2 (event insert stub), S5 (WS hub in place).
**Commit scope**: `feat(events)`

| # | Task | Commit | Spec refs |
|---|------|--------|-----------|
| 2.6.1 | `src/events/poll.ts`: `pollEvents(db, sessionId, taskId?): {events: Event[], cursor: number}` — reads from cursor stored in `agent_sessions.last_event_id`; advances cursor; returns immediately (non-blocking). | `feat(events): poll_events non-blocking read` | event-queue.md §poll_events |
| 2.6.2 | `src/events/wait.ts`: in-memory `WaiterRegistry` — `Map<sessionId, Waiter[]>`. `wait(sessionId, taskId?, types?, timeout_ms): Promise<{events, cursor, timed_out}>` — parks on a `Promise`; `notifyWaiters(event)` wakes matching waiters after event insert; resolves on timeout. Replace stub in `events/insert.ts`. Long-poll holds NO DB cursor (per design §7.3). | `feat(events): wait_for_event with in-memory waiter registry` | event-queue.md §wait_for_event, design §6.3, §7.3 |
| 2.6.3 | `src/events/gc.ts`: `runGC(db, config)` — three-phase in separate transactions: (1) zombie session prune (last_seen < now-30d), (2) consumed-by-all delete (events below `MIN(last_event_id)` across live sessions), (3) per-task backstop trim (keep newest 10000 per task). Schedule via `setInterval` every 5 minutes from `cli/start.ts`. | `feat(events): three-phase GC (zombie + consumed-by-all + backstop)` | event-queue.md §GC, design §2.14, §6.4 |
| 2.6.4 | Tests: `src/events/__tests__/poll.test.ts` — cursor advances; empty result when no new events. `src/events/__tests__/wait.test.ts` — waiter resolves on matching event insert; resolves with `timed_out:true` on timeout; filters by `task_id` and `types`. `src/events/__tests__/gc.test.ts` — zombie pruned; consumed-by-all deleted; backstop trims to 10000. | `test(events): poll, wait, and GC` | event-queue.md invariants |

---

### Slice S7 — MCP

**Depends on**: S4 (Fastify app), S6 (poll/wait in place).
**Commit scope**: `feat(mcp)`

| # | Task | Commit | Spec refs |
|---|------|--------|-----------|
| 2.7.1 | `src/mcp/transport.ts`: mount `@modelcontextprotocol/sdk` Streamable HTTP transport on `/mcp` via Fastify raw handler. Handles SSE upgrades and MCP session header for piggy-back. | `feat(mcp): Streamable HTTP transport on /mcp` | mcp-surface.md §transport, design §2.4 |
| 2.7.2 | `src/mcp/activation.ts`: `ActivationState` — `dormant | active`. `activate(db): {session_id, tools[]}` — inserts `agent_sessions` row (or reuses if within zombie window for same host), flips state, emits `notifications/tools/list_changed`. `deactivate(sessionId)` — marks session inactive, flips back to dormant. Config-driven `activation` mode: `lazy` (default), `always-on`, `prompt`. | `feat(mcp): lazy activation state machine` | mcp-surface.md §lazy activation, design §2.12, §6.1 |
| 2.7.3 | `src/mcp/compact.ts`: `compactTask(task)`, `compactSubtask(subtask)` — strip fields not in the compact shapes per token-economy.md. `deltaUpdate(prev, next)` — returns only changed fields. Used by all tool handlers. | `feat(mcp): compact and delta-update helpers` | token-economy.md, mcp-surface.md §delta updates |
| 2.7.4 | `src/mcp/piggyback.ts`: `withPiggyback(db, sessionId, result)` — attaches `pending_events: Event[]` to every active-tool response when `attention.agent_sees_human_events: true`. Advances cursor as side-effect. | `feat(mcp): pending_events piggyback on tool responses` | event-queue.md §piggyback, mcp-surface.md §piggyback, design §4.3 |
| 2.7.5 | `src/mcp/tools/` — one file per tool (14 files): `task.list.ts`, `task.get.ts`, `task.start.ts`, `task.complete.ts`, `task.comment.ts`, `task.add_custom_subtask.ts`, `subtask.update.ts`, `feedback.add.ts`, `feedback.search.ts`, `external.fetch.ts`, `agentboard.poll_events.ts`, `agentboard.wait_for_event.ts`, `agentboard.notify_human.ts`, `agentboard.deactivate.ts`. Each: Zod input schema + thin handler calling domain/events/feedback service + `withPiggyback` wrap. Dormant registry: `agentboard.activate` only. | `feat(mcp): all 14 active-state tool handlers` | mcp-surface.md §tool signatures, design §4.3 |
| 2.7.6 | Tests: `src/mcp/__tests__/activation.test.ts` — dormant exposes 1 tool; activate returns session_id + 14 tools; deactivate returns to dormant. `src/mcp/__tests__/piggyback.test.ts` — events attached; cursor advances; empty when no pending events. | `test(mcp): activation state and piggyback` | mcp-surface.md invariants |

---

### Slice S8 — Feedback

**Depends on**: S2 (event insert), S4 (REST `/api/tasks/:id/feedback`).
**Commit scope**: `feat(feedback)`
**Can run in parallel with S7** (no dependency between them).

| # | Task | Commit | Spec refs |
|---|------|--------|-----------|
| 2.8.1 | `src/feedback/add.ts`: `addFeedback(db, {target, text, severity})` — validates severity ∈ `info \| correction \| failed_in_practice`; inserts `feedback_added` event via `insertEvent`. Returns `{ok: true, event_id}`. Closed tasks remain feedbackable. | `feat(feedback): feedback.add with event insert` | feedback.md §feedback.add, design §4.3 |
| 2.8.2 | `src/feedback/score.ts`: pure `score(feedback, context): number` — weighted formula from design §2.13 (`3×workflow_match + 3×file_overlap + 2×task_type + 1×keyword + severity_boost + recency_decay(half_life=14d)`). No DB calls. | `feat(feedback): pure scoring function` | feedback.md §relevance, design §2.13 |
| 2.8.3 | `src/feedback/search.ts`: `searchFeedback(db, context, limit?)` — queries `feedback_added` events from `events` table; scores each with `score.ts`; filters same-task unless `include_same_task`; sorts `score DESC, created_at DESC`; returns top N (default 5, max 50). | `feat(feedback): feedback.search heuristic v1` | feedback.md §feedback.search, design §2.13 |
| 2.8.4 | Tests: `src/feedback/__tests__/score.test.ts` — workflow match adds 3; severity boost correct; recency decay near-zero for old entries. `src/feedback/__tests__/search.test.ts` — with 3 seeded feedback entries, correct order returned; same-task filter works; limit respected. | `test(feedback): score and search` | feedback.md invariants |

---

### Slice S9 — CLI + Launcher

**Depends on**: S4 (server port, buildApp), S6 (GC schedule hook), config (2.4.1).
**Commit scope**: `feat(cli)`

| # | Task | Commit | Spec refs |
|---|------|--------|-----------|
| 2.9.1 | `src/cli/version.ts`: reads `version` from `package.json`. `src/cli/output.ts`: `NO_COLOR`-aware print helpers — `printLine`, `printBanner`, `printError`. Output matches the `TermLaunch`, `TermFirstRun`, `TermErrPort`, `TermHelp` mocks in `agentboard/cli.jsx`. Stdout for banner, stderr for errors. | `feat(cli): NO_COLOR-aware output helpers` | launcher.md §banner, design §7.1, agentboard/cli.jsx |
| 2.9.2 | `src/cli/init.ts`: `runInit(cwd)` — create `.agentboard/` directory; run migrations; ensure `.agentboard/db.sqlite` line is in `.gitignore`; print `TermFirstRun` banner. Idempotent (safe to run twice). | `feat(cli): agentboard init subcommand` | launcher.md §init, design §6.5 |
| 2.9.3 | `src/cli/export.ts`: `runExport(db, outputDir?)` — render markdown for all tasks via `server/markdown.ts`; write each to `.agentboard/snapshot/<task-id>.md`; emit `export_completed` event; print count + path. | `feat(cli): agentboard export subcommand` | launcher.md §export, storage.md §derived view |
| 2.9.4 | `src/cli/start.ts`: `runStart(opts: {port, noOpen, verbose})` — call `runInit` (idempotent), `buildApp`, bind port via `resolvePort`, schedule GC `setInterval`, print `TermLaunch` (or `TermFirstRun` on first run), open browser unless `--no-open`. On `PortInUseError` print `TermErrPort` + exit 1. Server binds `127.0.0.1` only. | `feat(cli): server start with first-run and port error handling` | launcher.md §start, design §2.8, §6.5, §7.4 |
| 2.9.5 | `src/cli/index.ts`: `parseArgv(argv)` — dispatch: no subcommand → `runStart`; `init` → `runInit`; `export` → `runExport`; `--help` / `-h` → `TermHelp`; `--version` / `-v` → version string; `--port <n>` / `--no-open` / `--verbose` parsed and forwarded. No dependencies on `commander` — hand-rolled for minimal footprint. | `feat(cli): argv parser and subcommand dispatch` | launcher.md §flags, design §2.9 |
| 2.9.6 | Wire `package.json` `"bin": {"agentboard": "dist/cli/index.js"}` and `"main": "dist/cli/index.js"`. Add `scripts.build` (tsc for server + cli) and `scripts.prepublishOnly` (build + build:web). | `chore(cli): wire npm bin and build scripts` | launcher.md §distribution |
| 2.9.7 | Tests: `src/cli/__tests__/argv.test.ts` — `--help` prints help; `--version` prints version; unknown subcommand prints error. | `test(cli): argv dispatch` | launcher.md |

---

### Slice S10 — Web SPA

**Depends on**: S4 (REST), S5 (WS). Split into four chained sub-slices — each independently reviewable and under 400 lines.

---

#### S10a — Chrome + Routing

| # | Task | Commit | Spec refs |
|---|------|--------|-----------|
| 2.10a.1 | `src/web/src/lib/ws.ts`: reconnecting WS client — exponential backoff 250ms→8s; surface `'reconnecting'` after first failure, `'offline'` after 5; refetch `/api/tasks` on reconnect. | `feat(web): reconnecting WebSocket client` | realtime-ui.md §auto-reconnect, design §5.3 |
| 2.10a.2 | `src/web/src/lib/api.ts`: `fetchTasks()`, `fetchTask(id)`, `fetchDiscussion(id)` — thin wrappers over `fetch`. | `feat(web): REST API client` | design §5.3 |
| 2.10a.3 | `src/web/src/lib/store.ts`: `StoreState` shape; `useTasks()`, `useTask(id)`, `useDiscussion(id)`, `useConnection()` via `useSyncExternalStore`. WS push calls `store.invalidate(taskId)` → re-fetches entity → `notifyListeners()`. | `feat(web): useSyncExternalStore WS-backed store` | design §5.3, realtime-ui.md §signal-only push |
| 2.10a.4 | `src/web/src/i18n/en.ts`: all UI copy strings as a flat key→string map. English only. Keys designed for Spanish drop-in. | `feat(web): i18n copy module (en)` | design §5.4 i18n |
| 2.10a.5 | `src/web/src/styles.css`: verbatim copy of `agentboard/styles.css`. Theme classes `theme-dark` / `theme-light` on `body`. | `feat(web): styles verbatim from deliverable` | design §5.2 |
| 2.10a.6 | `src/web/src/icons/`: port all icon components from `agentboard/icons.jsx` to individual `.tsx` files. | `feat(web): icon components from deliverable` | design §5.1 icons |
| 2.10a.7 | `src/web/src/chrome/TopBar.tsx` + `src/web/src/chrome/Sidebar.tsx`: mirror `agentboard/chrome.jsx`. `ConnectionIndicator.tsx` wired to `useConnection()`. Notification bell wired to `useNotifications()` (stack-by-task, count per design §5.4). `⌘K` placeholder "coming soon" per design §5.4 search palette. | `feat(web): app chrome — TopBar, Sidebar, ConnectionIndicator` | design §5.1, §5.4, agentboard/chrome.jsx |
| 2.10a.8 | `src/web/src/App.tsx`: local state `view: 'board' \| 'detail' \| 'settings'`; `selectedTaskId`; mount TopBar + Sidebar + view switcher. Mirrors `agentboard/prototype.jsx` wiring. | `feat(web): App root and view routing` | design §5.1 App.tsx, agentboard/prototype.jsx |

---

#### S10b — Board View

**Depends on**: S10a.

| # | Task | Commit | Spec refs |
|---|------|--------|-----------|
| 2.10b.1 | `src/web/src/components/StateDot.tsx`, `WorkflowStrip.tsx`: atom components. `StateDot` uses `data-state` selector; click → `subtask.update` via REST PATCH; right-click → context menu with `blocked / failed / skipped / done`. | `feat(web): StateDot and WorkflowStrip atoms` | design §5.1, §5.4 subtask controls, agentboard/components.jsx |
| 2.10b.2 | `src/web/src/components/ExternalRefChip.tsx`, `OriginChip.tsx`, `StatusBadge.tsx`: mirror deliverable. `ExternalRefChip` renders github/jira/linear/local glyphs. | `feat(web): ExternalRefChip, OriginChip, StatusBadge` | design §5.1, agentboard/components.jsx |
| 2.10b.3 | `src/web/src/components/TaskCard.tsx`: compact 2-row card. Click navigates to TaskDetail. `WorkflowStrip` embedded. Realtime: card translates between columns on `derived_status` change with 250ms ease-out CSS transition. | `feat(web): TaskCard with realtime column transition` | design §5.1, §5.4 realtime motion, agentboard/components.jsx |
| 2.10b.4 | `src/web/src/views/Board.tsx`: Kanban board. Column default = `derived_status` macro mode (A). Workflow-step mode (B) available as toggle per prototype. Both Done column AND "Closed" sidebar view (shared filter logic). Uses `useTasks()`. | `feat(web): Board view with macro-status and workflow-step columns` | design §5.4 column mode, agentboard/board.jsx |

---

#### S10c — TaskDetail View

**Depends on**: S10b (TaskCard wires navigation to TaskDetail).

| # | Task | Commit | Spec refs |
|---|------|--------|-----------|
| 2.10c.1 | `src/web/src/components/SubtaskRow.tsx`: detail row with `requiresHuman` chip (`can_agent_complete_alone: false`). State dot with same click/right-click controls as board. `triggered_by` badge when set. | `feat(web): SubtaskRow with human-required chip` | design §5.1, §5.4, agentboard/components.jsx |
| 2.10c.2 | `src/web/src/components/Message.tsx`, `AuthorAvatar.tsx`, `Markdown.tsx`: `Markdown` uses `react-markdown` (note: audit gzipped size; if >25kB over hand-rolled, replace per design §8 item 5). | `feat(web): Message, AuthorAvatar, Markdown components` | design §5.1, §8 item 5, agentboard/components.jsx |
| 2.10c.3 | `src/web/src/components/NotificationItem.tsx`: bell popover row. Stack-by-task with count. | `feat(web): NotificationItem for bell popover` | design §5.4 notification grouping, agentboard/components.jsx |
| 2.10c.4 | `src/web/src/views/TaskDetail.tsx`: full-page replacement view. Subtask list with `SubtaskRow`. Discussion thread with `Message`. Composer (textarea + POST `/api/tasks/:id/comments`). `useTask(id)` + `useDiscussion(id)`. Feedback form (POST `/api/tasks/:id/feedback`). | `feat(web): TaskDetail full-page view with discussion and feedback` | design §5.1, §5.4 task detail, agentboard/detail.jsx |

---

#### S10d — Settings View

**Depends on**: S10a (chrome is in place).
**Can run in parallel with S10c**.

| # | Task | Commit | Spec refs |
|---|------|--------|-----------|
| 2.10d.1 | `src/web/src/views/Settings.tsx`: three sections — (1) Workflows list (`GET /api/workflows`), (2) MCP activation mode selector (lazy / always-on / prompt — PATCH config; server restart note), (3) Attention config toggles, (4) Export button (POST `/api/export`). Mirrors `agentboard/settings.jsx`. | `feat(web): Settings view — workflows, MCP, attention, export` | design §5.1, agentboard/settings.jsx, mcp-surface.md §activation modes |

---

## Phase 3 — Testing

> Applies only to cross-cutting or integration tests not already adjacent to their implementation slice. Per-slice unit tests are in Phase 2 above.

| # | Task | Commit | Spec refs | Depends on |
|---|------|--------|-----------|------------|
| 3.1 | `src/__tests__/e2e.test.ts` — spin up real `buildApp` + in-memory SQLite; full agent flow: create task → start → `subtask.update` (in-progress) → WS push received → `subtask.update` (done) → `task.complete` → verify `derived_status=done`. | `test(e2e): agent full task lifecycle` | All slices S1–S9 | All S1–S9 |
| 3.2 | `src/__tests__/mcp-token-budget.test.ts` — activate MCP; serialize all dormant tool definitions; assert total token estimate ≤ 200. Activate; serialize all active tool definitions; assert ≤ 2000. | `test(mcp): token budget guard` | token-economy.md | S7 |
| 3.3 | `src/__tests__/gc-integration.test.ts` — seed 10001 events for one task; run GC; assert count is 10000. Seed zombie session (last_seen > 30d); run GC; assert session deleted and its events purged. | `test(events): GC integration with real DB` | event-queue.md §GC | S6 |

---

## Phase 4 — Documentation

| # | Task | Commit | Spec refs | Depends on |
|---|------|--------|-----------|------------|
| 4.1 | `README.md`: minimal — `npx @jobshimo/agentboard` quick-start; MCP config snippet for Claude Code (add `agentboard` to `mcpServers`); `init` / `export` commands; `--port` flag. Known-good host matrix (Claude Code as first entry). No Co-Authored-By. | `docs(readme): quick-start, MCP config, and host matrix` | launcher.md, mcp-surface.md §host matrix, design §2.4 | S9 done |
| 4.2 | `src/web/src/i18n/en.ts` copy audit: verify every visible string in all four views (Board, TaskDetail, Settings, chrome) is keyed in the copy module, not hardcoded. Fix any stray literals. | `fix(web): audit and complete i18n copy keys` | design §5.4 i18n | S10d done |
| 4.3 | `.agentboard/workflows/` default template: ship a `coding-task.yaml` example workflow (implement → tests → review → commit steps) in the npm package under `templates/workflows/` so `agentboard init` has something to copy. | `docs(workflows): default coding-task workflow template` | workflows.md §discovery | S9 done |

---

## Dependency Graph

```
1.1 → 1.2 → (S0 complete — TDD on)
    → 1.3
    → 1.4

S1 (2.1.x) → S2 (2.2.x) → S3 (2.3.x) → S4 (2.4.x) → S5 (2.5.x) → S6 (2.6.x) → S7 (2.7.x)
                                                     ↘                                 ↗
                                                       S8 (2.8.x) [parallel to S7]

S4 → S9 (2.9.x)
S4 + S5 → S10a → S10b → S10c
                 → S10d [parallel to S10c]

S1–S9 → Phase 3
S9 + S10d → Phase 4
```

---

## Review Workload Forecast

| Slice | Estimated changed lines | Risk | Strategy |
|-------|------------------------|------|----------|
| S1 — DB foundation | ~150 | Low | Single PR |
| S2 — Domain core + event emit | ~200 | Low | Single PR |
| S3 — Workflows | ~180 | Low | Single PR |
| S4 — Server + REST | ~380 | Medium | Single PR (tight; reviewer watches for sprawl) |
| S5 — Realtime WS | ~120 | Low | Single PR |
| S6 — Events queue | ~220 | Medium | Single PR |
| S7 — MCP | ~370 | High | Single PR (14 tool files — each tiny; stay under 400 total) |
| S8 — Feedback | ~160 | Low | Single PR (parallel with S7) |
| S9 — CLI + launcher | ~250 | Low | Single PR |
| S10a — Chrome + routing | ~320 | Medium | Single PR (chained sub-slice) |
| S10b — Board view | ~280 | Medium | Single PR (chained sub-slice) |
| S10c — TaskDetail | ~260 | Medium | Single PR (chained sub-slice) |
| S10d — Settings | ~120 | Low | Single PR (chained sub-slice) |
| Phase 1 — Infra | ~180 | Low | Single PR (prerequisite) |
| Phase 3 — Cross-cutting tests | ~200 | Low | Single PR |
| Phase 4 — Docs | ~120 | Low | Single PR |

**Total estimated lines**: ~3510 across all slices
**Chained PRs recommended**: Yes — S10 is mandatory 4-slice chain (S10a/b/c/d). S4 and S7 are high-density single PRs near the 400-line ceiling; monitor during apply.
**400-line budget risk**: Medium overall. High for S4 and S7 individually. S10 is mitigated by the 4-way split.
**Decision needed before apply**: Yes — confirm PR strategy per slice before `sdd-apply` starts S4 and S7.
**Recommended slicing**:
- Phase 1 → single PR (all infra)
- S1–S3 → one PR each (all small)
- S4 → single PR, reviewer watches line count; split `rest.ts` + `markdown.ts` into separate commits if needed
- S5 → single PR
- S6 → single PR
- S7 → single PR; tool files are 14 × ~20 lines each = ~280 lines for tools alone; monitor transport + activation overhead
- S8 → single PR (parallel with S7)
- S9 → single PR
- S10a → PR 1 of 4 (chrome + infra)
- S10b → PR 2 of 4 (board)
- S10c → PR 3 of 4 (task detail)
- S10d → PR 4 of 4 (settings) — can open in parallel with S10c once S10a merges
- Phase 3 → single PR after S1–S9
- Phase 4 → single PR after all implementation done
