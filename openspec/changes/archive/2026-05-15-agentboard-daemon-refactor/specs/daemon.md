# Spec: Daemon Capability

NEW capability spec — no prior baseline. Complements `openspec/specs/launcher.md`.

---

## Purpose

Defines the global HTTP daemon's lifecycle, repo registry, spawn protocol, inter-process notification endpoint, PID file, and cross-platform behavior.

Cross-references: `launcher.md` delta (REQ-L-01, REQ-L-02, REQ-L-04, REQ-L-05), `storage.md` delta (REQ-S-01 through REQ-S-05), `mcp-surface.md` delta (REQ-M-04), `realtime-ui.md` delta (REQ-R-04, REQ-R-05).

---

## Requirements

### REQ-D-01: Daemon Identity and Port

There MUST be at most one agentboard daemon running per machine at any time. The daemon MUST bind to port `7733` by default. The default port MUST be overridable by the `--port <n>` flag or the `AGENTBOARD_PORT` environment variable, with the flag taking precedence over the environment variable.

The daemon identifies itself by returning `{ "ok": true }` from `GET /api/health`. Any process occupying the configured port that does not return this response MUST be treated as a foreign process, and the daemon MUST fail to start with a descriptive error.

#### Scenario: Identity probe succeeds

- GIVEN an agentboard daemon is running on port 7733
- WHEN any client (including another `agentboard` invocation) calls `GET http://127.0.0.1:7733/api/health`
- THEN the response MUST be HTTP 200 with body `{ "ok": true }`

#### Scenario: Foreign process on port 7733

- GIVEN a non-agentboard process occupies port 7733
- AND `GET http://127.0.0.1:7733/api/health` does not return `{ "ok": true }`
- WHEN the user runs `npx @jobshimo/agentboard`
- THEN the daemon MUST NOT start
- AND the command MUST exit non-zero with an error describing the port conflict

---

### REQ-D-02: Daemon Lifecycle

The daemon process MUST:

1. On startup:
   a. Probe port (REQ-L-01 idempotent spawn protocol).
   b. Bind HTTP + WebSocket on the configured port.
   c. Write `~/.agentboard/daemon.pid` containing the process PID (integer, newline-terminated).
   d. Read `~/.agentboard/daemon.json`; populate the in-memory repo registry.
   e. Register SIGTERM and SIGINT handlers (see shutdown below).

2. During operation:
   a. Serve REST, WebSocket, and SPA static files.
   b. Serve `POST /internal/notify` bound to `127.0.0.1` only.
   c. Serve `GET /api/daemon/repos`.
   d. Maintain the per-repo DB cache (REQ-S-01).
   e. Update and debounce-flush `daemon.json` on new repo access (REQ-S-03).

3. On shutdown (SIGTERM or SIGINT):
   a. Stop accepting new connections.
   b. Complete in-flight requests (grace period: up to 5 seconds).
   c. Close all `Database` instances in the cache (REQ-S-05).
   d. Flush any pending debounced `daemon.json` write immediately (no wait for debounce).
   e. Delete `~/.agentboard/daemon.pid`.
   f. Exit with code 0.

#### Scenario: Daemon starts cleanly

- GIVEN no other process is bound to port 7733
- WHEN `agentboard daemon` starts
- THEN `~/.agentboard/daemon.pid` MUST exist and contain the daemon's PID
- AND `GET /api/health` MUST return `{ "ok": true }` within 2 seconds of startup

#### Scenario: Graceful shutdown

- GIVEN the daemon is running with two open DB connections and one active WS client
- WHEN SIGTERM is received
- THEN the daemon MUST complete in-flight requests (up to 5s grace)
- AND MUST close all DB connections
- AND MUST flush `daemon.json`
- AND MUST delete `daemon.pid`
- AND MUST exit with code 0

#### Scenario: Crash recovery — stale PID file

- GIVEN the daemon crashed without deleting `daemon.pid`
- AND `daemon.pid` contains a PID that no longer refers to a running process
- WHEN the user runs `npx @jobshimo/agentboard`
- THEN the spawn logic MUST detect the stale PID (process does not exist OR health probe fails)
- AND MUST start a new daemon normally
- AND MUST overwrite `daemon.pid` with the new PID

---

### REQ-D-03: PID File

The PID file MUST be located at `~/.agentboard/daemon.pid`. It MUST contain only the integer PID of the daemon process, followed by a newline.

Validity check: a PID file is considered stale if the PID it contains either:
- Does not refer to a running process (verified by probing the process), OR
- Refers to a running process that does NOT respond to `GET /api/health` with `{ "ok": true }`.

Any code that reads the PID file MUST perform the validity check before trusting the PID. Stale PID files MUST be treated as absent (daemon not running).

Cross-platform notes:
- On all platforms (Windows, macOS, Linux), Node.js `process.kill(pid, 0)` returns without error if the PID is live and throws `ESRCH` if the PID is not found.
- On Windows, `process.kill(pid, 0)` does NOT send an actual signal; it is a probe only.
- The health HTTP probe (`GET /api/health`) is the definitive check when the process probe is ambiguous (e.g. the PID was recycled by the OS).

#### Scenario: PID file written at startup

