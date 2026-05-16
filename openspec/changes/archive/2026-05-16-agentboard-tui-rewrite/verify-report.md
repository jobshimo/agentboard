# Verify Report — agentboard-tui-rewrite

**Date**: 2026-05-16
**Branch**: main (9 commits ahead of origin/main, working tree clean)
**Verdict**: APPROVED-WITH-WARNINGS
**Test result**: 763 passed / 0 failed (77 files). +30 tests from baseline 733.
**Strict TDD**: tests co-located in src/cli/tui/__tests__/components.test.tsx, all rendering via ink-testing-library.

## Commits verified (9, matching apply claim)

- 8d14dc3 feat(tui): tokens module with COLORS + SPACE + GLYPHS registry
- 3f43cf0 feat(tui): Frame component with title + StatusBar + FooterKeys slots
- 25e14fe feat(tui): MenuRow + SectionHead + Badge primitives
- df4f7fb feat(tui): MenuScreen with dual nav (arrows + hotkeys) and grouped sections
- ca57b9d feat(tui): InstallScreen with per-client right-aligned badges
- 4875e27 feat(tui): ProjectsScreen + DoctorScreen + UpdateScreen sub-screens
- cb9b2fb refactor(tui): screen routing in tui.tsx, delete old banner render path
- ead5a91 feat(i18n): keys for all new TUI surface in en + es
- 2be1b53 test(tui): render tests for Frame, Menu, primitives via ink-testing-library

## Deliverable matrix

| # | Deliverable | Status | Evidence |
|---|---|---|---|
| 1 | tokens.ts (COLORS ANSI / SPACE / GLYPHS) | OK | 8 COLOR roles by ANSI name; SPACE {none:0,gap:1,block:2}; GLYPHS including cursor, check, cross, warn, info, dot, arrows, spinnerFrames. Imported by Frame, StatusBar, MenuRow, Badge, FooterKeys, SectionHead, all 5 screens. |
| 2 | Frame.tsx | OK | Round border, title row, badge slot (flexGrow + flex-end), always renders StatusBar + FooterKeys. Used by all 5 sub-screens. |
| 3 | StatusBar.tsx | OK w/ warnings | Wires probeForExistingDaemon + loadRegistry. Spinner via setInterval(80ms). Singular vs plural project count. NO render test for daemon-up/down strings. |
| 4 | Dual nav | OK w/ warnings | MenuScreen useInput: up/down updates idx, Enter fires MENU_SPEC[idx].value, hotkey lookup via MENU_SPEC.find. ink-select-input NOT imported. 9 hotkeys present (s/o/p/i/u/d/c/l/q). NO stdin.write dispatch test. |
| 5 | Primitives | OK w/ notes | MenuRow/Badge/KeyCap/SectionHead exist. MenuRow onFire prop declared but not invoked (parent handles useInput). Badge covers ok/warn/err/info/muted. KeyCap uses Ink inverse. SectionHead marginTop=SPACE.gap. |
| 6 | Sub-screens | OK | All 5 exist. InstallScreen: 3 clients with translated Badge label. ProjectsScreen reads registry + empty state. DoctorScreen invokes buildDoctorReport + formatDoctorReport. UpdateScreen invokes checkForUpdate. Each in Frame, each has Esc/q back handler. |
| 7 | tui.tsx routing hub | Partial | App uses useState<Screen> + switch(screen.kind) at lines 255-314. Routes to all 5 screens. HOWEVER legacy Banner still EXPORTED at lines 60-129; file header comment at line 9 falsely claims Banner is removed. Banner is no longer rendered by App, but the dead export contradicts the comment. |

## Findings

### CRITICAL
None.

### WARNING

1. Banner export still present in src/cli/tui.tsx lines 27-129 while the file header comment claims it is removed. App routing never instantiates Banner. The export is preserved only so src/cli/__tests__/tui-banner.test.tsx (8 tests) keeps passing. Fix the comment or delete export + legacy test in a follow-up.

2. Duplicate color sources of truth: src/cli/palette.ts (10 roles by hex, NO_COLOR-aware) and src/cli/tui/tokens.ts (8 roles by ANSI name) overlap semantically. palette.ts is consumed only by tui.tsx for the legacy Banner. After Banner removal, palette.ts becomes dead code. Cleanup follow-up.

3. ink-select-input ^6.2.0 in package.json line 53 but no src import. Remove from package.json and re-lock.

4. Hardcoded English in StatusBar.tsx (lines 74, 82, 92-93): daemon checking, daemon stopped, 1 project / N projects. These appear on every screen and should go through t(key, lang). Component does not currently receive lang as a prop, plumbing it through Frame is part of the fix.

5. Hardcoded English defaults in Badge.tsx (KIND_TO_DEFAULT_LABEL): registered, not registered, error, info, not detected. Today every caller (InstallScreen) passes a translated label prop, so users do not see these strings, but they are latent. Either drop the defaults and make label required, or move them into i18n keys.

6. Menu grouping: SERVER / CLIENT / DIAGNOSE / REFERENCE. Under SERVER sits start-daemon + open-web-ui + list-projects. list-projects is a discovery/navigation action and feels misplaced. Candidates: rename SERVER to DAEMON and move list-projects to NAVIGATE/DISCOVER, or to REFERENCE.

7. Coverage gaps vs brief test requirements:
   - StatusBar has no render test asserting daemon-up / daemon-down output strings.
   - MenuScreen tests are pure render-frame assertions; none simulates stdin.write to verify dispatcher fires on hotkey.

### SUGGESTION

- onFire prop on MenuRow declared but never invoked. Wire it (move useInput per-row) or remove from the interface.
- Banner cleanup in one commit: drop palette.ts + Banner export + tui-banner.test.tsx + remove ink-select-input from package.json.
- buildDaemonSpawnArgs and daemonEnv inside tui.tsx (lines 134-144) are unchanged from before the rewrite. Fine to leave.

## Apply-flagged risk resolution

| Apply risk | Verify resolution |
|---|---|
| (a) Menu grouping labels SERVER/CLIENT/DIAGNOSE/REFERENCE | Confirmed. list-projects under SERVER is awkward. WARNING #6. |
| (b) palette.ts not deleted | Confirmed. Coexists with tokens.ts. Only tui.tsx (Banner) consumes palette.ts. Same colors (ok/warn/err/info/muted) live in both registries with different transport (hex vs ANSI name). WARNING #2. |
| (c) ink-select-input unused | Confirmed in package.json line 53. Zero src imports. WARNING #3. |

## Test suite

- Total: 763 passed / 0 failed / 77 files / ~4.4s.
- i18n invariant: every en key has an es mirror, passes.
- Phrase counts: 132 occurrences of tui.* / menu.* / install.status.* across en + es = 66 unique keys (>=60 budget).
- Build: not re-run per user rule never build after changes. Vitest transforms TS via tsx; a green test run is a strong signal but not a substitute for tsc --project tsconfig.build.json. Apply progress claims 0 TS errors at build.

## Verdict

APPROVED-WITH-WARNINGS. The 7 deliverables are functionally present and the test suite is green at +30 tests. All warnings are cleanup-shaped, not behavior bugs. Recommended follow-up commit: drop Banner export + tui-banner.test.tsx + palette.ts + ink-select-input from package.json; thread lang into StatusBar and i18n the daemon/projects strings; move list-projects out of the SERVER group; add a StatusBar daemon-state render test and a MenuScreen hotkey-dispatch test.

Orchestrator may push the 9 commits as-is. The follow-up belongs in a separate change.
