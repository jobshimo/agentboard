# Verify Report — tui-install-publish

## Round 3 — 2026-05-16

**Verdict**: APPROVED-WITH-WARNINGS (round-2 CRITICAL F1 + WARNINGs F2/F3 closed)
**Branch**: main (18 commits ahead of origin/main)
**Tests**: 721 / 721 passing (74 files) — +6 from round 2
**tsc**: 71 errors (= baseline, unchanged)
**Git status**: clean (only in-flight `openspec/changes/tui-install-publish/` untracked, per orchestrator)
**Lockfile**: `pnpm install --frozen-lockfile` succeeds at HEAD

### Round-3 executive summary

The round-2 CRITICAL (F1 — trailing `"--"` in daemon spawn args crashing the child via `parseArgv` unknown-flag exit) is fully closed. The round-2 WARNINGs F2 (doctor section ignored language toggle) and F3 (~10 install-cmd diagnostic strings bypassing `t()`) are also closed. The 3 new commits (`c08403b`, `6fc23a9`, `df2b187`) add 6 tests and 11 i18n keys without regression. The only remaining note is a benign SUGGESTION: the `sub()` template helper is duplicated between `install-cmd.ts:60` and `doctor-report.ts` (apply flagged this as intentional — keeps `strings.ts` pure). Verdict is `APPROVED-WITH-WARNINGS` — ready for archive + push.

### Round-3 closures (round-2 findings)

| Finding | Status | Evidence |
|---------|--------|----------|
| F1 CRITICAL — trailing `"--"` crashes daemon child | CLOSED | `src/cli/tui.tsx:24` now returns `[entryPath, "daemon", "--no-open"]` — no trailing `"--"`. Tests at `src/cli/__tests__/tui-helpers.test.ts:80-83` (not-contain `"--"`), `:85-89` (second arg = `"daemon"`), `:91-107` (full `parseArgv` integration: feeds spawn args through `parseArgv`, asserts `command === "daemon"`, asserts `process.exit` was NOT called). |
| F2 WARNING — doctor ignores lang toggle | CLOSED | `src/cli/tui.tsx:130` now calls `formatDoctorReport(report, lang)` (was `formatDoctorReport(report)`). Tests at `src/cli/__tests__/doctor.test.ts:156-174` (lang=es produces `"no corriendo"`), `:176-197` (lang=es output ≠ lang=en output — proves routing is real). |
| F3 WARNING — install-cmd diagnostics bypass `t()` | CLOSED | `src/cli/install-cmd.ts:60-62` introduces local `sub()` template helper. All 18 `printLine` call sites now route through `t()` (lines 75, 77, 81, 83, 86, 99, 101, 105, 107, 110, 116, 141, 143, 147, 149, 162, 164, 168, 170, 176). The only literal-string `printLine` calls are `result.message` (string from adapter) and `` `[${id}] ${result.message}` `` (client-id bracket prefix — not prose). 11 new keys in `src/i18n/strings.ts:45-55` (en) and `:143-153` (es): `install.diag.{backup,instr_block,instr_backup,dry_run_install,auto_instr_block,auto_instr_backup,auto_dry_run_install}` + `uninstall.diag.{instr_block,dry_run_remove,auto_instr_block,auto_dry_run_remove}`. Parity invariant test in `src/i18n/__tests__/strings.test.ts` passes. Localization tests at `src/cli/__tests__/install-cmd.test.ts:152-175` (lang=es dry-run shows `"instalaría bloque de instrucciones"`) and `:177-204` (lang=es backup shows `"respaldo:"` + `"bloque de instrucciones"`). |

### Round-3 regression scan (round-1 + round-2 closures still hold)

