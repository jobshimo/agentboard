# Tasks: agentboard-daemon-refactor

Status: tasks | Persistence: hybrid | Spec: engram #613 | Design: engram #614

> Strict TDD is ACTIVE. Each slice's tasks are ordered RED → GREEN → REFACTOR.
> Tests land in the same commit as the behavior they verify. No "tests later" bucket.

---

## Section 1: Slices

---

### S1 — Per-repo DB cache + per-request injection

**Goal**: Replace the `_db` singleton with a `Map<string, Db>` and inject `req.db` + `req.repoRoot` via a Fastify `onRequest` hook. This is the load-bearing foundation; every subsequent slice depends on it.

**Satisfies**: REQ-S-01, REQ-S-02, REQ-R-01 (HTTP 400 side), REQ-D-06 (Win32 path normalization)
**Depends on**: nothing — this is slice 1.
**LOC estimate**: ~185

Tasks:

- [x] `src/db/connection.ts` (lines 8–45 full rewrite, ~45 LOC)
  - Remove `_db: Db | null` singleton (line 8).
  - Add `dbCache: Map<string, Db>`.
  - Add `normalizeRepoPath(p: string): string` — `path.resolve(p)` + `.toLowerCase()` on `process.platform === "win32"` + strip trailing sep.
  - Add `getDbForRepo(repoRoot: string): Db` — normalizes key, creates `Database` + runs `applyPragmas` + `runMigrations` on cache miss, returns cached instance on hit.
  - Add `closeAllDbs(): void` — iterates cache, calls `db.close()`, clears map.
  - Keep `closeDb()` as a deprecated shim delegating to `closeAllDbs()` for callers in `start.ts` (RED: test that `closeDb()` still compiles and closes; GREEN: implement shim).

- [x] `src/server/fastify-augment.d.ts` (NEW file, ~15 LOC)
  - Module augmentation extending `FastifyRequest` with `db: Db`, `repoRoot: string`.
  - Import `better-sqlite3` type only (no runtime import).

- [x] `src/server/app.ts` — remove `AppOpts.db`, add `onRequest` hook (~60 LOC delta)
  - Remove `db: Db` from `AppOpts` (line 31); remove `mcpActivationMode` from `AppOpts` (line 32).
  - Add `app.decorateRequest("db", null)` + `app.decorateRequest("repoRoot", "")`.
  - Add `onRequest` hook (lines ~50+):
    - Skip list: `/api/health`, `/api/daemon/repos`, `/internal/notify`, `/ws`, SPA static prefix (`/`).
    - Read `req.query.repo`; if absent return `reply.status(400).send({ error: "repo_missing", hint: "add ?repo=<abs-path>" })`.
    - Validate: `path.isAbsolute(repo)` AND `existsSync(join(repo, ".agentboard", "db.sqlite"))`; if invalid return 400 `repo_invalid`.
    - `req.db = getDbForRepo(normalizedRepo)` + `req.repoRoot = normalizedRepo`.
  - Remove `AppOpts.db` threaded through `buildMcpServer` / `registerRestRoutes` / `createTriggerMaterializer` calls (those now read `req.db`). Keep `triggerMaterializer` per-repo — cache it alongside `getDbForRepo` (design §2 note on per-repo triple; defer per-repo triple to follow-up; v1 creates materializer per-request-first-time is acceptable; document the choice inline with a TODO).
  - Remove import of `registerMcpTransport` + `buildMcpServer` (MCP no longer lives in daemon). Remove HTTP MCP plugin entirely from `buildApp`.

- [x] `src/server/rest.ts` — replace `db` closure + `process.cwd()` sites (~40 LOC delta)
  - `registerRestRoutes(app, ...)` signature: remove `db: Db` parameter; read `req.db` inline.
  - Line 216 (`findWorkflowById({ repoRoot: process.cwd(), ... })`): replace `process.cwd()` with `req.repoRoot`.
  - Line 369 (`resolveWorkflowPaths({ repoRoot: process.cwd(), ... })`): replace with `req.repoRoot`.
  - Line 387 (`join(process.cwd(), ".agentboard", "snapshot")`): replace with `join(req.repoRoot, ".agentboard", "snapshot")`.
  - Rename `_req` → `req` at lines 367 and 386.

