# BRIEF-DESIGN.md — Scope contract for the design phase

> You are the design agent for this project. This file is a **scope contract**.
> Read it in full before producing anything. If something is not covered here,
> ask the project owner — do not invent.
>
> The authoritative product spec is `DESIGN.md` in the root of this same repo.
> Read `DESIGN.md` for the **why** and **what the product is**. This file tells
> you **what to draw, and what to NOT touch**.

---

## 0. Relationship to `DESIGN.md`

- `DESIGN.md` is the source of truth for the product. It covers architecture, storage, MCP, event queue, token economics. You will read it for context.
- `DESIGN.md` is **read-only for you**. Do not propose changes to architecture, storage model, MCP surface, event queue, or any non-UI concern. If something there blocks your design work, raise it as an **open question** in your deliverable — do not silently redesign it.
- This file (`BRIEF-DESIGN.md`) is the only thing you are expected to act on.

---

## 1. Your job

Design **v1** of two surfaces:

1. **Console / CLI** — the `npx @jobshimo/agentboard` launcher and its commands and flags.
2. **Web UI** — the Kanban-style board, task detail, discussion, and global chrome.

This is v1. The console will grow commands over time, and the UI will grow features. Design choices should anticipate growth, not just cover today's scope.

You produce **mockups, component inventory, and command transcripts**. You do **not** produce code.

---

## 2. Surface 1 — Console / CLI

### 2.1 Required entry point

```
$ npx @jobshimo/agentboard
▸ agentboard running at http://localhost:7733
▸ MCP endpoint:    http://localhost:7733/mcp
▸ opening browser…
```

The console is a **launcher**, not a TUI. No interactive menus, no curses. It prints, then opens the browser.

### 2.2 Commands and flags to design

Cover at minimum:

- Default (no subcommand): start server + open browser.
- `agentboard init` — copy a workflow template from `~/.agentboard/workflows/` into `<repo>/.agentboard/`.
- `agentboard export` — dump current board state to `.agentboard/snapshot/` as a tree of `.md` files.
- `--port <n>` — override the default port.
- `--no-open` — start server without opening browser.
- `--help` / `--version`.

For each, design:

- The expected stdout (text, layout, colors if any).
- The error variants (port in use, repo not initialized, snapshot dir missing).
- The first-run experience (no `.agentboard/` exists yet — what happens?).

### 2.3 Constraints on the CLI

