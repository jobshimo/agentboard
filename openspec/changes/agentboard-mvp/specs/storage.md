# Storage and Persistence Specification

## Purpose

Defines the canonical data store, per-repo isolation, derived views, snapshot export, and write-safety guarantees for `agentboard`.

---

## Requirements

### Requirement: SQLite as Canonical Store

The system MUST use a single SQLite database at `<repo>/.agentboard/db.sqlite` as the one authoritative source of truth for all task, subtask, workflow snapshot, event, and session data.

No other file format is canonical. Markdown and JSON exports are derived views only.

#### Scenario: Server starts with no existing database

- GIVEN a repo with no `.agentboard/` directory
- WHEN the server starts for the first time in that repo
- THEN the server MUST create `.agentboard/db.sqlite` and apply all migrations before accepting any request

#### Scenario: Server starts with an existing database

- GIVEN a repo with an existing `.agentboard/db.sqlite`
- WHEN the server starts
- THEN the server MUST apply any pending migrations and then proceed normally without data loss

---

### Requirement: Per-Repo Isolation

Each repo MUST have its own `.agentboard/db.sqlite`. Data from one repo MUST NOT be readable or writable by a server instance started in a different repo.

#### Scenario: Two repos running concurrently

- GIVEN repo A at `/projects/foo` and repo B at `/projects/bar`, each with their own `.agentboard/db.sqlite`
- WHEN two server instances are started independently (one per repo)
- THEN data written in repo A MUST NOT appear in repo B and vice versa

---

### Requirement: Markdown as Derived View

The system MUST expose a `GET /api/tasks/:id/markdown` endpoint that renders a task (discussion + subtask list) as a `.md` file on demand.

Markdown is NEVER a source of truth. It MUST be generated from the database at request time.

#### Scenario: Client requests markdown for an existing task

- GIVEN a task with id `T1` that has a discussion and three subtasks
- WHEN a client calls `GET /api/tasks/T1/markdown`
- THEN the response MUST be a valid Markdown document containing the task title, discussion thread, and subtask list with their current states

#### Scenario: Client requests markdown for a non-existent task

- GIVEN no task with id `T99` exists in the database
- WHEN a client calls `GET /api/tasks/T99/markdown`
- THEN the server MUST return HTTP 404

---

### Requirement: Export Snapshot

The system MUST support an `agentboard export` command that dumps the current board state to `.agentboard/snapshot/` as a tree of `.md` files.

`db.sqlite` MUST be listed in `.gitignore`. The snapshot directory is the git-committable artifact.

#### Scenario: Export on a populated board

- GIVEN a board with two tasks (T1 referenced, T2 local), each with subtasks
- WHEN the user runs `agentboard export`
- THEN `.agentboard/snapshot/` MUST contain one `.md` file per task, each reflecting current state
- AND existing snapshot files MUST be overwritten, not appended

#### Scenario: Export on an empty board

- GIVEN a board with no tasks
- WHEN the user runs `agentboard export`
- THEN `.agentboard/snapshot/` MUST be created (or emptied) and the command MUST exit successfully with zero files written

---

### Requirement: WAL-Safe Concurrent Writes

The server MUST enable SQLite WAL (Write-Ahead Logging) mode on startup. Concurrent writes from the agent (via MCP) and the UI (via REST/WS) MUST NOT corrupt data or produce deadlocks under normal operating conditions.

#### Scenario: Simultaneous agent write and UI write

- GIVEN the server is running with WAL mode enabled
- WHEN the agent calls `subtask.update` at the same time as the user adds a comment in the UI
- THEN both writes MUST complete successfully and the database MUST reflect both changes

#### Scenario: Server crash during write

- GIVEN the server is mid-write when it crashes
- WHEN the server restarts
- THEN SQLite WAL recovery MUST restore the database to the last committed transaction without data corruption