| Prior closure | Status this round | Evidence |
|---------------|-------------------|----------|
| C1 dirty tree / orphan tui.ts | STILL CLOSED | `src/cli/tui.ts` does not exist; `git ls-files src/cli/tui.ts` returns empty; only `tui.tsx` is tracked. |
| C2 instructions block wiring | STILL CLOSED | 6 occurrences of `installInstructionsBlock`/`uninstallInstructionsBlock` in `install-cmd.ts` (lines 10, 11, 80, 104, 146, 167). |
| C3 dynamic import of runStart | STILL CLOSED | Zero occurrences of `runStart` in `tui.tsx`. Daemon spawned via `child_process.spawn` at `tui.tsx:88`. |
| W5 registered-outdated emitted | STILL CLOSED | `doctor-report.ts:135` emits it; `doctor.test.ts:130, 201, 232` cover it. |
| W4 spawn-detached pattern | STILL CLOSED | `tui.tsx:88-93` uses `spawn(... { detached: true, stdio: "ignore", ... })` + `child.unref()`. |
| parseArgv `daemon` dispatch | NO REGRESSION | `src/cli/index.ts:48` maps `"daemon"` → `command = "daemon"`; `:222` dispatches to the daemon path. |
| i18n parity (en ⊆ es) | NO REGRESSION | 721/721 tests pass; `strings.test.ts` parity invariant green. |

### Round-3 build state

| Check | Result |
|-------|--------|
| `pnpm test` | 721 passed (74 files), 0 failed |
| `pnpm tsc --noEmit` | 71 errors (baseline, unchanged) |
| `pnpm install --frozen-lockfile` at HEAD | OK |
| `git status` | clean (only in-flight SDD trail untracked) |
| `git log b4081f8..HEAD --oneline \| wc -l` | 18 (15 prior + 3 round-3 fix commits) |
| Newest 3 commits | `c08403b` (drop stray "--"), `6fc23a9` (pass lang to formatDoctorReport), `df2b187` (route install-cmd diagnostics through t()) — all conventional |

### Round-3 SUGGESTIONs (non-blocking)

- S-R3-1. `sub()` template helper duplicated. `install-cmd.ts:60-62` and `doctor-report.ts` both define an inline `sub(template, vars)` for `{key}` substitution. Apply flagged this as intentional (keeps `i18n/strings.ts` pure — no formatter coupling). Suggested future cleanup: extract a tiny `src/i18n/format.ts` with one exported `interpolate(t, vars)` and have both consumers import it. Not a blocker.
- S-R3-2. Pre-existing TSC error in `src/cli/__tests__/argv.test.ts` (TS2345 on `process.exit` mock signature). Part of the baseline 71. Not introduced this round.

### Round-3 decision

**APPROVED-WITH-WARNINGS**. All three round-2 findings (F1 CRITICAL, F2 WARNING, F3 WARNING) are mechanically closed with code + tests + i18n parity. Build is green, tree is clean, lockfile is frozen, no round-1/round-2 closure regressed. The remaining items (`sub()` duplication, pre-existing argv.test.ts TS error) are documented SUGGESTIONs that do not block archive.

Next: hand back to orchestrator for `sdd-archive`. The orchestrator should also commit the `openspec/changes/tui-install-publish/` SDD trail and push the 18 commits to `origin/main`.

---

# Verify Report — tui-install-publish

## Round 2 — 2026-05-16

**Verdict**: REJECTED (one new CRITICAL surfaced; round-1 C/W findings closed)
**Branch**: main (15 commits ahead of origin/main)
**Tests**: 715 / 715 passing (74 files) — +12 from round 1
**tsc**: 71 errors (= baseline, unchanged)
**Git status**: clean (only in-flight `openspec/changes/tui-install-publish/` untracked, per orchestrator)
**Lockfile**: `pnpm install --frozen-lockfile` succeeds at HEAD, 97913d3, and 13c6107

### Round-2 executive summary

The apply fix pass closed all three round-1 CRITICAL findings and four of five WARNINGs. The interactive rebase moved `ink` and `ink-select-input` into commit `97913d3` (was `5df2bb1`) together with the regenerated lockfile, restoring bisect buildability. `installInstructionsBlock` / `uninstallInstructionsBlock` are now wired into `install-cmd.ts` with four call sites and dry-run output. `tui.tsx` no longer references `runStart` at all — the daemon is spawned as a detached child process, which closes both C3 (isolation) and W4 (blocking await) in one stroke. Tests for invalid `--client`, no-clients-detected, and `registered-outdated` doctor status are all present. The i18n strings file gained 30+ keys in both `en` and `es`, and the parity invariant test passes.

