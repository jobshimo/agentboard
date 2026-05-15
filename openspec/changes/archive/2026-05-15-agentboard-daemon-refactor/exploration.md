# Exploration — agentboard-daemon-refactor

> Phase: explore. Inputs: `HANDOFF.md`, `DESIGN.md` §3-§4, engram observations
> #608 (`agentboard/lifecycle-flaw`) and #609 (`agentboard/daemon-refactor-architecture`).
> Output: this document. Next phase: `sdd-propose`.

## Problem in one sentence

The shipped MVP (`agentboard-mvp`, archived 2026-05-15) ties the server process
to a single `cwd` captured at startup. One process per repo, on its own port,
started manually. The agent cannot bootstrap it. Wrong on every axis vs. what
the project owner wanted.

## Decision already taken (engram #609)

Two-process model:

1. `agentboard mcp` — STDIO transport, spawned by the MCP client (Claude Code,
   Cursor, etc.). Ephemeral, scoped to one agent session. Opens
   `<repo>/.agentboard/db.sqlite` in its own `cwd`. No Fastify.
2. `agentboard` (default cmd) / `agentboard daemon` — single global HTTP
   daemon on `:7733`. Serves SPA + REST + WebSocket. NOT bound to a cwd.
   Accepts `?repo=<abs-path>` per request.

Inter-process notification: STDIO process `POST /internal/notify` to the
daemon so the daemon broadcasts via WS. Storage stays in `<repo>/.agentboard/`,
shared between both processes via SQLite WAL.

## Findings by investigation area

### 1. MCP STDIO transport — confirmed feasible (~10 LOC)

`@modelcontextprotocol/sdk@1.29.0` ships `StdioServerTransport` at
`node_modules/.pnpm/@modelcontextprotocol+sdk@1.29.0_.../dist/esm/server/stdio.js`.
Same interface as `StreamableHTTPServerTransport` — `start()`, `close()`,
`send()`. `McpServer.connect(transport)` is transport-agnostic.

**Gotcha (medium risk)**: Over STDIO, `extra.sessionId` in MCP tool callbacks
is `undefined`. The SDK does not mint session IDs for STDIO — that is a
stateful HTTP feature. `withPiggyback` already handles `undefined`
(`src/mcp/piggyback.ts:13`), but `activate()` (`src/mcp/activation.ts:62`)
inserts an `agent_sessions` row keyed by session ID, and `pollEvents` reads
by it. The STDIO entry point must mint a UUID at startup and inject it into
the MCP `extra` context.

### 2. Per-request DB injection — mechanical

- `getDb(cwd)` already accepts `cwd` (`src/db/connection.ts:23`) — seam ready.
- Replace module-level singleton (`let _db: Db | null = null` at line 8)
  with `Map<string, Db>` keyed by `path.resolve(cwd)`.
- Windows path normalization (`resolve()` + lowercase) must be in spec.
- `better-sqlite3` supports multiple concurrent `Database` instances per
  process — safe.
- `buildApp({ db })` in `src/server/app.ts:50` becomes `buildApp({ getDb })`.
- New Fastify `onRequest` hook reads `?repo=` and decorates `req.db`,
  `req.repoRoot`.
- 3 `process.cwd()` sites in `src/server/rest.ts` (lines 216, 369, 387) become
  `req.repoRoot`. Mechanical.
- Domain functions (`src/domain/`, `src/events/`, `src/feedback/`) need
  zero changes — they already take `db` as first arg.

### 3. Inter-process notification — HTTP POST validated

- Daemon exposes `POST /internal/notify` on `127.0.0.1:7733` only.
- STDIO process calls `fetch('http://127.0.0.1:7733/internal/notify', ...)`
  after every `insertEvent`. `fetch` is native in Node 20.11+ — no new dep.
- Daemon's `BroadcastManager` (`src/server/broadcaster.ts`) is event-listener
  driven; the new endpoint calls `broadcaster.listener(event)` directly.
- Daemon down → POST fails silently. Event is in DB. WS push is best-effort,
  not authoritative. Acceptable.
- Optional: shared secret header (env var) to scope endpoint to local procs.

