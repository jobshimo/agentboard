# Delta Spec: Storage and Persistence

Delta against `openspec/specs/storage.md`

---

## Changes Summary

### Added
- Per-repo DB cache: `Map<string, Db>` in the daemon process, keyed by normalized absolute repo path.
- Path normalization rule: `path.resolve()` + `.toLowerCase()` on Windows.
- Per-request DB injection: daemon reads `?repo=<abs-path>` query parameter and decorates `req.db` and `req.repoRoot` before any route handler runs.
- Missing `?repo` → HTTP 400 rule.
- New file: `~/.agentboard/daemon.json` — repo registry. Schema, read/write semantics, debounce, and recovery behavior specified.
- DB cache eviction on daemon shutdown.
- WAL safety for the two-process model (STDIO MCP + daemon sharing the same file).

### Modified
- "Per-Repo Isolation" requirement: previously described as two independent server instances; now a single daemon serves multiple repos via per-request routing.
- "Server starts with no existing database" scenario: now triggered on first request for a repo, not at daemon startup.

### Removed
- Module-level singleton `_db` — replaced by the per-repo cache map.
- `process.cwd()` as the implicit repo resolution mechanism for REST requests.

### Unchanged
- `<repo>/.agentboard/db.sqlite` location.
- SQLite WAL mode requirement.
- Schema (tables, columns, migrations).
- Markdown derived view endpoint.
- `agentboard export` snapshot command.

Cross-references: `launcher.md` delta (REQ-L-01, per-repo initialization on-demand), `daemon.md` delta (REQ-D-02, DB cache lifecycle), `mcp-surface.md` delta (REQ-M-03, STDIO process DB binding), `realtime-ui.md` delta (REQ-R-01, `?repo=` on all requests).

---

## Requirements

### REQ-S-01: Per-Repo DB Cache (Daemon)

The daemon process MUST maintain an in-memory cache of open `Database` instances, one per distinct repo, implemented as a `Map<string, Db>` keyed by the normalized absolute repo path.

Key normalization MUST be:
- `path.resolve(<raw-path>)` on all platforms.
- Additionally `.toLowerCase()` on Windows (`process.platform === "win32"`).

The same raw path received as different cases on Windows (e.g. `C:\Projects\Foo` and `c:\projects\foo`) MUST map to the same cache entry and therefore the same `Database` instance.

A new cache entry MUST be created on the first request for a repo not yet in the cache. The creation MUST:
1. Ensure `<repo>/.agentboard/` exists (create if absent).
2. Open `<repo>/.agentboard/db.sqlite` in WAL mode.
3. Apply any pending migrations.
4. Store the instance in the cache under the normalized key.

Cache entries MUST remain open until the daemon shuts down. There is no idle eviction in v1.

#### Scenario: First request for a repo not yet in cache

- GIVEN the daemon is running with an empty DB cache
- AND a request arrives with `?repo=/projects/foo`
- WHEN the daemon processes the `onRequest` hook
- THEN it MUST create `/projects/foo/.agentboard/db.sqlite` if absent
- AND open and cache the `Database` instance
- AND decorate `req.db` with that instance

#### Scenario: Subsequent request for the same repo

- GIVEN `/projects/foo` is already in the DB cache
- WHEN a second request arrives with `?repo=/projects/foo`
- THEN the daemon MUST return the cached `Database` instance
- AND MUST NOT open a new connection to the file

#### Scenario: Windows path case normalization

- GIVEN the daemon is running on Windows
- AND one request arrives with `?repo=C:\Projects\Foo`
- AND a later request arrives with `?repo=c:\projects\foo`
- THEN both requests MUST resolve to the same cache entry
- AND only one `Database` instance MUST exist for that repo

#### Scenario: Two distinct repos in cache simultaneously

- GIVEN requests for `/projects/foo` and `/projects/bar` have been served
- WHEN a request for `/projects/foo` arrives
- THEN the daemon MUST return the `foo` `Database` instance, not the `bar` instance
- AND both instances MUST coexist in the cache without interference

---

### REQ-S-02: Per-Request DB Injection

The daemon MUST inspect every incoming HTTP request for the `repo` query parameter before any route handler executes. This MUST be implemented as a request lifecycle hook (e.g. Fastify `onRequest`).

Behavior:

- If `?repo=<path>` is present and valid: resolve and normalize the path, look up or create the cache entry, decorate `req.db` and `req.repoRoot` with the resolved values.
- If `?repo` is absent: return HTTP 400 with a body indicating the `repo` parameter is required.
- If `?repo` is present but the path does not exist on the filesystem: return HTTP 400 with a body indicating the repo path is invalid.

Internal endpoints (e.g. `POST /internal/notify`) are exempt from this requirement and MUST NOT require `?repo` in their query string. Internal endpoints resolve the repo from their request body.

#### Scenario: Request without `?repo`

- GIVEN a client calls `GET /api/tasks` without a `?repo=` parameter
- WHEN the daemon's `onRequest` hook runs
- THEN the daemon MUST return HTTP 400
- AND the response body MUST indicate that the `repo` parameter is missing

#### Scenario: Request with valid `?repo`

