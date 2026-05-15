# SDD Verify Report -- agentboard-mvp

**Date**: 2026-05-15
**Verdict**: NEEDS_FIXES -- 5 CRITICAL, 6 WARNING, 4 SUGGESTION
**Tests**: 460/460 passing across 42 files.

See engram topic key sdd/agentboard-mvp/verify-report (id 599) for the full structured report.

## CRITICAL findings (must fix before archive)
- C1: agentboard init does NOT copy a workflow template (src/cli/init.ts)
- C2: triggered_by workflow steps are created upfront, not deferred (src/domain/task.ts seedWorkflowSubtasks)
- C3: blocks_next is parsed but never enforced (no consumer)
- C4: Status transitions emit subtask_updated instead of status_change; no task_blocked / task_completed cascade (src/mcp/tools/subtask.update.ts, src/server/rest.ts PATCH)
- C5: external.fetch(ref) accepts a task id, not a reference string (src/mcp/tools/external.fetch.ts)

## WARNING
- W1: Active tool count 14 exceeds spec ceiling 6-8 (design.md overrides; spec not updated)
- W2: Piggyback ignores attention.agent_sees_human_events config flag
- W3: task.get accepts include_discussion but not full_discussion parameter
- W4: task.list compact shape omits current-subtask summary
- W5: Phase 3 cross-cutting tests (3.1 e2e, 3.2 token-budget, 3.3 gc-integration) not implemented
- W6: agent_notification push uses "_global" instead of null for task-less notifications

## SUGGESTION
- S1: Adapter-layer raw SQL in src/mcp/activation.ts -- move agent_sessions writes into a domain/sessions.ts
- S2: task.add_custom_subtask paramsSchema uses task_id; spec calls it id
- S3: Empty SPA workflow sidebar (PLACEHOLDER_WORKFLOWS in App.tsx)
- S4: feedback.add MCP schema requires task_id alongside target; spec lists only target/text/severity

## Verified GREEN
Storage (WAL pragmas, per-repo isolation, derived markdown, export overwrite); domain six-state machine and derivedStatus priority; workflows YAML schema and snapshot immutability; event queue FIFO via AUTOINCREMENT, per-session cursor, poll non-blocking, wait long-poll with timeout, three-phase GC; MCP lazy activation flips 14 stubs via tool.enable()/.disable() (no private SDK access); feedback scoring matches design 2.13; launcher --port/--no-open/--help/--version/NO_COLOR/AGB_HOME; realtime WS broadcast on writes with signal-only payload; zero external adapters; compact shapes, deltas, lazy discussion threshold=50; quality bar (no TODO, no file-header JSDoc, hexagonal boundaries clean).

## Recommended next step
sdd-apply for a follow-up slice resolving C1-C5, or open as a tracked change. Do NOT archive while CRITICAL items are open.

---

# Round 2 -- Re-verify after fix slice (commit e560076)

**Date**: 2026-05-15
**Verdict**: NEEDS_FIXES -- 3 PARTIAL, 5 RESOLVED, 2 new minor, 3 deferred warnings still open
**Tests**: 481/481 passing across 42 files (npx vitest run).

The fix slice landed real progress on every CRITICAL, but three of the five fixes still violate the spec contract once you read the code instead of the commit message. Two are silent today; one (C2) is loud the moment an agent records the pr_comment event.

Full engram observation: id 599 (sdd/agentboard-mvp/verify-report, revision 2).

## Per-finding resolution

### C1 -- workflow template copy in agentboard init -- PARTIAL

Fix added copyWorkflowTemplate(cwd) copying a bundled template into <repo>/.agentboard/workflows/coding-task.yaml. Four spec gaps remain (launcher.md L40-62):

1. Source path mismatch: spec mandates template MUST come from ~/.agentboard/workflows/. Implementation reads from a node_modules-bundled file.
2. Destination filename mismatch: spec mandates <repo>/.agentboard/workflow.yaml (singular). Implementation writes <repo>/.agentboard/workflows/coding-task.yaml.
3. Missing exit-code contract: spec L52-55 says non-zero exit when no global workflows dir. Implementation silently returns exit 0.
4. Missing prompt/refuse messaging: spec L57-62 says prompt or refuse on existing destination. Implementation silently skips with no stdout.

Where: src/cli/init.ts:7-8,29-41.

### C2 -- deferred triggered_by subtask materialization -- PARTIAL

seedWorkflowSubtasks correctly skips triggered steps. materializeTriggeredSubtask exists, tested, idempotent. BUT nothing calls it when pr_comment is inserted. src/events/insert.ts iterates hooks.listeners (BroadcastManager, WaiterRegistry) but no materializer is registered. Spec workflows.md L83-88 contract not satisfied end-to-end.

Where: src/domain/task.ts:100-125 (unwired), src/events/insert.ts (no listener), src/server/app.ts and mcp boot (no subscription).