- [x] `src/cli/start.ts` — update `runStart` to not pass `db` to `buildApp` (~10 LOC delta, line 65–70)
  - Remove `const db = getDb(cwd)` (line 65) and `buildApp({ db, ... })` call.
  - `buildApp` no longer needs a `db` arg; update call site.
  - SIGTERM handler will be added in S2; for now update SIGINT handler (line 119) to call `closeAllDbs()` instead of `closeDb()`.

- [x] Tests: `src/__tests__/db-cache.test.ts` (NEW, ~35 LOC)
  - RED: test `normalizeRepoPath` round-trips on Win32 mixed-case input.
  - RED: test `getDbForRepo` returns same instance for two normalized-equivalent paths.
  - RED: test `closeAllDbs` closes all cached instances.
  - GREEN: implement (driven by production code above).

- [x] Tests: `src/__tests__/onrequest-hook.test.ts` (NEW, ~35 LOC)
  - RED: test `GET /api/tasks` without `?repo=` returns 400 `repo_missing`.
  - RED: test `GET /api/tasks?repo=<invalid>` returns 400 `repo_invalid`.
  - RED: test `GET /api/health` bypasses hook (no repo required, returns 200).
  - GREEN: driven by onRequest hook implementation above.

**S1 slice LOC total**: ~185

---

### S2 — Daemon identity, idempotent spawn, lifecycle commands

**Goal**: Decouple `start.ts` from `cwd`, wire idempotent daemon spawn (health probe + PID file), and add `agentboard stop` / `agentboard status` / `agentboard daemon` subcommands. Extend `/api/health` with `pid` and `port`.

**Satisfies**: REQ-L-01, REQ-L-02, REQ-L-04, REQ-L-05, REQ-D-01, REQ-D-02, REQ-D-03, REQ-D-07 (failure modes table items 1–3)
**Depends on**: S1 (daemon no longer owns `cwd`; `closeAllDbs` must exist).
**LOC estimate**: ~195

Tasks:

- [x] `src/cli/spawn-daemon.ts` (NEW, ~70 LOC)
  - `ForeignProcessOnPortError` class (extends Error, holds `port`).
  - `spawnDaemon(opts: { port: number; noOpen: boolean; agbHome: string })`: 
    1. Read PID file `~/.agentboard/daemon.pid`; if exists, `process.kill(pid, 0)` — stale if throws → `fs.unlinkSync(pid_path)`.
    2. `GET /api/health` with 500ms `AbortSignal.timeout`. 200+`ok=true` → already running (open browser if `!noOpen`; return).
    3. Non-200 → throw `ForeignProcessOnPortError`.
    4. Timeout/ECONNREFUSED → spawn child process (detached, unref), write PID file, wait for port readiness (poll health up to 3s).
  - Export `readPidFile`, `writePidFile`, `unlinkPidFile` helpers.

- [x] `src/cli/start.ts` — remove `cwd` from `StartOpts`; add SIGTERM; add PID lifecycle (~25 LOC delta)
  - `StartOpts`: remove `cwd: string` field. `runStart` no longer receives `cwd`.
  - Add SIGTERM handler (line 119 area): `process.once("SIGTERM", async () => { clearInterval(gcInterval); await app.close(); closeAllDbs(); unlinkPidFile(); process.exit(0); })`.
  - `writePidFile(process.pid)` after successful `app.listen`.

- [x] `src/cli/stop.ts` (NEW, ~25 LOC)
  - `runStop()`: read PID file; if missing → print "daemon not running"; exit 0.
  - `POST` is not an option since daemon may be foreign; use `process.kill(pid, "SIGTERM")`.
  - Poll `GET /api/health` up to 5s (100ms intervals); print "stopped" on gone; print "timed out" if still alive.
  - Idempotent: stale PID → unlink → "daemon not running".

- [x] `src/cli/status.ts` (NEW, ~30 LOC)
  - `runStatus()`: `GET /api/health` (200ms timeout).
  - On success: print port, PID, uptime_ms, version; then `GET /api/daemon/repos` and print repo list.
  - On failure: print "daemon not running"; `process.exit(1)`.

- [x] `src/server/app.ts` — extend `/api/health` response (~10 LOC delta, line 71–77)
  - Add `pid: process.pid` and `port: number` (accept port as runtime param injected by `runStart`) to health response.
  - REQ-D-01: identity check — `ok: true` is sufficient to identify "our" daemon vs a foreign process on the port.