However, validating apply's risk #3 — the trailing `"--"` in `buildDaemonSpawnArgs` — surfaced a real silent-but-fatal bug: `parseArgv` in `src/cli/index.ts` has no end-of-options handler, so the spawned daemon child immediately exits with code 1 on every TUI "Start daemon" invocation. `stdio: "ignore"` plus `child.unref()` hide the failure end-to-end. The user sees the "Daemon started (PID X)" message, but the daemon never actually opens the port. The existing tests for `buildDaemonSpawnArgs` only assert structural args; they never exercise `parseArgv` on those args. This is a new CRITICAL — caught by round-2 verify, exactly as the apply prompt asked.

One new WARNING surfaced: `tui.tsx:130` calls `formatDoctorReport(report)` without `lang`. The doctor section silently ignores the user's language toggle.

### Round-2 closures (round-1 findings)

| Finding | Status | Evidence |
|---------|--------|----------|
| C1 dirty tree + bisect broken | CLOSED | `src/cli/tui.ts` deleted; ink+ink-select-input in 97913d3 package.json (4 occurrences) + pnpm-lock.yaml (11 lines). Frozen-install succeeds at 97913d3 and 13c6107. |
| C2 instructions block not wired | CLOSED | 4 call sites in `install-cmd.ts` (lines 75, 99, 141, 162) + dry-run path prints planned action with path+version. |
| C3 static import of runStart | CLOSED | Zero occurrences of `runStart` in `tui.tsx`. Daemon spawned via `child_process.spawn` at line 88. |
| W1 hardcoded strings | PARTIAL | `tui.tsx` and `doctor-report.ts` fully t()-routed. `install-cmd.ts` still has ~10 diagnostic strings ("backup:", "instructions block:", "would install instructions block v...", "instructions backup:") bypassing t(). |
| W2 invalid --client test | CLOSED | `argv.test.ts:123, 129` |
| W3 no-clients-detected test | CLOSED | `install-cmd.test.ts:117` |
| W4 await runStart blocks | CLOSED | spawn-detached pattern; no `await` on never-returning promise. |
| W5 registered-outdated never emitted | CLOSED | `doctor-report.ts:135` emits it; tests at `doctor.test.ts:130, 178, 209`. |

### Round-2 NEW findings

#### CRITICAL — C-R2-1. Trailing `"--"` in spawn args crashes daemon child

- `src/cli/tui.tsx:24` — `buildDaemonSpawnArgs` returns `args = [entryPath, "daemon", "--no-open", "--"]`.
- `src/cli/index.ts:33-126` (parseArgv) has no `--` end-of-options handler.
- Walk: `daemon` → command; `--no-open` → flag; `"--"` → matches `arg.startsWith("-")` (line 114 negation skips the "unknown command" branch) → falls to line 120: `printError("✗ unknown flag: --"); process.exit(1)`.
- The daemon child exits before opening the port. `stdio: "ignore"` swallows the error message; `child.unref()` lets the TUI walk away. The user sees the "Daemon started (PID X)" feedback but no daemon is actually running. This will look like an intermittent port-bind problem to anyone debugging it.
- The unit tests for `buildDaemonSpawnArgs` (`tui-helpers.test.ts:62-78`) assert structural args only; they never feed the args through `parseArgv`.

**Prescribed fix (small)**:
1. Drop the trailing `"--"` from `tui.tsx:24` (one-line change), OR add `if (arg === "--") break;` to `parseArgv` after the `--dry-run` branch.
2. Add an integration test: feed `buildDaemonSpawnArgs(...).args` through `parseArgv` and assert `command === "daemon"` + no `process.exit` call.

#### WARNING — W-R2-1. Doctor section ignores language toggle in TUI

- `tui.tsx:130` calls `formatDoctorReport(report)` with no `lang` argument.
- `formatDoctorReport(report, lang = "en")` defaults to English. The TUI has `lang` available in scope (line 59) and threads it correctly to every other handler (lines 144, 146, 149, 216, 250).
- Result: toggling language with `l` updates the menu but leaves the doctor output English.

**Fix**: change line 130 to `showMessage(formatDoctorReport(report, lang));`.

### Round-2 risks validated

