# AGENTS.md — Contributor guide for AI coding agents

This repo uses **Spec-Driven Development (SDD)**. The full planning trail lives in `openspec/changes/agentboard-mvp/`. Read it before writing code.

---

## SDD artifacts

| Artifact | Path |
|----------|------|
| Product spec | `DESIGN.md` |
| UI scope contract | `BRIEF-DESIGN.md` |
| SDD proposal | `openspec/changes/agentboard-mvp/proposal.md` |
| Specs (10 files) | `openspec/changes/agentboard-mvp/specs/` |
| Design | `openspec/changes/agentboard-mvp/design.md` |
| Tasks (implementation checklist) | `openspec/changes/agentboard-mvp/tasks.md` |
| Verify report | `openspec/changes/agentboard-mvp/verify-report.md` |

Cross-session memory is persisted in Engram under project `agentboard`. Key topic keys: `sdd-init/agentboard`, `sdd/agentboard-mvp/apply-progress`, `sdd/agentboard-mvp/verify-report`.

---

## Architecture

```
                   ┌─────────────────────────────────────┐
                   │          CLI (src/cli/)              │
                   │  npx @jobshimo/agentboard            │
                   └───────────────┬─────────────────────┘
                                   │ starts
                   ┌───────────────▼─────────────────────┐
                   │         Fastify server               │
                   │         src/server/                  │
                   │                                      │
                   │  /api/*   REST routes                │
                   │  /ws      WebSocket broadcast        │
                   │  /mcp     MCP Streamable HTTP        │
                   │  /        static dist/web/           │
                   └─────┬──────────┬──────────┬─────────┘
                         │          │          │
              ┌──────────▼──┐  ┌────▼────┐  ┌─▼────────────┐
              │  Domain     │  │ Events  │  │   MCP tools  │
              │ src/domain/ │  │src/events│  │  src/mcp/   │
              └──────┬──────┘  └────┬────┘  └─────────────┘
                     │              │
              ┌──────▼──────────────▼──────┐
              │    SQLite (WAL)             │
              │  src/db/                   │
              │  <cwd>/.agentboard/db.sqlite│
              └────────────────────────────┘
```

**Hexagonal layering**:
- `src/domain/` — pure domain logic; no Fastify, no HTTP imports.
- `src/db/` — SQLite adapter; only the domain and events layers import it.
- `src/server/` — Fastify adapter; imports domain + events + feedback.
- `src/mcp/` — MCP adapter; imports domain + events + feedback.
- `src/cli/` — entry point; assembles adapters, never imports server internals.
- `src/web/` — React SPA; talks to the server only via REST + WebSocket.

---

## Module layout

| Path | What it does |
|------|-------------|
| `src/cli/` | `npx @jobshimo/agentboard` launcher; argv parser; `init`, `export`, `start` subcommands |
| `src/server/` | Fastify app factory, REST routes, WS broadcast manager, markdown renderer |
| `src/mcp/` | MCP Streamable HTTP transport, lazy activation, 14 tool handlers, compact/piggyback helpers |
| `src/db/` | `better-sqlite3` connection singleton, migration runner, SQL migrations in `migrations/` |
| `src/domain/` | Task/subtask/workflow domain models, six-state machine, discussion, ID generators |
| `src/events/` | Event queue: insert, poll, long-poll waiter registry, three-phase GC, triggered materializer |
| `src/feedback/` | Feedback add/search with weighted relevance scoring |
| `src/workflows/` | YAML loader, Zod schema validation, snapshot freeze/rehydrate |
| `src/config/` | `~/.agentboard/config.yaml` loader with defaults |
| `src/web/` | Vite + React 18 SPA; views: Board, TaskDetail, Settings; chrome: TopBar, Sidebar |
| `src/__tests__/` | Cross-module tests (smoke) |
| `templates/workflows/` | Bundled `coding-task.yaml` seeded to `~/.agentboard/workflows/` on first server launch |

---

## Dev workflow