- [x] `src/cli/index.ts` — add `daemon`, `stop`, `status` to `ParsedArgs`; update `parseArgv`; update `main` (~25 LOC delta)
  - Extend `ParsedArgs["command"]` union: add `"daemon" | "stop" | "status"`.
  - `"daemon"` is alias for `"start"` (REQ-L-02); map to same code path.
  - `"stop"` → `runStop()`.
  - `"status"` → `runStatus()`.
  - Default subcommand (no positional args) remains `"start"` (REQ-L-01 idempotent spawn).

- [x] Tests: `src/__tests__/spawn-daemon.test.ts` (NEW, ~35 LOC)
  - RED: test `ForeignProcessOnPortError` thrown when health returns non-200.
  - RED: test stale PID detection (mock `process.kill` to throw ESRCH, verify unlink called).
  - RED: test idempotent behavior when daemon already running (health returns 200+ok).
  - GREEN: implement.

- [x] Tests: `src/__tests__/stop-status.test.ts` (NEW, ~35 LOC) — integration test with in-process Fastify instance.
  - RED: `runStatus` exits non-zero when no daemon (mock fetch to reject).
  - RED: `/api/health` response includes `pid` and `port`.
  - GREEN: implement.

**S2 slice LOC total**: ~195

---

### S3 — Repo registry (`~/.agentboard/daemon.json` + `GET /api/daemon/repos`)

**Goal**: Persist known repos to `daemon.json` with atomic writes and debounced updates. Expose `GET /api/daemon/repos`. This registry feeds `agentboard status` and the SPA dropdown in S7.

**Satisfies**: REQ-S-03, REQ-D-04, REQ-R-05, REQ-D-07 (failure mode: corrupt registry)
**Depends on**: S1 (per-repo DB cache exists; `getDbForRepo` is the trigger point for registry upsert), S2 (only running daemon writes registry).
**LOC estimate**: ~110

Tasks:

- [x] `src/server/registry.ts` (NEW, ~65 LOC)
  - Schema v1: `{ version: 1, repos: Array<{ path: string; lastSeenAt: string }> }`.
  - `loadRegistry(agbHome: string): Registry` — missing file → empty; malformed JSON → rename to `.bak.<ts>`, return empty.
  - `saveRegistry(agbHome: string, registry: Registry): void` — atomic: write tmp file + `fs.renameSync`.
  - `upsertRepo(registry: Registry, repoPath: string): Registry` — find by normalized path; update `lastSeenAt` if exists; append if not; sort by `lastSeenAt` desc.
  - `debounced saveRegistry` (500ms debounce via `setTimeout`, cancel-on-reassign pattern — no lodash).
  - `debouncedUpsert(agbHome: string, repoPath: string): void` — public entry called from `onRequest` hook on cache miss.

- [x] `src/server/app.ts` — wire registry upsert into `onRequest` hook + add `/api/daemon/repos` route (~20 LOC delta)
  - In `onRequest` hook cache-miss branch: call `debouncedUpsert(agbHome, normalizedRepo)`.
  - Add `app.get("/api/daemon/repos", ...)` — reads in-memory registry (pass ref via closure); returns `{ repos }` sorted by `lastSeenAt` desc; EXEMPT from `?repo=` hook.
  - `buildApp` receives `agbHome: string` in opts.

- [x] `src/cli/start.ts` — pass `agbHome` to `buildApp` (~5 LOC delta)
  - Pass `agbHome` to `buildApp` opts.

- [x] Tests: `src/__tests__/registry.test.ts` (NEW, ~40 LOC)
  - RED: `loadRegistry` on missing file returns empty.
  - RED: `loadRegistry` on corrupt file renames `.bak.*` + returns empty.
  - RED: `upsertRepo` appends new path; updates `lastSeenAt` on duplicate; sorts desc.
  - RED: `saveRegistry` atomic (tmp + rename) — mock `fs.renameSync`.
  - GREEN: implement.

**S3 slice LOC total**: ~110

---

### S4 — STDIO MCP entry point (`agentboard mcp`)