- Plain text, no emojis (the user's global rule).
- ASCII-safe; works on Windows PowerShell and macOS/Linux terminals.
- Color is OK but must degrade cleanly when `NO_COLOR=1` or piped.
- One-line outputs preferred. Multi-line only when genuinely needed.

---

## 3. Surface 2 — Web UI

Served at `http://localhost:7733`. Single-page app. Desktop browser only for v1.

### 3.1 Views to design

- **Board view** — entry point. Kanban-style. Lists all tasks for this repo.
- **Task detail view** — opened from a card. Shows discussion, subtasks, workflow snapshot, external ref (if any), human controls.
- **Workflow list / settings** — global, lightweight. Lists known workflows and current config.
- **Global chrome** — header, notification area, connection status, settings entry.

### 3.2 Board view — key design questions

- **What are the columns?** Two reasonable options — pick one and justify:
  - **A.** Columns = task macro-status (`Backlog`, `Active`, `Blocked`, `Done`).
  - **B.** Columns = current workflow step (`Implementing`, `Tests`, `Open PR`, `CI`, `Review`, `Merge`).
- **Per card, show:** title, origin (referenced vs local), workflow type, current subtask + its state, blocked/failed badges, last-activity timestamp.
- **Realtime motion:** when the agent moves a card or changes a subtask state, it animates in the UI. The user must see it without refreshing.

### 3.3 Task detail view — required elements

- **Discussion** — markdown thread. Authors are `human`, `agent`, or `system`. Renders markdown; edits in markdown. The human always sees the full thread (no truncation on the human side).
- **Subtask list** — each subtask shows its `type`, `status`, and optional note/artifact link (commit SHA, PR URL, CI run ID).
- **Workflow snapshot** — visible and immutable. The user must understand they cannot edit the steps of an in-flight task; they can only add **custom** subtasks.
- **Custom subtask indicator** — subtasks with `custom: true` need a clear visual mark (badge, icon, color).
- **External ref display** — when a task references `jira:XYZ-123` or `github:org/repo#42`, render a chip with the ref. Clicking it follows the link.
- **Human controls** — comment box, change subtask state (drag-drop or buttons), add custom subtask, close task. Realtime feedback button (per §10 of `DESIGN.md`).

### 3.4 Global chrome

- **Notification badge** — for events sent via `agentboard.notify_human` (urgency-aware: info / warning / blocked).
- **Connection status indicator** — server reachable, WebSocket connected. Visible but quiet.
- **Settings entry** — opens the workflows / config view.

---

## 4. Hard constraints (non-negotiable)

These come from `DESIGN.md`. Violating any of them is a design bug, not a creative choice.

1. **Exactly six subtask states**: `pending`, `in-progress`, `done`, `blocked`, `failed`, `skipped`. Do not invent more. The visual language must distinguish all six clearly and consistently.
2. **Subtasks are minimal**: state + type + optional note. **No required free-text body on a subtask.** Discussion lives on the parent task.
3. **Workflow snapshot is immutable** per task. UI must communicate this — you can only add custom subtasks, never edit existing ones.
4. **Single-user, local-first.** No user avatars, no profiles, no team picker. The two parties on screen are `human` and `agent` (plus `system`).
5. **No auth UI.** No login, no account screen, no permissions.
6. **No mobile** for v1. Desktop browser only.
7. **Realtime via WebSocket.** When the agent acts, the UI reflects it immediately. Spinners and "refresh" buttons are anti-patterns here — they signal the WS is doing nothing.
8. **Discussion is markdown.** Render as markdown; edit in markdown. No rich-text WYSIWYG.
9. **Dark and light mode** both required. Devs use both.
10. **English-first**, structured so a Spanish locale can be added later. No hard-coded copy in components.

---

## 5. Out of scope — do not design

You will encounter mentions of these in `DESIGN.md`. They are **not yours**:

- SQLite schema, storage layout, migrations.
- MCP tool surface, activation protocol, configuration.
- Event queue, FIFO ordering, garbage collection.
- External integrations (GitHub, Jira, Linear) — the UI **shows** the ref; the integration logic is the agent's job, not yours.
- Auth, user accounts, multi-user collaboration.
- Mobile / responsive beyond what comes for free.
- i18n machinery beyond keeping copy externalized.
- Backend stack choice (Node version, framework, SQLite driver, MCP transport).

If you find yourself touching any of these, **stop**. Surface it as an open question and move on.

---

## 6. Voice and aesthetic

- This is a **dev tool that runs locally**. It should feel like a CLI's well-designed GUI cousin — not like a SaaS dashboard, not like Jira.
- Density over whitespace. Recognition over recall. Keyboard-friendly.
- Animations are **subtle**. The realtime push is the product magic; let it speak through small, smooth transitions, not flashy ones.
- Typography: monospace for code, refs, commit SHAs, paths. Sans for prose and UI chrome.
- Reference points (designer's call, not required): Linear (density), Raycast (economy), GitHub Issues (clarity).

---

## 7. Deliverables expected

Produce in this order:

1. **Open questions list** — anything in this brief or `DESIGN.md` that you cannot resolve as a designer. Hand back to the project owner before producing mockups for those areas.
2. **Components inventory** — the reusable building blocks you will use (e.g. `TaskCard`, `SubtaskRow`, `DiscussionThread`, `ExternalRefChip`, `WorkflowStepBadge`). One line each, what they show and where they appear.
3. **Mockups** — Figma, Excalidraw, or high-detail ASCII. Cover: board view, task detail view, empty state, blocked state, settings.
4. **CLI transcripts** — for each command in §2.2, a sample stdout (success + error variants).

Do not produce code. Implementation happens after design is approved.

---

## 8. Iteration expectations

- This is v1. Expect the console to grow commands and the UI to grow features.
- Pick a layout that scales (sidebar holds more entries cleanly; top nav does not).
- Pick a component model that composes (`TaskCard` reused in board, in search results, in linked-task previews — don't fork the design for each context).
- Naming should be stable: once `SubtaskRow` is named, it stays `SubtaskRow`.

---

## 9. How to use this file

1. Read `DESIGN.md` in full for context.
2. Read this file in full for scope.
3. List the open questions. Send them to the project owner. Wait.
4. Once unblocked, produce the components inventory.
5. Then the mockups and the CLI transcripts.
6. Hand back. Do not edit `DESIGN.md`.