```
pnpm install
pnpm dev:server        # Fastify + tsx watch on src/cli/index.ts
pnpm dev:web           # Vite dev server for the SPA (separate process)
pnpm test              # vitest run — must be 494/494 green before any commit
```

The server and SPA are separate processes in development. In production they share one port (Fastify serves the built `dist/web/`).

Build:

```
pnpm build             # tsc (server + cli) + copy migrations
pnpm build:web         # vite build → dist/web/
```

---

## Quality bar (non-negotiable)

All changes must meet:

1. **Tests**: 494 tests across 43 files must stay green. New behavior = new tests in the same commit.
2. **Strict TDD**: in SDD apply phases, tests land in the same commit as the behavior. No "tests to follow".
3. **SOLID + no technical debt**: do not defer cleanup. If you touch a file, leave it cleaner.
4. **No doc-block comments** at the top of files describing what they do. Let names speak.
5. **Conventional Commits**: `feat`, `fix`, `test`, `chore`, `docs`, `refactor`. No `Co-Authored-By` trailers.
6. **TypeScript strict mode** (`"strict": true`). No `any` casts without explicit justification.
7. **NodeNext module resolution** for backend (`.js` extensions required in imports). `Bundler` for `src/web/`.
8. **No external integrations in the server**. The server has zero adapters for GitHub, Jira, CI, etc.

Quality bar observations are in Engram: search `agentboard quality-bar` and `agentboard SOLID`.

---

## Known deferred items (not in v1)

These were explicitly deferred in the verify report and are not blocking:

- **W1**: MCP spec says 6–8 active tools; implementation exposes 14. A spec amendment PR is needed to reconcile. The implementation is correct per the design document; the spec wording is the artefact that needs updating.
- **W2**: `agent_sees_human_events` config flag — piggyback is always-on currently. Opt-out not yet wired to the config.
- **Phase 3 cross-cutting tests** (e2e lifecycle, token budget guard, GC integration): hardening tests not yet written. 494 unit/integration tests are green. Adding Phase 3 tests does not require touching `src/`.

---

## Conventions

- **Voseo Rioplatense** for any Spanish UX copy in `src/web/src/i18n/`.
- **English-first** copy keys in `src/web/src/i18n/en.ts`. Spanish locale is a drop-in; do not hard-code strings in components.
- **`insertEvent` does not open its own transaction** — it wraps in the caller's transaction. Never call it outside a transaction.
- **`sharedListeners` array** in `src/server/app.ts` is the single instance shared by REST and MCP hooks. Do not instantiate a second broadcaster or materializer.
- **`runStart` vs `runInit`**: `runStart` calls `initDb + seedUserWorkflows`. `runInit` calls `initDb + copyWorkflowTemplate`. They are separate commands with separate responsibilities.
- **Port resolution**: `resolvePort` throws `PortInUseError` on conflict. It never auto-increments the port.

---

## Common gotchas (from Engram)

Detailed observations are in Engram project `agentboard`. The most load-bearing ones:

- `src/domain/task.ts` has a legacy doc-block comment at the top (pre-dates the quality bar rule). It is a known debt item — clean it up if you touch that file.
- `TEMPLATE_WORKFLOW` path in `src/cli/init.ts` is resolved relative to `import.meta.url` to survive install into global `node_modules`.
- `triggered_by` subtasks are deferred at `seedWorkflowSubtasks` time. They are materialized by the event subscriber in `src/events/triggered-materializer.ts`.
- The `_global` sentinel in broadcaster maps to `null` task ID for global broadcasts.

---

## SDD workflow for new changes

```
/sdd-init          → (already done; skip if sdd-init/agentboard exists in Engram)
/sdd-new <change>  → exploration + proposal
/sdd-ff <change>   → proposal → spec → design → tasks
/sdd-apply         → implement (strict TDD)
/sdd-verify        → validate against spec
/sdd-archive       → close
```

Artifact store: `hybrid` (engram + `openspec/` files). Delivery strategy: `auto-chain`.