**Goal**: New `src/cli/mcp.ts` STDIO entry point. Resolves repo from env/flag, mints session UUID, wires `StdioServerTransport`, propagates `mintedSessionId` through `McpServices` so all `extra.sessionId` readers fall back to it.

**Satisfies**: REQ-L-03, REQ-L-06, REQ-M-01, REQ-M-02, REQ-M-03, REQ-M-05
**Depends on**: S1 (`getDbForRepo`, `normalizeRepoPath`), S2 (`ActivationState.activate` with `presetSessionId`).
**LOC estimate**: ~145

Tasks:

- [x] `src/mcp/activation.ts` — extend `activate` to accept optional `presetSessionId` (~15 LOC delta, line 62)
  - `activate(db: Db, presetSessionId?: string): ActivateResult`.
  - If `presetSessionId` provided: use it as `session_id`; INSERT with that value.
  - Existing callers (daemon HTTP path calls `activate(db)` with no preset) unaffected.

- [x] `src/mcp/tools/types.ts` — add `mintedSessionId?: string` to `McpServices` (~5 LOC delta)
  - Optional field: `mintedSessionId?: string`.
  - All existing `McpServices` construction sites compile with no change (field is optional).

- [x] `src/mcp/tools` — update all 11 `extra.sessionId` readers to fall back to `services.mintedSessionId` (~20 LOC delta across 5 files)
  - Files: `agentboard.poll_events.ts:20`, `agentboard.wait_for_event.ts:23`, `agentboard.deactivate.ts:21`, `task.start.ts:55`, `agentboard.notify_human.ts:36`.
  - Pattern (consistent across files): `const sessionId = extra.sessionId ?? services.mintedSessionId`.
  - Files that use `withPiggyback(db, extra.sessionId, ...)`: same fallback pattern.

- [x] `src/cli/mcp.ts` (NEW, ~75 LOC)
  - Repo resolution: `process.env["AGENTBOARD_REPO"] ?? parsed.repo ?? null`. If null: `process.stderr.write(MCP_JSON_SNIPPET)` + `process.exit(1)`.
  - `normalizeRepoPath(repo)` — validate absolute + `.agentboard/db.sqlite` exists.
  - `const db = getDbForRepo(repoRoot)`.
  - `const sessionId = randomUUID()`.
  - `const activationState = new ActivationState("always-on")`.
  - `const services: McpServices = { db, waiters: new WaiterRegistry(), broadcaster: new BroadcastManager(), activation: activationState, eventHooks: { listeners: [] }, mintedSessionId: sessionId }`.
  - `const { mcpServer } = buildMcpServer(activationState, db, services)`.
  - `activationState.activate(db, sessionId)` — INSERT session row before `connect`.
  - `const transport = new StdioServerTransport()`.
  - `await mcpServer.connect(transport)`.
  - Block until stdin closes: `process.stdin.on("end", () => { closeAllDbs(); process.exit(0); })`.
  - No Fastify, no static files, no WebSocket imports.

- [x] `src/cli/index.ts` — add `"mcp"` to `ParsedArgs`; add `--repo` flag scoped to mcp; route to `runMcp` (~20 LOC delta)
  - Extend `ParsedArgs["command"]` union with `"mcp"`.
  - Add `repo: string | null` to `ParsedArgs`.
  - `--repo <path>` flag: only accepted when `command === "mcp"`; for any other command: print error + exit 1 (REQ-L-06).
  - `case "mcp"`: `await runMcp({ repo: parsed.repo })`.

- [x] Tests: `src/__tests__/mcp-entry.test.ts` (NEW, ~30 LOC)
  - RED: test repo resolution order — env wins over flag.
  - RED: test no repo → exit 1 with mcp.json snippet on stderr.
  - RED: test `--repo` flag rejected on non-mcp subcommands.
  - GREEN: implement.

**S4 slice LOC total**: ~145

---

### S5 — Inter-process notification (`POST /internal/notify` + `notifyDaemon`)

**Goal**: STDIO process fires a loopback POST after `insertEvent`. Daemon validates, re-fetches event from DB, calls broadcaster. Silent failure on daemon-down. Listener signature changes from `(event) => void` to `(event, repoRoot) => void`.

