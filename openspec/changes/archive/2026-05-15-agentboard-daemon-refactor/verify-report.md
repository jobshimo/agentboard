# Verify Report: agentboard-daemon-refactor — ROUND 2

**Verdict**: APPROVED-WITH-WARNINGS
**Date (round 2)**: 2026-05-15  /  **Verifier**: sdd-verify (Opus 4.7 1M)  /  **Branch**: main (10 commits 8de9fe8..43823a4)
**Counters (round 2)**: CRITICAL=0 (was 1) / WARNING=3 deferred (was 6) / SUGGESTION=3 (unchanged)

## Round 2 — Delta vs Round 1

| Item | Round 1 | Round 2 | Notes |
|------|---------|---------|-------|
| CRIT-1 (REQ-L-01 wiring) | OPEN | CLOSED | commit 2c9b9f8 |
| WARN-3 (dead transport.ts) | OPEN | CLOSED | file deleted in 2c9b9f8 |
| WARN-4 (tasks.md checkboxes) | OPEN | CLOSED | all 48 marked done; SHA appended at line 484 |
| WARN-6 (stale banner/help) | OPEN | CLOSED | printBanner + printHelp rewritten |
| WARN-1 (TopBar DOM test) | OPEN | DEFERRED | testing-library/react not authorized |
| WARN-2 (runExport getDb shim) | OPEN | DEFERRED | cosmetic; tracked |
| WARN-5 (runStop unit test) | OPEN | DEFERRED | integration coverage exists via spawn flow |
| Build: tests passing | 550 | 563 (+13) | matches apply claim exactly |
| Build: tsc errors | 72 | 71 (-1) | transport.ts removal |

## Round 2 — Build State

- pnpm test: 55 files, 563 tests, ALL PASSING. ~4.2s. Matches apply-progress #616 claim (550 + 13 = 563).
- pnpm tsc --noEmit: 71 errors. Down from 72. All pre-existing strict-mode noise; refactor introduced ZERO new errors.

## Round 2 — Closed Findings

### CRIT-1 (CLOSED in 2c9b9f8)

REQ-L-01 idempotent daemon spawn is now WIRED into the runtime entry point.

Evidence:
- probeForExistingDaemon exported at src/cli/spawn-daemon.ts:146 with a discriminated-union return type (alreadyRunning | foreignProcess | free) declared at src/cli/spawn-daemon.ts:78-81.
- Imported in src/cli/index.ts:16.
- Wired in the start / daemon dispatch arm at src/cli/index.ts:167-198:
  - alreadyRunning -> opens browser to http://localhost:{port}/?repo={cwd} via platform-specific exec, prints reuse message, process.exit(0). Does NOT call runStart. (lines 174-188)
  - foreignProcess -> prints port {port} is held by a non-agentboard process. + hint, process.exit(1). (lines 190-194)
  - free -> falls through to await runStart({ port, noOpen, verbose, cwd }). (line 197)
- New tests at src/cli/__tests__/idempotent-spawn.test.ts:
  - alreadyRunning covered at lines 43-53 (200 + ok:true mocked health).
  - foreignProcess covered twice at lines 62-72 (200 with ok:false body) and 74-84 (non-200).
  - free covered at lines 93-101 (ECONNREFUSED).
  - Stale-PID cleanup covered at lines 110-125.
- Behavioral trace: node src/cli/index.js -> main() (line 108) -> switch on command -> case start / case daemon (line 167) -> probe is the FIRST IO call before any port binding. No bypass.

Acceptance criterion #3 of the original proposal (idempotent npx @jobshimo/agentboard) is satisfied.

### WARN-3 (CLOSED in 2c9b9f8)

src/mcp/transport.ts deleted. Glob(src/mcp/transport.ts) returns no files. Grep mcp/transport in src/ returns 0 matches. No stale imports remain.

### WARN-4 (CLOSED in 2c9b9f8 + fcc7391)

openspec/changes/agentboard-daemon-refactor/tasks.md:
- Zero unchecked items (was 48).
- 48 checked items.
- Closing reference "Followup S9 applied: 2c9b9f8" at line 484.

### WARN-6 (CLOSED in 2c9b9f8)

src/cli/output.ts:
- printBanner (line 65) no longer prints mcp http://localhost:{port}/mcp. Replaced with STDIO — run agentboard mcp (for agent integration).
- printHelp (lines 83-113) now lists daemon (92), stop (93), status (94), mcp (95), and --repo path (102).
- New tests at src/cli/__tests__/output.test.ts:
  - does NOT mention /mcp HTTP endpoint (lines 30-36).
  - mentions agentboard mcp for agent integration (lines 38-43).
  - Web UI + WS lines still present (lines 45-51).
  - printHelp coverage for mcp/daemon/stop/status (lines 59-77).
  - printHelp does NOT mention localhost (lines 79-82).

## Round 2 — Remaining (DEFERRED) Warnings

These are explicitly out of scope for the change; recorded as engram follow-ups, acceptable to archive.

### WARN-1 — DEFERRED
REQ-R-03 TopBar DOM render test absent. testing-library/react not installed; install was not authorized for this change. Current src/web/__tests__/TopBar-repo.test.ts is a prop-contract test, which is acceptable for v1. Follow-up: install testing-library and add a render test that asserts dropdown rendering and onSwitchRepo invocation.

### WARN-2 — DEFERRED
getDb deprecation shim still used in src/cli/index.ts:143 (runExport path) and src/db/__tests__/connection.test.ts. Cosmetic; the underlying call is identical because the shim resolves to getDbForRepo(cwd). Follow-up: replace the two callsites and remove the shim.

### WARN-5 — DEFERRED
runStop has no direct unit test (src/__tests__/stop-status.test.ts covers runStatus only). Integration coverage exists through the end-to-end spawn / health-probe flow exercised in idempotent-spawn.test.ts and spawn-daemon.test.ts. Follow-up: add src/__tests__/stop.test.ts covering no-PID-file, stale PID, healthy SIGTERM-gone, and timeout paths.

## Result Envelope (round 2)

- status: ok
- verdict: APPROVED-WITH-WARNINGS
- executive_summary: CRIT-1 is fully closed — probeForExistingDaemon is exported (src/cli/spawn-daemon.ts:146), imported and wired into the start/daemon dispatch (src/cli/index.ts:167-198), and exercised by 5 new tests. WARN-3/4/6 are also closed. Build is healthy: 563 tests passing (matching apply claim exactly), tsc errors 72 → 71. No regressions. Remaining WARN-1/2/5 are deferred follow-ups outside scope. Safe to archive.
- artifacts:
  - engram: sdd/agentboard-daemon-refactor/verify-report (this observation; replaces #618 content via topic_key upsert)
  - file: C:\Users\NERO\repos\agentboard\openspec\changes\agentboard-daemon-refactor\verify-report.md (357 lines: round-2 prepended, round-1 preserved as archive)
- next_recommended: sdd-archive
- risks: none new
- skill_resolution: none
