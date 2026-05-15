## agentboard — task tracking protocol (ALWAYS ACTIVE)

You have `agentboard.*`, `task.*`, `subtask.*`, `feedback.*`, and `external.*`
MCP tools (the local board exposed by `@jobshimo/agentboard`). The board is the
state machine of your work on this repo. The human sees every move in their
browser in real time. Treat it as ground truth, not as bookkeeping.

### WHEN TO CALL the board (English or Spanish)

User asks you to do anything that takes more than one turn:
- "fix the login bug" / "arreglá el bug del login"
- "add this feature" / "agregame este feature"
- "refactor X to Y" / "refactorá X a Y"
- "go implement what we discussed" / "implementá lo que hablamos"
→ call `task.list` to see what's open. The human seeds tasks in the UI; do not
  invent tasks unprompted.

You finished a unit of work the workflow defines (commit landed, tests pass,
PR opened, CI green):
→ call `subtask.update` to move that subtask to `done`, `failed`, or `blocked`.

You need clarification, decision, or approval from the human:
→ call `agentboard.notify_human` with the right urgency (`info`, `warning`,
  `blocked`). Wait for them via `agentboard.wait_for_event` if blocked.

You want to know if the human commented while you were thinking:
→ call `agentboard.poll_events`. The piggyback hook may already have pushed
  events to you; check before polling explicitly.

Task is done, workflow exhausted, no further work expected:
→ call `task.complete`. Then `agentboard.deactivate` if ending the session.

### TOOL CHEAT-SHEET

Read-only:
- `task.list` — list all tasks in this repo. Optional `filter`: `backlog`, `active`, `blocked`, `done`.
- `task.get` — full task detail (discussion, subtasks, refs)
- `feedback.search` — past human feedback by keyword
- `external.fetch` — look up a task by its saved external reference (e.g. `jira:XYZ-123`, `github:org/repo#42`). Returns the cached snapshot the dev recorded on the task. The board never live-fetches; use `gh`, `jira`, or `linear` CLIs if you need current external data.

Action:
- `task.start` — mark a task active; activates the workflow
- `task.complete` — close a finished task
- `task.comment` — add markdown to the discussion thread
- `task.add_custom_subtask` — append a custom subtask (cannot edit existing)
- `subtask.update` — change a subtask's state
- `feedback.add` — record a learning the next session should see
- `agentboard.notify_human` — surface attention to the human
- `agentboard.poll_events` / `agentboard.wait_for_event` — sync with human input
- `agentboard.deactivate` — end your MCP session cleanly

### CONVENTIONS — hard rules

- **Subtask states are exactly six**: `pending`, `in-progress`, `done`,
  `blocked`, `failed`, `skipped`. Do not invent more.
- **Workflow snapshot is immutable** per task. You cannot edit the steps. You
  can only add `custom: true` subtasks via `task.add_custom_subtask`.
- **Discussion is markdown**. The human reads the full thread; never assume
  they only see your last message.
- **Tasks are per-repo**. They live in `<repo>/.agentboard/db.sqlite`. The
  active repo is in your environment as `AGENTBOARD_REPO`.

### NEVER

- Move a subtask to `done` before its verification step is real.
- Mark a task `complete` while subtasks are still `in-progress` or `pending`.
- Edit, hide, or rewrite human messages in the discussion.
- Use the board to store conversation notes that are not task state.
