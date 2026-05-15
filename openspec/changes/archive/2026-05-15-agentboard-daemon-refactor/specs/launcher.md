# Delta Spec: Launcher and Distribution

Delta against `openspec/specs/launcher.md`

---

## Changes Summary

### Added
- Subcommand `agentboard mcp` — STDIO MCP entry point (ephemeral, per-session).
- Subcommand `agentboard daemon` — explicit alias for the default no-subcommand daemon spawn.
- Subcommand `agentboard stop` — sends SIGTERM to the running daemon; idempotent.
- Subcommand `agentboard status` — prints daemon state, exits non-zero if not running.
- Flag `--repo <path>` on `agentboard mcp` — overrides `AGENTBOARD_REPO`; env var wins.
- Idempotent spawn protocol for the default no-subcommand path: probe `/api/health` before binding.

### Modified
- Default no-subcommand behavior: changed from "start a per-cwd server" to "idempotent daemon spawn + open browser to active repo".
- "Port already in use" behavior: changed from hard error to identity probe; error only if the occupant is NOT an agentboard daemon.

### Removed
- Implicit `cwd` binding on server start — the server no longer captures `process.cwd()` at startup to scope its database.
- The MCP HTTP/SSE endpoint is no longer part of the daemon surface (moved to `agentboard mcp` STDIO subcommand).

### Unchanged
- `agentboard init` subcommand.
- `agentboard export` subcommand.
- `--port`, `--no-open`, `--help`, `--version` flags.
- "Console is a launcher, not a TUI" requirement.

Cross-references: `daemon.md` (spawn protocol, PID file, registry), `mcp-surface.md` (STDIO transport, repo resolution), `storage.md` (per-request DB injection).

---

## Requirements

### REQ-L-01: Default Command — Idempotent Daemon Spawn

Running `npx @jobshimo/agentboard` (or `agentboard daemon`) with no additional arguments MUST perform an idempotent daemon spawn:

1. Probe `GET http://127.0.0.1:7733/api/health` with a 500ms timeout.
2. If the probe succeeds and the response body contains `{ "ok": true }`, the daemon is already running. The command MUST open the default browser to `http://127.0.0.1:7733` with the current repo as the active repo (via `?repo=<encoded-abs-cwd>`), print a message indicating the daemon is already running, and exit zero.
3. If the probe fails (connection refused, timeout, or non-agentboard response), bind a new daemon on `:7733`, create `.agentboard/db.sqlite` for the current repo if absent, apply migrations, write `~/.agentboard/daemon.pid`, open the browser, and block until SIGINT or SIGTERM.

The command MUST NOT start a second daemon if one is already running, regardless of which directory the second invocation originates from.

#### Scenario: Daemon already running — user runs from a new repo

- GIVEN the daemon is running on port 7733
- AND the user opens a new terminal in `/projects/bar`
- WHEN the user runs `npx @jobshimo/agentboard`
- THEN the command MUST NOT bind a new server
- AND the browser MUST open to `http://127.0.0.1:7733?repo=%2Fprojects%2Fbar`
- AND the command MUST exit zero after opening the browser

#### Scenario: First invocation — no daemon running

- GIVEN no process is bound to port 7733
- WHEN the user runs `npx @jobshimo/agentboard` from `/projects/foo`
- THEN a daemon MUST start on port 7733
- AND `~/.agentboard/daemon.pid` MUST be written with the daemon's PID
- AND the browser MUST open to `http://127.0.0.1:7733?repo=%2Fprojects%2Ffoo`
- AND the process MUST block until SIGINT or SIGTERM

#### Scenario: Port 7733 occupied by a non-agentboard process

- GIVEN a process that is NOT an agentboard daemon is bound to port 7733
- WHEN the user runs `npx @jobshimo/agentboard`
- THEN the health probe MUST return a non-agentboard response (missing `{ "ok": true }`)
- AND the command MUST exit with a non-zero code and print an error indicating port 7733 is occupied by an unknown process
- AND the command MUST suggest using `--port` to select an alternate port

#### Scenario: First-run — no `.agentboard/` directory in current repo

- GIVEN a repo with no `.agentboard/` directory
- WHEN the daemon starts and receives its first request scoped to that repo
- THEN the daemon MUST create `<repo>/.agentboard/db.sqlite` and apply all migrations before responding
- AND the daemon MUST NOT fail; per-repo initialization is automatic and on-demand

---

### REQ-L-02: `agentboard daemon` Subcommand

`agentboard daemon` MUST behave identically to `agentboard` with no subcommand (see REQ-L-01). It is a named alias for explicit clarity in scripts and documentation.

#### Scenario: Explicit daemon subcommand

- GIVEN no daemon is running
- WHEN the user runs `agentboard daemon`
- THEN the behavior MUST be identical to running `agentboard` with no subcommand

---

### REQ-L-03: `agentboard mcp` Subcommand

`agentboard mcp` MUST start an MCP server over STDIO (stdin/stdout). It MUST block until stdin closes or the process receives SIGTERM/SIGINT. It MUST NOT start a Fastify server, bind a TCP port, or open a browser.

Repo resolution for `agentboard mcp` follows this precedence (highest to lowest):