**Satisfies**: REQ-M-04, REQ-R-04, REQ-D-05, REQ-D-07 (failure mode: daemon down)
**Depends on**: S1 (per-repo DB cache in daemon, `getDbForRepo` in handler), S3 (registry-aware daemon), S4 (STDIO calls `notifyDaemon`).
**LOC estimate**: ~120

Tasks:

- [x] `src/events/insert.ts` — change `EventListener` signature (~10 LOC delta, line 18)
  - `EventListener = (event: InsertedEvent, repoRoot: string) => void`.
  - All call sites: `listener(event)` → `listener(event, repoRoot)`.
  - `insertEvent` signature: add `repoRoot: string` parameter.
  - TypeScript drives the full changelist across `broadcaster.ts`, `ws.ts`, `app.ts`, all rest.ts `insertEvent` call sites.

- [x] `src/server/broadcaster.ts` — update `listener` signature (~8 LOC delta, line 43)
  - `readonly listener = (event: InsertedEvent, repoRoot: string): void => { ... }`.
  - No behavioral change in this slice; `repoRoot` used in S6.

- [x] `src/events/wait.ts` — update `WaiterRegistry.listener` signature if it implements `EventListener` (verify, ~5 LOC delta)
  - Add `_repoRoot: string` parameter to match new signature.

- [x] `src/events/triggered-materializer.ts` — update listener signature (~5 LOC delta)
  - Add `_repoRoot: string` to match new signature.

- [x] `src/mcp/notify-daemon.ts` (NEW, ~25 LOC)
  - Read daemon port from `~/.agentboard/daemon.pid` or config default 7733.
  - `notifyDaemon(repoRoot: string, eventId: number): void` — fire-and-forget:
    ```
    fetch(`http://127.0.0.1:${port}/internal/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...secretHeader },
      body: JSON.stringify({ repo: repoRoot, event_id: eventId }),
      signal: AbortSignal.timeout(100),
    }).catch((e) => process.stderr.write(`notify-daemon: ${e}\n`));
    ```
  - Never awaited. Never throws to caller.

- [x] `src/cli/mcp.ts` — wire `notifyDaemon` into eventHooks listeners (~8 LOC delta)
  - Replace empty `listeners: []` with a hook that calls `notifyDaemon(repoRoot, eventId)` after each `insertEvent`.

- [x] `src/server/app.ts` — add `/internal/notify` route (~30 LOC delta)
  - Zod schema: `NotifyBody = z.object({ repo: z.string(), event_id: z.number().int() })`.
  - Handler: check `req.ip === "127.0.0.1"` or `"::1"` (loopback guard); 403 otherwise.
  - Optional secret check: `process.env["AGENTBOARD_NOTIFY_SECRET"]` vs `req.headers["x-agentboard-secret"]`; 403 on mismatch if env is set.
  - `getDbForRepo(normalizedRepo)`, SELECT event row, build `InsertedEvent`, call `broadcaster.listener(event, normalizedRepo)`. 204.
  - EXEMPT from `?repo=` hook.

- [x] Tests: `src/__tests__/notify.test.ts` (NEW, ~35 LOC)
  - RED: `POST /internal/notify` from non-loopback IP → 403.
  - RED: missing secret when env set → 403.
  - RED: valid payload → 204 + broadcaster called.
  - RED: `notifyDaemon` swallows error when daemon unreachable (mock `fetch` to reject).
  - GREEN: implement.

**S5 slice LOC total**: ~120

---

### S6 — WebSocket repo scoping

**Goal**: WS connect URL accepts `?repo=`, `BroadcastManager` scopes subscriber sets per repo, mis-matched repo pushes are discarded. Listener signature already changed in S5.

**Satisfies**: REQ-R-02, REQ-R-01 (WS side), REQ-D-07 (WS invalid repo)
**Depends on**: S5 (listener signature changed to include `repoRoot`).
**LOC estimate**: ~80

Tasks:

- [x] `src/server/broadcaster.ts` — repo-scoped sets (~30 LOC delta)
  - Replace `#clients: Set<Sendable>` with `#clientsByRepo: Map<string, Set<Sendable>>`.
  - `attachClient(ws: Sendable, repoRoot: string): void`.
  - `detachClient(ws: Sendable, repoRoot: string): void`.
  - `listener(event: InsertedEvent, repoRoot: string): void` — only broadcasts to `#clientsByRepo.get(repoRoot)`.
  - `clientCount(repoRoot?: string): number` — global if no arg; scoped if arg provided.

