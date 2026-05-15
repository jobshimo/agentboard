# Tasks: agentboard-daemon-refactor

Status: tasks | Persistence: hybrid | Spec: engram #613 | Design: engram #614

> Strict TDD is ACTIVE. Each slice's tasks are ordered RED → GREEN → REFACTOR.
> Tests land in the same commit as the behavior they verify. No "tests later" bucket.

All 8 slices completed. See full tasks document in openspec/changes/archive/ for comprehensive task list and ordering details.

**STATUS: ALL 8 SLICES COMPLETE**

Slice summary:
- [x] S1 (~185 LOC): Per-repo DB cache + onRequest injection — DONE (commit 8de9fe8)
- [x] S2 (~195 LOC): Daemon lifecycle commands and idempotent spawn — DONE (commit 062bbc1)
- [x] S3 (~110 LOC): Repo registry persistence and /api/daemon/repos — DONE (commit 5ab07c4)
- [x] S4 (~145 LOC): STDIO MCP entry point (agentboard mcp) — DONE (commit 759fca8)
- [x] S5 (~120 LOC): Inter-process notify (/internal/notify + notifyDaemon) — DONE (commit 69c4a07)
- [x] S6 (~80 LOC): WS repo scoping — BroadcastManager #clientsByRepo Map — DONE (commit 208edfa)
- [x] S7 (~160 LOC): SPA repo selector with WS rebind — DONE (commit 5bfceaa)
- [x] S8 (~30 LOC): README docs — MCP STDIO config snippet and lifecycle docs — DONE (commit 0bd034b)

**Final totals**: 8/8 slices, 8 commits, 550 tests (494 baseline + 56 new), ~2984 LOC added.

Followup S9 applied: 2c9b9f8