1. `AGENTBOARD_REPO` environment variable — absolute path to the repo root.
2. `--repo <path>` CLI flag — absolute or relative path resolved against `process.cwd()`.
3. Neither set — hard error: print an error message to stderr and exit with a non-zero code. The process MUST NOT fall back to `process.cwd()` silently.

The environment variable wins over the flag. When both are set, `AGENTBOARD_REPO` is used and the `--repo` flag is silently ignored.

The STDIO process MUST mint a UUID session ID at startup. This ID is used in place of the SDK's `extra.sessionId` (which is `undefined` over STDIO) to identify the agent session in the database. See `mcp-surface.md` delta for the session ID protocol.

#### Scenario: Launched by MCP client with `AGENTBOARD_REPO` set

- GIVEN the MCP client config sets `env: { AGENTBOARD_REPO: "/projects/foo" }`
- WHEN the MCP client starts `agentboard mcp`
- THEN the process MUST resolve the repo as `/projects/foo`
- AND MUST open `.agentboard/db.sqlite` under that path
- AND MUST serve MCP tools scoped to that repo

#### Scenario: Launched with `--repo` flag, no env var

- GIVEN no `AGENTBOARD_REPO` environment variable is set
- AND the user runs `agentboard mcp --repo /projects/bar`
- THEN the process MUST resolve the repo as `/projects/bar`

#### Scenario: Both `AGENTBOARD_REPO` and `--repo` set

- GIVEN `AGENTBOARD_REPO=/projects/foo` is set
- AND the user runs `agentboard mcp --repo /projects/bar`
- THEN the process MUST use `/projects/foo` (env var wins)
- AND the `--repo` flag value MUST be silently ignored

#### Scenario: Neither env var nor flag set

- GIVEN no `AGENTBOARD_REPO` is set and `agentboard mcp` is run without `--repo`
- WHEN the process starts
- THEN it MUST print an error to stderr: repo is required (either `AGENTBOARD_REPO` env var or `--repo` flag)
- AND MUST exit with a non-zero code before initializing any MCP transport

#### Scenario: Repo path does not exist

- GIVEN `AGENTBOARD_REPO=/projects/nonexistent` is set
- WHEN `agentboard mcp` starts
- THEN the process MUST print an error to stderr indicating the repo path does not exist or is not accessible
- AND MUST exit with a non-zero code

#### Scenario: `agentboard mcp` does not start a web server

- GIVEN `agentboard mcp` is running
- WHEN any process attempts to connect to port 7733
- THEN no connection MUST be accepted by the `agentboard mcp` process; port 7733 is the daemon's port only

---

### REQ-L-04: `agentboard stop` Subcommand

`agentboard stop` MUST attempt a graceful shutdown of a running daemon. If no daemon is running, the command MUST exit zero with an informative message (idempotent). If a daemon is running, the command MUST send it a termination signal and wait up to 3 seconds for the process to exit before reporting success or timeout.

#### Scenario: Daemon is running

- GIVEN the daemon is running with PID recorded in `~/.agentboard/daemon.pid`
- WHEN the user runs `agentboard stop`
- THEN the command MUST signal the daemon to shut down
- AND MUST wait up to 3 seconds for the daemon to exit
- AND MUST exit zero if the daemon exits within the timeout
- AND MUST print a confirmation message

#### Scenario: Daemon is not running

- GIVEN no daemon is running (PID file absent or stale)
- WHEN the user runs `agentboard stop`
- THEN the command MUST print a message indicating no daemon is running
- AND MUST exit zero (idempotent)

#### Scenario: Stale PID file

- GIVEN `~/.agentboard/daemon.pid` contains a PID that no longer refers to a running process
- WHEN the user runs `agentboard stop`
- THEN the command MUST detect the stale PID (by probing the process or the health endpoint)
- AND MUST remove the stale PID file
- AND MUST exit zero with a message indicating no daemon was found

---

### REQ-L-05: `agentboard status` Subcommand

`agentboard status` MUST report the current daemon state to stdout and exit with code 0 if running, non-zero if not running. The output MUST include:

- Running / not running.
- Port (if running).
- PID (if running).
- List of known repos (paths) from `~/.agentboard/daemon.json` (if running).

#### Scenario: Daemon is running

- GIVEN the daemon is running on port 7733 with two known repos
- WHEN the user runs `agentboard status`
- THEN stdout MUST include the word "running", the port number, the PID, and the two repo paths
- AND the command MUST exit zero

#### Scenario: Daemon is not running

- GIVEN no daemon is running
- WHEN the user runs `agentboard status`
- THEN stdout MUST indicate the daemon is not running
- AND the command MUST exit with a non-zero code

---

### REQ-L-06: `--repo` Flag on `agentboard mcp`

The `--repo <path>` flag MUST be accepted by `agentboard mcp`. It MUST be ignored by `agentboard`, `agentboard daemon`, `agentboard stop`, and `agentboard status`. Passing `--repo` to those commands MUST produce an error message and exit non-zero.

#### Scenario: `--repo` passed to daemon subcommand

- GIVEN the user runs `agentboard daemon --repo /projects/foo`
- WHEN the command parses arguments
- THEN the command MUST print an error indicating `--repo` is not valid for the `daemon` subcommand
- AND MUST exit non-zero

---

## Open Questions

None.