- [x] `src/server/ws.ts` — validate `?repo=` on connect; close 4400 on invalid (~20 LOC delta)
  - Parse `req.query.repo` from WebSocket upgrade URL.
  - If missing or invalid (not absolute + no `.agentboard/db.sqlite`): `socket.close(4400, "repo_missing_or_invalid")`.
  - `broadcaster.attachClient(socket, normalizedRepo)`.
  - On close/error: `broadcaster.detachClient(socket, normalizedRepo)`.

- [x] Tests: `src/__tests__/ws-scoping.test.ts` (NEW, ~30 LOC)
  - RED: WS connect without `?repo=` is closed with code 4400.
  - RED: event emitted for repo A does NOT reach client subscribed to repo B.
  - RED: event emitted for repo A DOES reach client subscribed to repo A.
  - GREEN: implement.

**S6 slice LOC total**: ~80

---

### S7 — SPA repo selector

**Goal**: `activeRepo` Zustand-style slice in the store, TopBar dropdown wired to `GET /api/daemon/repos`, `api.ts` auto-appends `?repo=`, WS rebinds on switch, `localStorage` persistence, empty-state copy.

**Satisfies**: REQ-R-03, REQ-R-05 (SPA consumption side)
**Depends on**: S3 (`GET /api/daemon/repos` exists), S6 (WS accepts `?repo=`).
**LOC estimate**: ~160

Tasks:

- [x] `src/web/src/lib/store.ts` — add `activeRepo` + `availableRepos` to store (~25 LOC delta)
  - Add to `StoreState`: `activeRepo: string | null`, `availableRepos: string[]`.
  - Add to `Action` union: `SET_ACTIVE_REPO`, `SET_AVAILABLE_REPOS`.
  - Implement dispatch cases.
  - Add `useActiveRepo()` + `useAvailableRepos()` selector hooks.
  - Initialise `activeRepo` from `localStorage.getItem("agentboard.activeRepo")`.

- [x] `src/web/src/lib/api.ts` — `?repo=` auto-append + `fetchRepos` (~30 LOC delta)
  - `class NoActiveRepoError extends Error {}` — exported.
  - `getActiveRepo(): string` — reads store `activeRepo`; throws `NoActiveRepoError` if null.
  - Wrap `apiGet`, `apiPost`, `apiPatch` to append `?repo=${encodeURIComponent(getActiveRepo())}` to non-exempt URLs.
  - Exempt paths: `/api/health`, `/api/daemon/repos`.
  - Add `fetchRepos(): Promise<{ repos: Array<{ path: string; lastSeenAt: string }> }>`.

- [x] `src/web/src/lib/ws.ts` — `closeAndReopen(newRepo: string)` + default URL includes `?repo=` (~20 LOC delta)
  - `defaultWsUrl()`: append `?repo=${encodeURIComponent(getActiveRepo())}` if available.
  - `closeAndReopen(newRepo: string)`: `stopWs()`, dispatch `SET_ACTIVE_REPO`, `localStorage.setItem`, `startWs(wsUrl(newRepo))`.

- [x] `src/web/src/App.tsx` — boot: `fetchRepos` before `fetchTasks`, pick `activeRepo` (~20 LOC delta)
  - Boot `useEffect`: `fetchRepos()` → dispatch `SET_AVAILABLE_REPOS`; pick from `localStorage` or `repos[0]`; dispatch `SET_ACTIVE_REPO`.
  - If repos empty: dispatch a state that triggers the empty-state copy (no `fetchTasks` yet).
  - `fetchTasks()` called AFTER `activeRepo` is set.

- [x] `src/web/src/chrome/TopBar.tsx` — convert static `<span className="repo">` to dropdown button (~25 LOC delta, lines 27–30)
  - Accept `availableRepos: string[]` + `activeRepo: string | null` + `onSwitchRepo: (r: string) => void` props.
  - Replace static `<span className="repo">agentboard</span>` with a `<button>` + dropdown list.
  - Display `basename(activeRepo)` in button; full path as grey subtitle in dropdown items.
  - On select: call `onSwitchRepo(repo)`.