### C3 -- blocks_next enforcement -- RESOLVED

canStartSubtask reads workflow_snapshot, finds prior blocksNext steps, treats pending/failed as block. Wired into task.start.ts:37, subtask.update.ts:43 (MCP), rest.ts:337 (REST PATCH). Four unit tests. Spec met.

### C4 -- correct event types for status transitions -- PARTIAL

Good: applyStatusTransition extracted as pure-domain function; both adapters call it; status_change emitted (not subtask_updated); task_completed cascade correct.

Bad (spec L42-48 payload shapes):
- task_blocked payload missing subtask_id. subtask.ts:190 emits only { task_id }.
- task.start.ts:50 emits status_change without task_id in payload. This path bypasses applyStatusTransition.
- subtask_updated for notes (rest.ts:359, subtask.update.ts:66) does not match spec field/value naming.

### C5 -- external.fetch ref parsing -- RESOLVED

Splits args.ref on first colon, ValidationError on malformed, getTaskByRef queries ref_source + ref_id. Spec L29 met.

### Apply-progress W1 (orig W6) -- broadcaster sentinel to null -- RESOLVED

broadcaster.ts:13,23 maps _global to null in wire payload, preserves DB sentinel internally. Test added.

### Apply-progress W2 (orig W3) -- task.get full_discussion -- RESOLVED

task.get.ts:20,41 + new getAllEntries bypasses SUMMARY_THRESHOLD. Test added.

### Apply-progress W3 (orig W4) -- task.list current_subtask -- RESOLVED

CompactTask extended with current_subtask field. task.list queries first non-terminal subtask per task. Tests added.

### Original W1 / W2 / W5 -- UNADDRESSED (correctly deferred)

- Orig W1 (tool count 14 vs spec 6-8): apply-progress acknowledges spec amendment PR pending.
- Orig W2 (agent_sees_human_events flag): still not threaded into piggyback. Default behavior matches spec.
- Orig W5 (Phase 3 cross-cutting tests): not implemented. Would have caught C1/C2/C4 payload shapes earlier.

## New findings (introduced by the fix slice)

### N1 (WARNING) -- subtask.update with both status and note bumps updated_at twice

subtask.update.ts:53-60: applyStatusTransition writes status+updated_at then a second applySubtaskUpdate writes note+updated_at. Two writes where one would do. Functionally harmless.

### N2 (SUGGESTION) -- discussion.ts row-mapping duplication

getEntries and getAllEntries duplicate row to DiscussionEntry mapping (~15 LOC). Extract mapRow helper. Cosmetic.

## Minimum fix-up before archive

1. C1 fix-up: read from ~/.agentboard/workflows/, write to .agentboard/workflow.yaml (singular), exit non-zero on missing source, print refuse-message on conflict.
2. C2 wire-up: register materializeTriggeredSubtask listener via eventHooks. Add integration test.
3. C4 payload fix-up: add subtask_id to task_blocked payload in applyStatusTransition; add task_id to status_change payload in task.start.ts; align subtask_updated payload field naming.

C3 and C5 clean. The three apply-progress warnings clean. Orig W1/W2/W5 deferred.

After fix-up slice lands and tests stay green, change is archive-ready (modulo orig W1 spec amendment which can be its own PR).


---

# SDD Verify Report Round 3 -- agentboard-mvp

**Date**: 2026-05-15
**Verdict**: APPROVED -- 4 RESOLVED (C1, C2, C4, N1), 0 new findings, 0 regressions
**Tests**: 494/494 passing across 43 files (`npx vitest run`).

The round-2 fix slice landed every outstanding PARTIAL with full spec compliance and test coverage. No regressions found. The change is archive-ready modulo deferred SUGGESTIONs (orig W1 spec amendment, W2 agent_sees_human_events flag, W5 Phase 3 cross-cutting tests) which remain open as follow-up engram items.

## Per-finding resolution

### C1 -- `agentboard init` template copy -- RESOLVED

All four round-2 spec gaps closed in `src/cli/init.ts`:

1. Source path fixed: `copyWorkflowTemplate` reads from `~/.agentboard/workflows/` (sorted, first `.yaml`/`.yml`) -- matches launcher.md L40.
2. Destination filename fixed: writes to `<cwd>/.agentboard/workflow.yaml` (singular, no subdir) -- matches launcher.md L40 + L48.
3. Exit-code contract honored: `process.exit(1)` when global dir missing (init.ts:75) and when dir is empty (init.ts:87) -- matches launcher.md L51-55.
4. Refuse messaging present: `process.exit(1)` with informative message when destination exists (init.ts:93-99) -- matches launcher.md L57-62.

Architecture decision: `runStart` now calls `initDb + seedUserWorkflows` (first-run UX seeds global dir from bundled template). `runInit` calls `initDb + copyWorkflowTemplate`. Separation prevents server startup from accidentally refusing due to existing workflow.yaml.

