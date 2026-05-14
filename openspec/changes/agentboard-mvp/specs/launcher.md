# Launcher and Distribution Specification

## Purpose

Defines the behavior of `npx @jobshimo/agentboard` as a launcher (not a TUI), its subcommands, flags, first-run experience, and distribution contract.

Note: stdout text, color, and error message formatting are delegated to the external design agent (BRIEF-DESIGN.md §2). This spec defines the behavioral contract only.

---

## Requirements

### Requirement: Default Command — Start Server and Open Browser

Running `npx @jobshimo/agentboard` with no subcommand MUST start the HTTP server and open the default browser to the board URL. The console MUST NOT become an interactive TUI.

#### Scenario: First-run with no `.agentboard/` directory

- GIVEN a repo with no `.agentboard/` directory
- WHEN the user runs `npx @jobshimo/agentboard`
- THEN the server MUST create `.agentboard/db.sqlite`, apply migrations, print the server and MCP endpoint URLs to stdout, and open the browser
- AND the command MUST NOT fail; first-run initialization is automatic

#### Scenario: Normal start

- GIVEN a repo with an existing `.agentboard/db.sqlite`
- WHEN the user runs `npx @jobshimo/agentboard`
- THEN the server MUST start, print the server URL and MCP endpoint URL to stdout, and open the browser

#### Scenario: Port already in use

- GIVEN another process is bound to the default port
- WHEN the user runs `npx @jobshimo/agentboard`
- THEN the command MUST exit with a non-zero code and MUST print an error message that includes the occupied port number and suggests using `--port`

---

### Requirement: `agentboard init` Subcommand

`agentboard init` MUST copy a selected workflow template from `~/.agentboard/workflows/` into `<repo>/.agentboard/workflow.yaml`. It MUST NOT perform a merge — the copy is verbatim.

If no global workflows directory exists, the command MUST print an error and exit non-zero.

#### Scenario: Init with available global workflows

- GIVEN `~/.agentboard/workflows/feature.yaml` exists
- WHEN the user runs `agentboard init` in a repo
- THEN `<repo>/.agentboard/workflow.yaml` MUST be created as a verbatim copy of the selected global template
- AND the command MUST exit zero

#### Scenario: Init with no global workflows

- GIVEN `~/.agentboard/workflows/` does not exist or is empty
- WHEN the user runs `agentboard init`
- THEN the command MUST print an error indicating no workflows are available and MUST exit non-zero

#### Scenario: Existing repo workflow file

- GIVEN `<repo>/.agentboard/workflow.yaml` already exists
- WHEN the user runs `agentboard init`
- THEN the command MUST either prompt for confirmation before overwriting OR refuse with an informative message; it MUST NOT silently overwrite

---

### Requirement: `agentboard export` Subcommand

`agentboard export` MUST dump the current board state to `.agentboard/snapshot/` as a tree of `.md` files, one per task. It MUST overwrite existing snapshot files.

#### Scenario: Successful export

- GIVEN a board with tasks T1 and T2
- WHEN the user runs `agentboard export`
- THEN `.agentboard/snapshot/` MUST contain exactly one `.md` file per task reflecting current state
- AND the command MUST exit zero and print the output path

#### Scenario: Export on uninitialized repo

- GIVEN no `.agentboard/db.sqlite` exists
- WHEN the user runs `agentboard export`
- THEN the command MUST print an error indicating the board is not initialized and MUST exit non-zero

---

### Requirement: `--port` Flag

The `--port <n>` flag MUST override the default server port. Applies to the default start command.

#### Scenario: Custom port used

- GIVEN the user runs `npx @jobshimo/agentboard --port 8080`
- WHEN the server starts
- THEN it MUST bind to port 8080 and print the correct URLs reflecting that port

---

### Requirement: `--no-open` Flag

The `--no-open` flag MUST suppress the automatic browser launch. The server MUST still start and print its URLs.

#### Scenario: Server starts without opening browser

- GIVEN the user runs `npx @jobshimo/agentboard --no-open`
- WHEN the server starts
- THEN the browser MUST NOT be opened and the server URLs MUST be printed to stdout

---

### Requirement: `--help` and `--version` Flags

`--help` MUST print a usage summary to stdout and exit zero.
`--version` MUST print the current package version to stdout and exit zero.

#### Scenario: `--help` output

- GIVEN any invocation with `--help`
- WHEN the command runs
- THEN a usage summary MUST be printed listing available subcommands and flags, and the process MUST exit zero

#### Scenario: `--version` output

- GIVEN any invocation with `--version`
- WHEN the command runs
- THEN the version string (e.g. `1.0.0`) MUST be printed and the process MUST exit zero

---

### Requirement: Console Is a Launcher, Not a TUI

The console MUST NOT present interactive menus, prompts, or a curses/TUI interface after startup. All human interaction with the board happens in the web browser. All agent interaction happens via MCP.

Stdout output after server start MUST be minimal: server URL, MCP endpoint URL, and any critical error messages only.

#### Scenario: No interactive prompt after start

- GIVEN the server started successfully
- WHEN the user's terminal is in the foreground
- THEN the terminal MUST show the startup output and wait (blocking for SIGINT) with no interactive prompt