| Risk | Apply hypothesis | Validation |
|------|------------------|------------|
| 1. formatDoctorReport lang | TUI calls without lang | Confirmed — see W-R2-1 above. |
| 2. registered-outdated semantics | Tied to instructions-block version, not MCP-config version | Confirmed (`doctor-report.ts:135`). Defensible interpretation; spec was silent on which version drives "outdated". The instructions block IS the versioned artifact, so this is a reasonable signal — but worth surfacing. |
| 3. Trailing "--" breaks argv parse | Possible breakage | **CONFIRMED bug** — see C-R2-1 above. |
| 4. scripts/rebase-seq-editor.sh leak | Should be deleted | Confirmed gone. Git status clean. |

### Round-2 build state

| Check | Result |
|-------|--------|
| `pnpm test` | 715 passed (74 files) |
| `pnpm tsc --noEmit` | 71 errors (baseline) |
| `pnpm install --frozen-lockfile` at HEAD | OK |
| `pnpm install --frozen-lockfile` at 97913d3 | OK |
| `pnpm install --frozen-lockfile` at 13c6107 | OK |
| `git status` | clean (only in-flight SDD trail untracked) |
| `git log b4081f8..HEAD --oneline \| wc -l` | 15 (11 rebased originals + 4 fix commits) |

### Round-2 decision

**REJECTED** — but with a tight, mechanical fix list:

- **F1 (CRITICAL, required)**: Drop trailing `"--"` from `buildDaemonSpawnArgs` (one line), OR add `--` end-of-options handling to `parseArgv`. Add a test that pipes spawn args through parseArgv.
- **F2 (WARNING, recommended)**: Pass `lang` to `formatDoctorReport` at `tui.tsx:130`.
- **F3 (WARNING, optional)**: Route the remaining diagnostic strings in `install-cmd.ts` through `t()`.

Estimated work: ~30 minutes. After F1 is applied, re-run sdd-verify. If F1 alone is fixed (F2/F3 deferred), verdict will be APPROVED-WITH-WARNINGS.

---

# Verify Report — tui-install-publish

**Verdict**: REJECTED
**Date**: 2026-05-15
**Branch**: main (11 commits ahead of origin)
**Tests**: 703 / 703 passing (74 files)
**tsc**: 71 errors (= baseline, no regression)
**Dirty tree**: YES (CRITICAL)

## Executive summary

The 11 commits land tests and pass strict TDD, all 11 requirement areas are present in source, no forbidden dep was added to package.json, and the mcp auto-spawn path is untouched. But the change ships in a non-deliverable state: the working tree is dirty (orphan src/cli/tui.ts deletion + 318 lines of pnpm-lock.yaml regen never committed), agentboard install does not actually install the instructions block (the functions exist as unused exports), and tui.tsx violates the apply-prompt isolation requirement by statically importing runStart from ./start.js. These three findings are CRITICAL and block archive. There are also five WARNINGs around hardcoded English strings outside t(), missing tests for invalid --client validation, and the in-process runStart design choice in the TUI.

## Build state

| Check | Result | Evidence |
|-------|--------|----------|
| pnpm test | 703 passed (74 files) | matches +105 from 598 baseline |
| pnpm tsc --noEmit | 71 errors | matches baseline; new files do not regress |
| git log --oneline -15 | All 11 SHAs present in claimed order | confirmed |
| git status | **DIRTY** | deleted: src/cli/tui.ts, modified: pnpm-lock.yaml, untracked openspec/changes/tui-install-publish/ |

## CRITICAL findings (must fix before archive)

### C1. Dirty working tree on main (orphan placeholder + uncommitted lock)

- src/cli/tui.ts (the placeholder stub from earlier work) is **deleted in the working tree but NEVER committed**. Commit 5df2bb1 added tui.tsx (the real implementation) without deleting the orphan tui.ts. The deletion shows up as an uncommitted change on main.
- pnpm-lock.yaml has 318 lines of additions in the working tree (all ink / ink-select-input transitive deps: chalk@5.6.2, cli-truncate, code-excerpt, auto-bind, alcalzone-ansi-tokenize, etc.). The lock was never committed in any of the 11 SHAs.
- Side effect: commit 5df2bb1 cannot build on a fresh checkout from itself because package.json only gains ink / ink-select-input in commit 3fe9134 (the LAST commit). The TUI commit (commit 10) references a dep that does not enter package.json until commit 11. **Bisect is broken; CI on commit 10 would fail.**

