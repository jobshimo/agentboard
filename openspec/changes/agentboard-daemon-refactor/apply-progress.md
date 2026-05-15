# Apply Progress: agentboard-daemon-refactor

Status: DONE | All 8 slices complete
Persistence: hybrid (engram #616 + this file)

---

## S1 — Per-repo DB cache + Fastify onRequest hook
- Commit: 8de9fe8
- LOC delta: +700/-243 (11 files changed)
- Tests added: 18 (db-cache.test: 13, onrequest-hook.test: 5)
- Tests total: 507 passing (baseline: 494)
- Satisfies: REQ-S-01, REQ-S-02, REQ-R-01 (HTTP 400 side), REQ-D-06
- Key files: src/db/connection.ts, src/server/app.ts, src/server/rest.ts, src/server/fastify-augment.d.ts, src/cli/start.ts
- Decision: test helpers use getDbForRepo(dir)+closeAllDbs() to pre-init db.sqlite before each test

---

## S2 — Daemon lifecycle commands and idempotent spawn
- Commit: 062bbc1
- LOC delta: +706/-8 (8 files changed)
- Tests added: 11 (spawn-daemon.test: 8, stop-status.test: 3)
- Tests total: 518 passing
- Satisfies: REQ-L-01, REQ-L-02, REQ-L-04, REQ-L-05, REQ-D-01, REQ-D-02, REQ-D-03, REQ-D-07 (failure modes 1-3)
- Key files: src/cli/spawn-daemon.ts, src/cli/stop.ts, src/cli/status.ts, src/cli/index.ts
- Decision: _pollTimeoutMs injectable for test speed (50ms vs 3000ms default)

---

## S3 — Repo registry persistence and /api/daemon/repos
- Commit: 5ab07c4
- LOC delta: +362/-1 (4 files changed)
- Tests added: 9 (registry.test: 9)
- Tests total: 527 passing
- Satisfies: REQ-S-03, REQ-D-04, REQ-R-05, REQ-D-07 (corrupt registry)
- Key files: src/server/registry.ts, src/db/connection.ts (dbCacheHas export)
- Decision: used platform-safe temp dirs for upsertRepo tests (Windows path normalization)

---

## S4 — STDIO MCP entry point (agentboard mcp)
- Commit: 759fca8
- LOC delta: +261/-7 (9 files changed)
- Tests added: 5 (mcp-entry.test: 5)
- Tests total: 532 passing
- Satisfies: REQ-L-03, REQ-L-06, REQ-M-01, REQ-M-02, REQ-M-03
- Key files: src/cli/mcp.ts, src/mcp/activation.ts (presetSessionId), src/mcp/tools/types.ts (mintedSessionId)
- Decision: 5 extra.sessionId sites updated with ?? services.mintedSessionId pattern

---

## S5 — Inter-process notify (/internal/notify + notifyDaemon)
- Commit: 69c4a07
- LOC delta: +290/-12 (9 files changed)
- Tests added: 4 (notify.test: 4)
- Tests total: 536 passing
- Satisfies: REQ-M-04, REQ-R-04, REQ-D-05, REQ-D-07 (daemon down)
- Key files: src/mcp/notify-daemon.ts, src/events/insert.ts (repoRoot param), src/server/app.ts (/internal/notify route)
- Decision: EventListener(event, repoRoot) change required updating broadcaster, wait, triggered-materializer; insertEvent gets default repoRoot=""

---

## S6 — Repo-scoped WebSocket broadcaster
- Commit: 208edfa
- LOC delta: +217/-34 (4 files changed)
- Tests added: 4 (ws-scoping.test: 4)
- Tests total: 540 passing
- Satisfies: REQ-R-02, REQ-R-01 (WS side), REQ-D-07 (WS invalid repo)
- Key files: src/server/broadcaster.ts (Map-based), src/server/ws.ts (?repo= validation)
- Decision: existing ws.test.ts updated to use REPO="" sentinel for unit tests; integration test uses normalizeRepoPath(repoDir)

---

## S7 — SPA repo selector with WS rebind
- Commit: 5bfceaa
- LOC delta: +362/-20 (10 files changed)
- Tests added: 10 (store-repo.test: 6, TopBar-repo.test: 4)
- Tests total: 550 passing
- Satisfies: REQ-R-03, REQ-R-05 (SPA consumption side)
- Key files: src/web/src/lib/store.ts, src/web/src/lib/api.ts, src/web/src/lib/ws.ts, src/web/src/chrome/TopBar.tsx, src/web/src/App.tsx
- Decision: @testing-library/react not installed; TopBar test written as pure function/prop-contract test

---

## S8 — README + docs
- Commit: 0bd034b
- LOC delta: +86/-33 (1 file changed)
- Tests added: 0
- Tests total: 550 passing (unchanged)
- Satisfies: REQ-M-05
- Key files: README.md

---

## S9 — Followup: CRIT-1 fix + verify findings cleanup
- Commit: 2c9b9f8
- LOC delta: +788/-36 (7 files changed)
- Tests added: 13 (idempotent-spawn.test: 5, output.test: 8)
- Tests total: 563 passing
- tsc errors: 71 (was 72 — transport.ts removal)
- Closed verify findings: CRIT-1, WARN-3, WARN-4, WARN-6
- Key changes:
  - src/cli/spawn-daemon.ts: exported probeForExistingDaemon() with discriminated union result
  - src/cli/index.ts: wired probe into start/daemon case (alreadyRunning → open browser; foreignProcess → error; free → runStart)
  - src/cli/output.ts: removed HTTP /mcp line from printBanner; updated printHelp with daemon/stop/status/mcp/--repo
  - src/mcp/transport.ts: DELETED (dead code, no callers since S4)
  - openspec/changes/agentboard-daemon-refactor/tasks.md: all 48 [ ] → [x]
- Remaining follow-ups (tracked in engram, not blockers): WARN-1 (TopBar DOM), WARN-2 (getDb shim), WARN-5 (runStop unit test)

---

## Final Summary

| Metric | Value |
|--------|-------|
| Slices completed | 8 + S9 followup |
| Commits | 10 |
| Total tests | 563 (baseline: 494, added: 69) |
| Total LOC added | ~3772 |
| Total LOC removed | ~354 |
| Duration | single session + S9 followup |
| Blockers | none |

All acceptance criteria from proposal §8 satisfied:
1. STDIO bootstrap works cold (S4)
2. Daemon not required for MCP (S4, S5)
3. npx @jobshimo/agentboard is idempotent (S2 + S9 CRIT-1 fix)
4. Per-request DB resolution (S1)
5. SPA repo switching (S7)
6. STDIO MCP tool call → DB row + WS push (S4, S5, S6)
7. agentboard status (S2)
8. agentboard stop graceful (S2)
9. No process.cwd() in server/rest.ts or server/app.ts (S1)
10. C:\path and c:\path resolve to same DB (S1, normalizeRepoPath)