- GIVEN no `daemon.pid` file exists
- WHEN the daemon starts
- THEN `~/.agentboard/daemon.pid` MUST be created with the daemon's integer PID

#### Scenario: PID file deleted on shutdown

- GIVEN the daemon is running and `daemon.pid` exists
- WHEN the daemon exits (SIGTERM, SIGINT, or clean exit)
- THEN `~/.agentboard/daemon.pid` MUST be deleted before the process exits

#### Scenario: PID file not writable

- GIVEN `~/.agentboard/` exists but the user lacks write permission
- WHEN the daemon starts
- THEN the daemon MUST log a warning about the inability to write `daemon.pid`
- AND MUST continue starting normally (PID file is an optimization, not a hard requirement)

---

### REQ-D-04: `GET /api/daemon/repos` Endpoint

Specified fully in `realtime-ui.md` delta REQ-R-05. This entry is a cross-reference anchor.

The endpoint is served by the daemon HTTP process. It reads from the in-memory repo registry (populated from `daemon.json` at startup, updated on new repo access).

---

### REQ-D-05: `POST /internal/notify` Endpoint

Specified fully in `realtime-ui.md` delta REQ-R-04. This entry adds the binding constraint and failure mode from the daemon side.

The endpoint MUST be bound only to `127.0.0.1`. The daemon MUST NOT bind this route on `0.0.0.0` or any public interface.

Implementation note: when using Fastify, this requires either a separate Fastify instance bound to `127.0.0.1`, or a route-level guard that checks `req.socket.remoteAddress === "127.0.0.1"` and returns HTTP 403 otherwise. Either approach satisfies this requirement.

#### Scenario: Notify arrives from loopback

- GIVEN the daemon is running
- WHEN `POST http://127.0.0.1:7733/internal/notify` is called from the same machine
- THEN the daemon MUST process the request

#### Scenario: Notify blocked from non-loopback interface (guard approach)

- GIVEN the daemon is bound to `0.0.0.0` with a guard on `/internal/notify`
- WHEN a request arrives on `/internal/notify` from a non-loopback IP
- THEN the daemon MUST return HTTP 403 and MUST NOT process the payload

---

### REQ-D-06: Cross-Platform Behavior

The daemon MUST function correctly on Windows (Win32), macOS, and Linux without platform-specific code paths in the normal operating path. The following behaviors are platform-sensitive and MUST be handled explicitly:

| Behavior | Windows | macOS / Linux |
|----------|---------|---------------|
| Path normalization | `path.resolve()` + `.toLowerCase()` | `path.resolve()` only |
| Signal handling (SIGTERM) | `process.on("SIGTERM", ...)` works in Node.js on Win32 (since Node 12) | Standard POSIX signals |
| `process.kill(pid, 0)` | Probe-only; does not deliver a signal | Delivers signal 0 (existence check) |
| PID file deletion | Standard `fs.unlinkSync` | Standard `fs.unlinkSync` |
| Port binding | `net.Server.listen(port, "127.0.0.1")` | Same |

The daemon MUST NOT use `child_process.exec("kill ...")` or any shell command for process management. Node.js built-ins (`process.kill`, `process.on`) MUST be used exclusively.

#### Scenario: Daemon runs on Windows with mixed-case repo paths

- GIVEN the daemon is running on Windows
- AND `/internal/notify` receives `{ "repo": "C:\\Projects\\Foo" }`
- AND the DB cache has an entry keyed by `c:\projects\foo`
- WHEN the daemon processes the notification
- THEN it MUST normalize the incoming path to lowercase and find the correct cache entry

---

### REQ-D-07: Failure Modes and Recovery

| Failure | Expected Behavior |
|---------|-------------------|
| Port 7733 occupied by agentboard | Skip bind, open browser (REQ-L-01) |
| Port 7733 occupied by foreign process | Hard error, non-zero exit |
| `daemon.json` missing | Proceed with empty registry; create on first write |
| `daemon.json` malformed | Log warning, proceed with empty registry, overwrite on next write |
| `daemon.pid` stale | Treat as absent; overwrite with new PID |
| DB file missing for repo | Create on first request; never pre-create |
| DB migration fails | Log error and return HTTP 500 for that repo's requests; do not crash daemon |
| `POST /internal/notify` body invalid | Return HTTP 400; do not crash |
| Debounced write fails (disk full, permissions) | Log error; do NOT crash daemon; retry on next write trigger |
| SIGTERM during DB write | Complete write (WAL commits atomically); then shut down |

#### Scenario: DB migration failure for one repo does not affect other repos

- GIVEN the daemon has `/projects/foo` open successfully
- AND `/projects/bar`'s database has a corrupt schema
- WHEN a request arrives for `/projects/bar`
- THEN the daemon MUST return HTTP 500 for that request
- AND requests for `/projects/foo` MUST continue to succeed

#### Scenario: Disk full during registry write

- GIVEN the filesystem is full
- WHEN the daemon's debounce timer fires and tries to write `daemon.json`
- THEN the write MUST fail with a logged error
- AND the daemon MUST continue serving requests normally
- AND MUST retry the write on the next debounce trigger

---

## Open Questions

None.