- GIVEN a client calls `GET /api/tasks?repo=%2Fprojects%2Ffoo`
- WHEN the daemon's `onRequest` hook runs
- THEN `req.db` MUST be set to the `Database` instance for `/projects/foo`
- AND `req.repoRoot` MUST be set to `/projects/foo`
- AND the route handler MUST use `req.db` exclusively (no `process.cwd()` access)

#### Scenario: Route handler accesses correct repo DB

- GIVEN `/projects/foo` and `/projects/bar` both have tasks
- WHEN a client calls `GET /api/tasks?repo=%2Fprojects%2Ffoo`
- THEN the response MUST contain only tasks from `/projects/foo`'s database
- AND tasks from `/projects/bar` MUST NOT appear in the response

---

### REQ-S-03: Repo Registry File (`~/.agentboard/daemon.json`)

The daemon MUST maintain a registry of known repos at `~/.agentboard/daemon.json`.

Schema (normative):

```json
{
  "repos": [
    {
      "path": "/absolute/normalized/path/to/repo",
      "lastSeenAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

Read semantics:
- The daemon MUST attempt to read `daemon.json` at startup.
- If the file is absent: treat as an empty registry (`{ "repos": [] }`); do not error.
- If the file is present but malformed (invalid JSON or missing `repos` array): treat as an empty registry, log a warning, and overwrite the file with a valid empty registry on the next write.

Write semantics:
- Whenever a new repo is first accessed (i.e. a new cache entry is created in REQ-S-01), the daemon MUST update `daemon.json` to include that repo.
- If a repo's entry already exists, the daemon MUST update its `lastSeenAt` timestamp.
- Writes MUST be debounced: the daemon MUST wait at least 500ms after the last repo access before flushing to disk, to avoid thrashing when multiple repos are accessed in quick succession.
- Writes MUST be atomic: write to a temp file in the same directory and rename to `daemon.json` to prevent partial-write corruption.

Eviction: repos are never removed from `daemon.json` automatically. The registry grows monotonically. `agentboard stop` MUST NOT delete `daemon.json`.

#### Scenario: Daemon starts with no registry file

- GIVEN `~/.agentboard/daemon.json` does not exist
- WHEN the daemon starts
- THEN the daemon MUST proceed with an empty registry
- AND MUST NOT exit or error due to the missing file

#### Scenario: New repo accessed — registry updated

- GIVEN the daemon is running with no repos in memory
- WHEN a request arrives for `/projects/foo` for the first time
- THEN within 500ms + debounce window, `~/.agentboard/daemon.json` MUST be updated to include `{ "path": "/projects/foo", "lastSeenAt": "<iso-timestamp>" }`

#### Scenario: Same repo accessed again — `lastSeenAt` updated

- GIVEN `/projects/foo` is already in `daemon.json`
- WHEN a new request for `/projects/foo` arrives
- THEN `daemon.json` MUST be updated with a newer `lastSeenAt` for `/projects/foo`
- AND no duplicate entry for `/projects/foo` MUST be created

#### Scenario: Malformed registry file

- GIVEN `~/.agentboard/daemon.json` contains invalid JSON (e.g. `{ "repos": `)
- WHEN the daemon starts
- THEN the daemon MUST log a warning about the malformed file
- AND MUST proceed with an empty registry
- AND MUST overwrite the file with `{ "repos": [] }` on the next debounced write

#### Scenario: Concurrent write safety

- GIVEN two repos are accessed within the debounce window
- WHEN the debounce timer fires
- THEN a single write MUST persist both repos
- AND the write MUST be atomic (no partial file state visible to readers)

---

### REQ-S-04: Two-Process WAL Safety

The `<repo>/.agentboard/db.sqlite` file MAY be open simultaneously by:
- The daemon process (via the per-repo cache).
- One or more `agentboard mcp` STDIO processes.

WAL mode MUST be enabled on every connection opened by either process type. The WAL mode requirement from the baseline spec (`openspec/specs/storage.md`) extends to cover this two-process model.

No additional locking beyond SQLite WAL is required in v1. WAL mode is sufficient for one writer + multiple readers, and allows multiple simultaneous writers with brief, automatic lock waits.

#### Scenario: STDIO process writes while daemon reads

- GIVEN `agentboard mcp` is running for `/projects/foo`
- AND the daemon has `/projects/foo` open in its cache
- WHEN the STDIO process calls `subtask.update` (a write)
- AND the daemon simultaneously serves `GET /api/tasks?repo=...` (a read)
- THEN both operations MUST complete without error or data corruption

#### Scenario: Both processes write simultaneously

- GIVEN `agentboard mcp` and the daemon are both running for `/projects/foo`
- WHEN the STDIO process inserts an event
- AND the daemon processes a REST write at the same moment
- THEN both writes MUST succeed (WAL write lock will serialize them briefly)
- AND the database MUST reflect both changes

---

### REQ-S-05: DB Cache Eviction on Shutdown

When the daemon receives SIGTERM or SIGINT, it MUST close all open `Database` instances in the cache before the process exits. Incomplete writes at shutdown time are handled by SQLite WAL recovery on next open.

#### Scenario: Daemon stops — all DB connections closed

- GIVEN the daemon has `/projects/foo` and `/projects/bar` open in its cache
- WHEN `agentboard stop` sends SIGTERM
- THEN the daemon MUST call `.close()` on all cached `Database` instances
- AND MUST exit cleanly with code 0

---

## Open Questions

None.