Test coverage: 10 init tests + 2 seedUserWorkflows tests (`src/cli/__tests__/init.test.ts`), each spec scenario has a dedicated test (success path, refuse-on-overwrite, missing global dir, empty global dir).

### C2 -- triggered_by deferred materialization wired end-to-end -- RESOLVED

`createTriggerMaterializer(db)` lives in `src/events/triggered-materializer.ts` and is wired as the third entry in `sharedListeners` (broadcaster + waiters + materializer) inside `buildApp` (`src/server/app.ts:79-80`). Both REST hooks and MCP `eventHooks` reuse the same `sharedListeners` reference -- single materializer instance across both adapters.

Listener implementation: rehydrates the workflow snapshot from `tasks.workflow_snapshot`, scans for any step whose `triggeredBy === event.type`, and calls `materializeTriggeredSubtask` (which is idempotent via the existing `step_id` uniqueness check). Skips `_global` events. Swallows malformed snapshot JSON without crashing the insert pipeline.

Spec contract (workflows.md L83-88): WHEN an event of type `pr_comment` is recorded for a task whose snapshot has a `triggered_by: pr_comment` step, THEN that subtask MUST be created -- satisfied end-to-end with 4 integration tests in `src/events/__tests__/triggered-materializer.test.ts` (creation, idempotency on duplicate events, no-op on non-matching event type, no-op on `_global` events).

### C4 -- correct event types for status transitions -- RESOLVED

All three round-2 payload defects fixed in `src/domain/subtask.ts` applyStatusTransition:

a) `task_blocked` payload now `{ task_id, subtask_id }` (subtask.ts:191) -- matches event-queue.md L48. Dedicated test "task_blocked payload includes both task_id and subtask_id (spec L48)" in `subtask.test.ts:321`.

b) `task.start.ts` rerouted through `applyStatusTransition` (task.start.ts:44-49). `status_change` payload now carries `{ task_id, subtask_id, from_status, to_status }` -- matches event-queue.md L42. Dedicated test "status_change payload includes task_id, subtask_id, from_status, to_status (spec L42)" in `tools.test.ts:246`.

c) `subtask_updated` payload for note-only updates now `{ task_id, subtask_id, field: "note", value }` in both adapters (subtask.update.ts:64, rest.ts:357) -- matches event-queue.md L44. Dedicated test "subtask_updated payload uses { task_id, subtask_id, field, value } shape (spec L44)" in `tools.test.ts:391`.

### N1 -- single write when status+note both change -- RESOLVED

`applyStatusTransition(db, id, from, to, note?)` accepts an optional `note` and forwards it to the single `applySubtaskUpdate` call (subtask.ts:180). Both adapters (`subtask.update.ts:54`, `rest.ts:347`) pass `note` into the transition call. No second UPDATE statement is issued. Test "single write when both status and note change" in `subtask.test.ts` and `tools.test.ts`.

### N2 -- discussion.ts row-mapping deduplication -- RESOLVED (cosmetic)

`mapEntryRow(r: DiscussionRow): DiscussionEntry` extracted at `src/domain/discussion.ts:31-33`. Both `getEntries` and `getAllEntries` now use `rows.map(mapEntryRow)`. `DiscussionRow` extracted as a private type alias.

## Regression scan (new issues introduced by round-2 fix slice)

None. Concretely checked:

- `runStart` continues to work even when `~/.agentboard/workflows/` is empty: `initDb` no longer requires a workflow file (separation of concerns from C1 fix) and `seedUserWorkflows` is silent if the bundled template is missing.
- The third `sharedListeners` entry (materializer) does not break broadcaster or waiter semantics -- 27 rest tests + 47 mcp tools tests + 10 ws tests all green.
- `applyStatusTransition` note-forwarding is opt-in (parameter is `note?: string`), so existing callers without note still produce identical SQL.
- `task.start` payload now exposes `task_id` -- consumers that only read `subtask_id` (web ws.test.ts) are unaffected because the payload is additive.

## Deferred items (open, not blocking archive)

- **Orig W1** -- spec says 6-8 active tools, design + implementation expose 14. Needs spec amendment PR. Not a code defect.
- **Orig W2** -- `attention.agent_sees_human_events` flag not threaded into piggyback. Functionality is currently always-on. Tracked as a follow-up.
- **Orig W5** -- Phase 3 cross-cutting tests (e2e activation lifecycle, full token-budget audit, GC integration with WaiterRegistry). Would have caught C1/C2/C4 earlier; valuable hardening but not a spec violation.

## Verdict

**APPROVED.** All CRITICALs from rounds 1+2 closed with spec-traceable tests. 494/494 green. Recommend `sdd-apply` for Phase 4 docs (or `sdd-archive` directly if docs are out-of-scope for this change).