Rejected: filesystem watcher (Windows NTFS unreliability), DB polling
(latency).

### 4. Idempotent daemon spawn — probe `/api/health`

- `resolvePort` (`src/server/port.ts`) currently throws `PortInUseError`.
  Replace exit-on-collision with a `GET http://127.0.0.1:7733/api/health`
  probe (endpoint exists at `src/server/app.ts:71`) with
  `AbortSignal.timeout(500)`.
- Cross-platform safe in Node 20.11+.
- Optional speed-up: `~/.agentboard/daemon.pid` file + `process.kill(pid, 0)`
  to avoid the 500ms HTTP wait on the common case. Works on Windows.
- Add SIGTERM handler in `src/cli/start.ts` (currently only SIGINT at
  line 119).

### 5. Repo registry — JSON file + in-memory Map

- In-memory `Map<string, Db>` is already needed for DB caching (§2).
- Persist registry to `~/.agentboard/daemon.json` (sits next to
  `config.yaml`, see `src/cli/start.ts:58`).
- Load JSON on daemon start. Append on new repo opened (debounced).
- Serve via `GET /api/daemon/repos`.
- Owner choice (3 decisions, see below): JSON, not SQLite.

### 6. SPA repo selector — slot already exists

- `TopBar` (`src/web/src/chrome/TopBar.tsx:27-30`) already renders
  `Folder + repo name + ChevronDown` — the dropdown skeleton is there.
- `api.ts` has `apiGet`/`apiPost`/`apiPatch` (lines 53-91). One change
  point each to append `?repo=<encodedPath>`.
- `App.tsx:19` has `PLACEHOLDER_WORKFLOWS`. `activeRepo` follows the
  same pattern — Zustand store slice.
- WS reconnect on repo change: tear down + rebuild WS with new
  `?repo=...`. Existing reconnect logic handles the rest.

### 7. Migration — none

`<repo>/.agentboard/db.sqlite` stays where it is. One-time MCP client config
change for existing users (HTTP transport → STDIO command spawn). Document
in README.

## Open questions resolved by project owner (this session)

1. **Repo identification for `agentboard mcp`**: `AGENTBOARD_REPO` env var
   **+** `--repo` CLI flag. Env wins if both present.
2. **Daemon registry**: `~/.agentboard/daemon.json` (NOT SQLite).
3. **Auto-spawn daemon from MCP STDIO**: NO for v1. User arranca la web
   when they want.

## Risks for the proposal phase to resolve

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | STDIO `sessionId` is undefined — must define derivation protocol before code | Medium | Spec: mint UUID at STDIO startup, inject via custom MCP context wrapper |
| 2 | Windows path normalization in DB Map key | Low | Spec: `path.resolve()` + lowercase on Windows |
| 3 | Repo root protocol: env var vs CLI flag priority | Low | Resolved above: env wins |
| 4 | Missing SIGTERM handler in `start.ts` | Low | Add alongside daemon work |
| 5 | Daemon-down silent failure on notify | Low | Document as acceptable; WS push is best-effort |

## Approaches comparison

| | A: Incremental | B: Clean split (recommended) | C: Multi-mode auto-spawn |
|---|---|---|---|
| Description | Keep `buildApp`, add per-request DB, new STDIO subcommand | Separate `src/mcp/server.ts` STDIO entry + per-request DB | B + MCP auto-starts daemon |
| Effort | 3-4 days | 3-5 days | high |
| Cleanliness | Medium | High | Low (cross-process spawn complexity) |
| Owner pick | — | yes | no for v1 |

## Survives intact (~70-80% of MVP)

- `src/domain/`, `src/events/`, `src/feedback/`, `src/workflows/`,
  `src/config/`, `src/db/connection.ts` (minor edit to remove singleton)
- All 14 MCP tools in `src/mcp/tools/`
- Entire SPA except the repo selector wiring in TopBar + api.ts
- All 494 tests (some need fixture updates for per-request DB pattern)

## Next phase

`sdd-propose` — produce `proposal.md` + engram observation under
topic_key `sdd/agentboard-daemon-refactor/proposal`. The 3 decisions and
5 risks above are inputs.
