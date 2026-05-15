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