**Prescribed fix**:
1. git rm src/cli/tui.ts and commit it together with the lock regen.
2. Move the ink + ink-select-input dependency additions from commit 3fe9134 into commit 5df2bb1 (interactive rebase).
3. Re-run pnpm test to confirm nothing breaks.

### C2. agentboard install does NOT install the instructions block

- src/install/instructions.ts exports installInstructionsBlock / uninstallInstructionsBlock (lines 91, 141) and has unit tests in src/install/__tests__/instructions.test.ts.
- **But nothing in src/cli/install-cmd.ts ever calls these functions.** A grep for installInstructionsBlock / uninstallInstructionsBlock in src/ returns only the test file and the module itself.
- Requirement #8 says install logic must: file missing -> create; file exists no block -> append; file exists with same version -> no-op; file exists with older version -> splice in place. None of this is reachable because the runner never invokes the splice logic.
- Doctor (src/cli/doctor-report.ts:125) DOES call detectInstructionsBlock, so the report correctly says instructions: missing for every client. Users will run agentboard install to fix it, the doctor will keep saying instructions: missing, and there is no way to ever reach instructions: current through the CLI.

**Prescribed fix**: in src/cli/install-cmd.ts, after each successful adapter.install(...), also call installInstructionsBlock with the per-client target path:
- claude-code -> ~/.claude/CLAUDE.md
- opencode    -> ~/.config/opencode/AGENTS.md
- copilot     -> ~/.copilot/AGENTS.md

Symmetric change in runUninstall for uninstallInstructionsBlock. Extract instructionsFilePath(id) from doctor-report.ts:68-74 into a shared module so both consumers share it. Add an integration test that runs runInstall with override paths for BOTH the MCP file AND the instructions file, and asserts both got written.

### C3. tui.tsx static-imports runStart from ./start.js, violating isolation requirement

- Apply prompt risk #4 said: Import cycle TUI -> start.ts -> Fastify must be isolated via dynamic imports.
- src/cli/tui.tsx:13 contains a static, top-level import: import runStart from ./start.js
- Consequence: loading the TUI eagerly pulls in start.ts, which imports buildApp, Fastify, fastify-static, fastify-websocket, MCP SDK, better-sqlite3 — the entire daemon dep tree comes along on every TUI launch. The TUI is supposed to be lightweight.

**Prescribed fix**: in tui.tsx, replace the top-level import of runStart with a dynamic import inside the start-daemon handler. This matches the dynamic-import pattern already used in index.ts:180 for runMcp and index.ts:186 for runInstall.

## Requirement coverage

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | Default behavior: TTY -> TUI, non-TTY -> help | PASS (untested) | src/cli/index.ts:225-234 |
| 2 | Subcommands mcp/daemon/stop/status/export preserved | PASS | git log 6083076..HEAD on src/cli/mcp.ts is empty |
| 3 | install/uninstall/doctor subcommands present | PASS | src/cli/index.ts:54-56 |
| 3 | Reject invalid --client value | PARTIAL | src/cli/index.ts:192,205 rejects at runtime; no test |
| 4 | TUI menu items present and navigable | PASS | src/cli/tui-helpers.ts:23-35, tui.tsx:65-145 |
| 4 | Language toggle (l) instant + persisted | PASS | tui.tsx:51-55 + lang-config.ts:34-52 |
| 5 | src/i18n/strings.ts with en + es + t(); key parity | PASS | strings.ts:8-135, test strings.test.ts:18-23 |
| 5 | No new i18n library | PASS | package.json clean |
| 5 | All TUI/CLI strings via t() | FAIL (WARNING) | see W1 |
| 6 | update-check.ts + 2s timeout + graceful degrade | PASS | update-check.ts:44-46, 64-67 |
| 7 | Claude-Code adapter shape exact | PASS | claude-code.ts:18-27 |
| 7 | OpenCode adapter (command-array + schema) | PASS | opencode.ts:39-44, 91 |
| 7 | Copilot adapter (env + tools, COPILOT_HOME) | PASS | copilot.ts:27-30, 38-48 |
| 7 | Atomic write + backup + JSON.stringify | PASS | utils.ts:38-47 |
| 8 | Instructions template at templates/agent-instructions/agentboard-v0.1.0.md | PASS (byte-compare UNVERIFIABLE) | file exists, content plausible |
| 8 | Block markers + managed-by line | PASS | instructions.ts:19-20, 55 |
| 8 | Install logic for instructions block (4 cases) | PASS at module level | instructions.ts:91-135 |
| 8 | Wired from CLI | **FAIL (CRITICAL C2)** | install-cmd.ts never calls installInstructionsBlock |
| 9 | Doctor sections + prefixes | PASS | doctor-report.ts:226-294, 202-224 |
| 10 | private removed + metadata + files + bin + prepublishOnly | PASS | package.json:4-44 |
| 11 | Only ink + ink-select-input added as direct deps | PASS | grep clean |
| 11 | pnpm-lock.yaml matches package.json | **FAIL (CRITICAL C1)** | 318 lines uncommitted |

