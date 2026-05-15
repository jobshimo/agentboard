# Archive Report: agentboard-daemon-refactor

**Archived**: 2026-05-15  
**Status**: APPROVED-WITH-WARNINGS and complete  
**Artifacts**: 9 commits on main (8de9fe8 → 43823a4) + 1 follow-up (2c9b9f8)  
**Verification**: Round 2 passed; CRITICAL count 0; 3 warnings deferred (tracked)

---

## Change Summary

The `agentboard-daemon-refactor` change restructured the system from a single per-repo HTTP server into a two-process model:
- **STDIO MCP process** (`agentboard mcp`): ephemeral per-session, bound to a single repo via `AGENTBOARD_REPO` or `--repo` flag.
- **HTTP Daemon** (`agentboard daemon`): single global process on port `:7733`, serves all repos via per-request `?repo=` query parameter.

This aligns the implementation with the original design intent: MCP bootstraps without preflight, and the web UI shows all repos in one shared local server.

---

## Commits and Implementation

All 9 task slices completed, implementing ~1025 LOC across production and test code.

| Commit | Slice | Content |
|--------|-------|---------|
| 8de9fe8 | S1 | Per-repo DB cache + per-request injection |
| 062bbc1 | S2 | Daemon lifecycle, spawn, stop, status subcommands |
| 5ab07c4 | S3 | Repo registry (`daemon.json`) + `/api/daemon/repos` |
| 759fca8 | S4 | STDIO MCP entry point (`agentboard mcp`) |
| 69c4a07 | S5 | Inter-process notify (`POST /internal/notify`) |
| 208edfa | S6 | WS repo scoping (per-repo broadcast sets) |
| 5bfceaa | S7 | SPA repo selector (TopBar dropdown, localStorage, WS rebind) |
| 0bd034b | S8 | README documentation (mcp.json snippet) |
| 2c9b9f8 | S9 | Fix REQ-L-01 wiring + close findings |

---

## Specification Deltas Merged into Canonical

### launcher.md
- Added `agentboard daemon` (explicit alias).
- Added `agentboard mcp` (STDIO entry point, repo resolution rules).
- Added `agentboard stop` (graceful shutdown).
- Added `agentboard status` (daemon state report).
- Modified default command: now idempotent daemon spawn (health probe, PID file, browser open).
- Added `--repo` flag scoped to `agentboard mcp` only.

### mcp-surface.md
- Replaced transport: `StreamableHTTPServerTransport` → `StdioServerTransport`.
- Added session ID minting (UUID v4 at startup, stable across tool calls).
- Added repo binding at startup (env > flag resolution, normalized paths).
- Added inter-process notification (fire-and-forget POST `/internal/notify`).
- Added MCP client configuration snippet (STDIO-only, no HTTP endpoint).
- Updated tool count from "6–8" to "14 tools".
- Added activation mode override: STDIO forces `always-on` (no handshake).

### storage.md
- Added per-repo DB cache (`Map<string, Db>` in daemon).
- Added path normalization (resolve + lowercase on Win32).
- Added per-request DB injection (Fastify `onRequest` hook, `req.db` + `req.repoRoot`).
- Added `daemon.json` registry (schema, read/write semantics, debounce, recovery).
- Added two-process WAL safety (STDIO + daemon concurrent access).
- Added DB cache eviction on shutdown.

### realtime-ui.md
- Added `?repo=` requirement on all REST and WS requests.
- Added repo-scoped broadcasting (separate subscriber sets per repo).
- Added SPA repo selector (TopBar dropdown, localStorage, WS rebind).
- Added `POST /internal/notify` endpoint (loopback-only, optional shared secret).
- Added `GET /api/daemon/repos` endpoint (global daemon state, exempt from `?repo=`).

### daemon.md (NEW)
- Created full spec for daemon lifecycle, spawn protocol, PID file, registry, endpoints, and failure modes.
- 7 core requirements covering identity, lifecycle, PID file, cross-platform behavior, and failure recovery.

---

## Test Results

- **Tests passing**: 563 (baseline 494 + 56 new + 13 final round-2 adds)
- **tsc errors**: 71 (pre-existing, 1 removed from round-1)
- **Build time**: ~4.2s (pnpm test)

---

## Deferred Follow-ups (Out of Scope)

Three warnings from verification remain as tracked follow-ups:

| ID | Title | Engram Reference | Description |
|----|-------|------------------|-------------|
| WARN-1 | TopBar DOM test | #619 | `@testing-library/react` not authorized; current prop-contract test sufficient for v1 |
| WARN-2 | runExport getDb shim | #620 | Cosmetic cleanup: replace 2 callsites of deprecated shim |
| WARN-5 | runStop unit test | #621 | Integration coverage exists; add dedicated unit test in follow-up |

Additional tracked follow-ups from the original proposal:

| ID | Title | Content |
|----|-------|---------|
| #622 | Per-repo materializer cache | Design §2 deferred per-request triple allocation; revisit if hot |
| #623 | MCP auto-spawn daemon | Design §1 notes v2 feature; v1 requires explicit `npx @jobshimo/agentboard` |
| #624 | Win32 path display normalization | SPA stores + displays lowercase; v2 adds dual canonical/display paths |

---

## Verification Closure Summary

**Round 1 Verdict**: REJECTED-pending-CRIT-1-fix (commit 2c9b9f8 closed idempotent spawn wiring gap)

**Round 2 Verdict**: APPROVED-WITH-WARNINGS

Evidence of closure:
- REQ-L-01 (idempotent daemon spawn): wired in `src/cli/index.ts:167-198`; tested in `src/cli/__tests__/idempotent-spawn.test.ts` (5 test cases covering all branches).
- All 26 spec requirements addressed: 23 PASS, 1 PASS-BY-DESIGN, 1 PASS-WITH-NOTE, 0 CRITICAL remaining.
- Regressions scanned: no new `process.cwd()` in REST handlers, no `_db` singleton reintroduction, no tool surface changes.

---

## Artifact Store References

For full traceability across phases:

| Artifact | Engram Topic Key | Engram ID |
|----------|------------------|-----------|
| Proposal | `sdd/agentboard-daemon-refactor/proposal` | #612 |
| Spec | `sdd/agentboard-daemon-refactor/spec` | #613 |
| Design | `sdd/agentboard-daemon-refactor/design` | #614 |
| Tasks | `sdd/agentboard-daemon-refactor/tasks` | #615 |
| Verify Report (R2) | `sdd/agentboard-daemon-refactor/verify-report` | #618 |
| Archive Report | `sdd/agentboard-daemon-refactor/archive-report` | (this observation) |

---

## Acceptance Criteria (All Met)

1. ✅ **STDIO bootstrap works cold** — no daemon required for MCP.
2. ✅ **Daemon not required for MCP** — tool calls work, events persist in DB.
3. ✅ **`npx @jobshimo/agentboard` is idempotent** — existing daemon used or spawned per-repo.
4. ✅ **Per-request DB resolution** — `?repo=` query validated, missing returns HTTP 400.
5. ✅ **SPA repo switching** — TopBar dropdown with WS rebind, localStorage persistence.
6. ✅ **STDIO MCP tool → DB row + WS push** — under 500ms with daemon, DB-authoritative without.
7. ✅ **`agentboard status` subcommand** — returns running/port/PID/repos or not-running exit 1.
8. ✅ **`agentboard stop` subcommand** — graceful SIGTERM, idempotent.
9. ✅ **No `process.cwd()` in REST handlers** — replaced with `req.repoRoot` (3 sites verified).
10. ✅ **Windows path normalization** — `C:\path` and `c:\path` map to same DB cache entry.

---

## What Shipped

1. **Two-process architecture**: STDIO MCP (ephemeral) + HTTP daemon (global).
2. **Per-repo database isolation**: each repo has own `.agentboard/db.sqlite`; daemon serves all via `?repo=` routing.
3. **Idempotent daemon spawn**: `npx @jobshimo/agentboard` probes health, launches or piggybacks; always succeeds.
4. **MCP bootstrap without preflight**: `agentboard mcp` over STDIO with `AGENTBOARD_REPO` env var (MCP-client-friendly).
5. **Unified web UI**: one local server `:7733` shows all repos via TopBar dropdown; WS rebind on switch.
6. **Graceful daemon lifecycle**: `agentboard stop` / `agentboard status` subcommands; PID file tracking.
7. **Inter-process realtime push**: STDIO notifies daemon of events via loopback POST; best-effort, DB-authoritative.
8. **Cross-platform path handling**: Windows path case normalization (lowercase keys), POSIX paths work unchanged.

---

## Files Archived

- proposal.md (engram #612 source)
- design.md (engram #614 source)
- tasks.md (engram #615 source)
- verify-report.md (round-1 + round-2 appended)
- archive-report.md (this file)

All change artifacts moved from `openspec/changes/agentboard-daemon-refactor/` to `openspec/changes/archive/2026-05-15-agentboard-daemon-refactor/`.
