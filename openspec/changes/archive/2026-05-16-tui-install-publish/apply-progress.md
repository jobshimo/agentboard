# Apply Progress — tui-install-publish

## Summary

All 11 commits implemented successfully.

Tests: 598 (baseline) → 703 (+105 new tests)
tsc errors: 71 (baseline) → 71 (unchanged)
Mode: STRICT TDD — RED test first for every commit slice

## TDD Cycle Evidence

| Commit | RED | GREEN | REFACTOR |
|--------|-----|-------|----------|
| 1. i18n strings + lang-config | tests fail (module missing) | created strings.ts + lang-config.ts | n/a |
| 2. Installer interface + utils | tests fail (module missing) | created types.ts + utils.ts | n/a |
| 3. Claude Code adapter | tests fail (module missing) | created adapters/claude-code.ts | n/a |
| 4. OpenCode adapter | tests fail (module missing) | created adapters/opencode.ts | n/a |
| 5. Copilot adapter | tests fail (module missing) | created adapters/copilot.ts | n/a |
| 6. install/uninstall subcommands | tests fail (module missing) | created install-cmd.ts + updated index.ts | n/a |
| 7. instructions block | tests fail (module missing) | created instructions.ts + template | n/a |
| 8. update-check | tests fail (module missing) | created update-check.ts | n/a |
| 9. doctor command | tests fail (module missing) | created doctor-report.ts + doctor.ts | n/a |
| 10. TUI | tests fail (module missing) | created tui.tsx + tui-helpers.ts | n/a |
| 11. npm publish prep | n/a (no code, only package.json) | updated package.json | n/a |

## Completed Tasks

- [x] 1. feat(i18n): EN/ES string map + t() helper + config.yaml language field
- [x] 2. feat(install): Installer interface + backup/atomic-write utilities
- [x] 3. feat(install): Claude Code adapter
- [x] 4. feat(install): OpenCode adapter
- [x] 5. feat(install): GitHub Copilot adapter
- [x] 6. feat(install): agentboard install / uninstall subcommands
- [x] 7. feat(install): instructions block install + template
- [x] 8. feat(cli): update-check module
- [x] 9. feat(cli): doctor command
- [x] 10. feat(tui): Ink+React TUI menu
- [x] 11. chore(pkg): npm publish prep

## Files Changed

| File | Action |
|------|--------|
| src/i18n/strings.ts | Created |
| src/i18n/lang-config.ts | Created |
| src/i18n/__tests__/strings.test.ts | Created |
| src/i18n/__tests__/lang-config.test.ts | Created |
| src/install/types.ts | Created |
| src/install/utils.ts | Created |
| src/install/__tests__/utils.test.ts | Created |
| src/install/adapters/claude-code.ts | Created |
| src/install/__tests__/claude-code.test.ts | Created |
| src/install/adapters/opencode.ts | Created |
| src/install/__tests__/opencode.test.ts | Created |
| src/install/adapters/copilot.ts | Created |
| src/install/__tests__/copilot.test.ts | Created |
| src/install/instructions.ts | Created |
| src/install/__tests__/instructions.test.ts | Created |
| src/cli/install-cmd.ts | Created |
| src/cli/__tests__/install-cmd.test.ts | Created |
| src/cli/index.ts | Modified |
| src/cli/__tests__/argv.test.ts | Modified |
| src/cli/doctor-report.ts | Created |
| src/cli/doctor.ts | Created |
| src/cli/__tests__/doctor.test.ts | Created |
| src/cli/update-check.ts | Created |
| src/cli/__tests__/update-check.test.ts | Created |
| src/cli/tui.tsx | Created |
| src/cli/tui-helpers.ts | Created |
| src/cli/__tests__/tui-helpers.test.ts | Created |
| templates/agent-instructions/agentboard-v0.1.0.md | Created |
| tsconfig.json | Modified (added jsx:react-jsx) |
| package.json | Modified |

## Commit SHAs

1. 2e661d6 feat(i18n): EN/ES string map + t() helper + config.yaml language field
2. 4dcf826 feat(install): Installer interface + backup/atomic-write utilities
3. ede9fee feat(install): Claude Code adapter (detect/install/uninstall)
4. b97cf07 feat(install): OpenCode adapter
5. e01b9d4 feat(install): GitHub Copilot adapter
6. 89ee6b9 feat(install): agentboard install / uninstall subcommands
7. 13c6107 feat(install): instructions block install + template
8. 47c6cd8 feat(cli): update-check module against npm registry
9. 6b7b4b5 feat(cli): agentboard doctor command
10. 5df2bb1 feat(tui): Ink+React menu with all options
11. 3fe9134 chore(pkg): prepare package.json for npm publish

## Verify Round-2 Fix Pass (F1 + F2 + F3)

Three additional commits applied on top of verify round-2 report (#628):

### F1 — CRITICAL fixed: c08403b fix(tui): drop stray "--" from daemon spawn args
- `buildDaemonSpawnArgs` returned `args: [entryPath, "daemon", "--no-open", "--"]`
- `parseArgv` treated `"--"` as an unknown flag → `process.exit(1)` silently
- Fix: removed `"--"` from args array → `args: [entryPath, "daemon", "--no-open"]`
- Tests added in `tui-helpers.test.ts`:
  - `does NOT contain '--' in the spawn args` (RED → GREEN)
  - `second arg is 'daemon' (subcommand position)`
  - `args parse cleanly through parseArgv — command is 'daemon', no exit` (triangulation)

### F2 — WARNING fixed: 6fc23a9 fix(tui): pass lang to formatDoctorReport for i18n
- `tui.tsx:130`: `formatDoctorReport(report)` → `formatDoctorReport(report, lang)`
- `lang` already in scope from TUI state
- Test added in `doctor.test.ts`:
  - `lang=es output differs from lang=en output (lang parameter is effective)` (triangulation)

### F3 — WARNING fixed: df2b187 fix(i18n): route remaining install-cmd diagnostic strings through t()
- Added 11 new i18n keys (`install.diag.*`, `uninstall.diag.*`) to `strings.ts` (en + es)
- Added `sub()` helper to `install-cmd.ts` for template substitution
- All `printLine(`` `backup:`, `instructions block:`, `[dry-run] would install`, etc.)` now use `t()` + `sub()`
- Tests added in `install-cmd.test.ts`:
  - `dry-run single client: output contains translated dry-run message when lang=es`
  - `install single client with backup: output contains translated backup label when lang=es`

### Final state after verify round-2 fixes
- Tests: 721/721 passing (was 715 before fix pass; +6 new tests)
- tsc errors: 71 (baseline unchanged)
- git status: clean (only untracked openspec/changes/tui-install-publish/)