## WARNINGs

### W1. Hardcoded English strings outside t() in new code

- src/cli/tui.tsx:161 "Press any key to return to the menu."
- src/cli/tui.tsx:171 "Press Esc or q to return."
- src/cli/tui.tsx:255 "l = toggle language  q = quit"
- src/cli/tui.tsx:76, 114, 200, 234 Error prefix on showMessage
- src/cli/install-cmd.ts:63 "No supported MCP clients detected..."
- src/cli/install-cmd.ts:104 "agentboard was not registered..."
- src/cli/doctor-report.ts: essentially the entire formatter is English-only (lines 229, 235, 237, 246-249, 256-261, 269, 274-281, 286-289).

**Fix**: add keys to src/i18n/strings.ts for each, plumb lang through formatDoctorReport and the install-cmd runners (read from readLanguage(agbHome) at the top).

### W2. No test for invalid --client value rejection

- The validation lives in src/cli/index.ts:191-193, 204-206 and exits 1, but src/cli/__tests__/argv.test.ts has no case for it.

**Fix**: add a test invoking main() with [node, agentboard, install, --client, does-not-exist] and assert process.exit(1).

### W3. No test for no-clients-detected friendly message branch

- runInstall with clientId null and no detected adapters prints a friendly message but no test verifies the branch.

**Fix**: add an install-cmd.test.ts case that calls runInstall with all override paths pointing at non-existent files.

### W4. runStart called inline in TUI process (apply risk #2)

- tui.tsx:73 awaits runStart inside a useCallback. runStart keeps Fastify alive until process exit; the await blocks forever; showMessage at line 74 never fires.
- Apply notes flagged this as confirm-with-spec. Spec only says user-triggered, not automatic - silent about in-process vs out-of-process.

**Fix**: replace inline runStart with spawnDaemonDetached (src/cli/spawn-daemon.ts).

### W5. Doctor MCP-status never produces registered-outdated

- doctor-report.ts:127-134 only ever returns registered-current. The type signature lies because registered-outdated is in the union but never emitted.

**Fix (low priority)**: either drop the variant or add an args.includes(@jobshimo/agentboard@version) check.

## SUGGESTIONs

- S1. tui.tsx:255 footer is static English even when lang is es. Add tui.footer_hint key.
- S2. doctor-report.ts:202 colorEnabled computed at module load - inline into formatDoctorReport if dynamic TTY detection ever matters.
- S3. tui-helpers.ts:46-55 registryRowsFromReport is exported but never used by tui.tsx. Dead code.

## Risks not fully evaluated

- Canonical template byte-compare: the apply prompt template text was not stored in engram. The files structure is plausible but a maintainer should diff against authoritative source.
- TTY decision path: index.ts:226 is not exercised by any test. Manual smoke testing required before publish.
- tsconfig.build.json not inspected. Verify build config handles jsx and emits tui.tsx -> tui.js correctly.

## Decision

**REJECTED**. Three CRITICAL findings block archive:
- C1: dirty working tree (orphan deletion + uncommitted lock) - bisect broken
- C2: agentboard install is silently broken for the instructions-block half of the feature
- C3: TUI breaks the dep-isolation requirement set in the apply prompt

Five WARNINGs (W1-W5) should be addressed before publish but do not strictly block archive.

## Next steps

Hand back to sdd-apply with the prescribed fix list above. After C1-C3 are resolved (and ideally W1-W4), re-run sdd-verify. Do not attempt npm publish until verification passes.