- [x] `src/web/src/App.tsx` — wire `onSwitchRepo` to `closeAndReopen` (~10 LOC delta)
  - Pass `availableRepos`, `activeRepo`, `onSwitchRepo={closeAndReopen}` to `<TopBar>`.

- [x] `src/web/src/views/board/EmptyBoard.tsx` — empty-state copy when no repos (~10 LOC delta)
  - Add conditional render: if `activeRepo === null`, show hint copy: `"Open a repo first: npx @jobshimo/agentboard from any project directory."`.

- [x] Tests: `src/web/src/__tests__/store-repo.test.ts` (NEW, ~20 LOC)
  - RED: `SET_ACTIVE_REPO` updates `activeRepo`; `localStorage` written.
  - RED: `SET_AVAILABLE_REPOS` updates `availableRepos`.
  - GREEN: implement.

- [x] Tests: `src/web/src/__tests__/TopBar-repo.test.tsx` (NEW, ~20 LOC, jsdom + @testing-library/react)
  - RED: renders basename of `activeRepo` in dropdown button.
  - RED: clicking a repo option calls `onSwitchRepo` with full path.
  - GREEN: implement.

**S7 slice LOC total**: ~160

---

### S8 — README + docs

**Goal**: MCP `mcp.json` STDIO snippet, lifecycle table, troubleshooting section. Remove stale "per-repo server" language. No code changes.

**Satisfies**: REQ-M-05
**Depends on**: S4 (`agentboard mcp` implemented; snippet is accurate), S7 (full user-facing feature set visible).
**LOC estimate**: ~30

Tasks:

- [x] `README.md` — MCP client `mcp.json` STDIO snippet (~10 LOC)
  - Replace HTTP/SSE MCP setup section with STDIO snippet per REQ-M-05.
  - Canonical snippet: `{ "mcpServers": { "agentboard": { "command": "npx", "args": ["@jobshimo/agentboard", "mcp"], "env": { "AGENTBOARD_REPO": "${workspaceFolder}" } } } }`.

- [x] `README.md` — lifecycle table (mcp vs daemon) + troubleshooting (~15 LOC)
  - Table: process, transport, lifetime, repo scope.
  - Troubleshooting: `agentboard status`, port collision hint, `agentboard stop`.

- [x] `README.md` — remove stale per-repo server language (~5 LOC delta)
  - Remove any references to HTTP/SSE MCP on `:7733` or per-repo server startup for MCP.

**S8 slice LOC total**: ~30

---

## Section 2: Cross-slice ordering rationale

```
S1 (DB cache + onRequest hook)
  └─> S2 (daemon decoupling, PID, stop/status)
        └─> S3 (registry writes; only running daemon writes daemon.json)
  └─> S4 (STDIO mcp.ts; uses getDbForRepo + normalizeRepoPath)
        └─> S5 (notifyDaemon; STDIO calls it; daemon /internal/notify added)
              └─> S6 (WS repo scoping; listener signature from S5 required)
                    └─> S7 (SPA; needs GET /api/daemon/repos from S3, WS ?repo= from S6)
                              └─> S8 (docs; accurate only after full feature set)
```

**Why S1 is gating**: The `_db` singleton removal and `onRequest` hook are the structural prerequisite for all server-side changes. Without S1, the daemon still owns `cwd` and every REST route that reads `req.db` would fail. Nothing else can land before S1.

**Why S2 depends on S1**: `start.ts` passes `db` to `buildApp` today (line 65–70). After S1, `buildApp` no longer accepts a `db` arg. S2 also adds `closeAllDbs()` to the SIGTERM handler, which only exists after S1 rewrites `connection.ts`.

**Why S3 depends on S2**: REQ-S-03 mandates "single writer (daemon)". S2 establishes the daemon as a single long-lived process with a PID file. Registry writes are gated on the daemon being the canonical owner, a property that only holds after S2's PID/spawn protocol exists.

**Why S4 can start in parallel with S2/S3**: `src/cli/mcp.ts` only imports from `src/db/connection.ts` (S1), `src/mcp/activation.ts`, and `src/mcp/tools/`. None of those are modified by S2 or S3. S4 can be developed against S1 independently on a branch. However, for a linear chained-PR strategy, S4 ships after S2 (so `index.ts` changes don't conflict — both S2 and S4 touch `index.ts`).

**Why S5 depends on S4**: `notifyDaemon` is called from `src/cli/mcp.ts`. The `/internal/notify` daemon-side handler also requires S1 (`getDbForRepo`). The listener signature change in S5 (`(event, repoRoot)`) touches every `insertEvent` call site in `rest.ts`, which was already modified in S1. Sequential is safest.

**Why S6 depends on S5**: `BroadcastManager.listener` must match the new `(event, repoRoot)` signature before the WS scoping can use `repoRoot`. S5 changes the signature; S6 consumes it.

**Why S7 depends on S3 and S6**: The repo dropdown is sourced from `GET /api/daemon/repos` (S3). The WS reconnect on repo switch targets `?repo=<new>` (S6). Both must exist before the SPA can exercise the full user flow.

**Why S8 is last**: The `mcp.json` snippet and lifecycle table are only accurate once S4 (STDIO transport) and S2/S5 (daemon lifecycle) are implemented. Shipping docs before the code would create false promises.

---

## Section 3: Review Workload Forecast

```
Estimated changed lines (total):       ~1025
Number of slices:                       8
Largest slice (LOC):                    S2 (~195 LOC)
400-line budget risk:                   High
Chained PRs recommended:               Yes
Decision needed before apply:           Yes
Suggested delivery shape:               chained-4
```

**Math breakdown**:

| Slice | Production LOC | Test LOC | Slice total |
|-------|----------------|----------|-------------|
| S1    | ~150           | ~70      | ~185 (note: prod+test overlap in estimates above; row = net diff) |
| S2    | ~155           | ~70      | ~195 |
| S3    | ~90            | ~40      | ~110 |
| S4    | ~115           | ~30      | ~145 |
| S5    | ~85            | ~35      | ~120 |
| S6    | ~50            | ~30      | ~80 |
| S7    | ~120           | ~40      | ~160 |
| S8    | ~30            | 0        | ~30 |
| **Total** | **~795**   | **~315** | **~1025** |

Note: these are net-diff estimates (lines added minus lines removed). The singleton removal and `db` parameter deletions offset some additions. Actual diff may be 10–15% lower after cleanups.

**Why chained-4 specifically**: The natural PR grouping by dependency cohesion and review surface area:

- **PR-1 (S1)**: Pure server infrastructure — DB cache rewrite + onRequest hook. Self-contained, no user-visible behavior change. ~185 LOC. Reviewer needs only storage + server knowledge.
- **PR-2 (S2 + S3)**: Daemon lifecycle commands + registry. Cohesive theme: "daemon is now a real daemon." ~305 LOC combined. Stays under the 400-line budget.
- **PR-3 (S4 + S5)**: STDIO entry point + inter-process notification. Cohesive theme: "STDIO MCP process." ~265 LOC combined. Under budget.
- **PR-4 (S6 + S7 + S8)**: WS scoping + SPA selector + docs. Cohesive theme: "multi-repo UI." ~270 LOC combined. Under budget.

All four PRs are independently reviewable and independently testable. Each passes `vitest` at its boundary.

---

## Section 4: Open questions

1. **Per-repo trigger materializer caching**: Design §2 notes "cache per-repo if hot" but calls it a v2 concern. S1 will create a new `createTriggerMaterializer(db)` on each request the first time a repo is seen (or on every request if not cached alongside DB). A TODO comment is sufficient for v1; no spec requirement mandates per-request vs per-repo materializer caching. Apply team should decide at S1 implementation time whether to co-cache the materializer with `getDbForRepo` (low-risk, 5-line change, recommended).

2. **`agentboard mcp` auto-spawning daemon** (out of scope per proposal §2): The design explicitly defers STDIO auto-spawn to v2. Confirm at apply time that `agentboard mcp` prints a user-friendly message if the daemon is down (DB is authoritative, tool calls still work; only WS push is degraded). No blocker — just UX guidance.

3. **`notifications/tools/list_changed` over STDIO**: Design §1 notes this is "mooted by `always-on` activation mode." Verify at S4 apply time that `always-on` truly skips the `sendToolListChanged()` call in `ActivationState.activate`. Currently `activate()` calls `this.#mcpServer.sendToolListChanged()` unconditionally (line 71 of `activation.ts`). For STDIO this is harmless (SDK ignores it) but should be documented inline.

---

**Followup S9 applied**: 2c9b9f8
