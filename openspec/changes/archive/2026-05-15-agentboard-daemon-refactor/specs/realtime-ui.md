# Delta Spec: Realtime UI Contract

Delta against `openspec/specs/realtime-ui.md`

---

## Changes Summary

### Added
- `?repo=<encoded-abs-path>` required on every REST request and WebSocket connect URL.
- Repo-scoped broadcasting: WS clients on repo A do not receive events from repo B.
- On-demand repo switching in the SPA: WS connection torn down and reopened with the new repo param.
- `POST /internal/notify` endpoint on the daemon (loopback-only): payload, routing, and broadcast semantics specified.
- `GET /api/daemon/repos` endpoint: supplies the repo list to the SPA repo selector.
- SPA repo selector behavior: initialization from `localStorage`, TopBar dropdown, WS rebinding on change.
- `activeRepo` persistence in `localStorage`.

### Modified
- WebSocket connection lifecycle: now requires `?repo=` on connect; server MUST reject WS upgrades without a valid `?repo=` param.
- Broadcast scope: previously global (all connected clients); now scoped per repo.

### Removed
- Implicit global broadcast (all clients receive all events regardless of repo).

### Unchanged
- WebSocket push-on-DB-change requirement.
- Push message shape (`{ event, task_id, entity_ids }`).
- Event types that trigger pushes.
- `agentboard.notify_human` push behavior.
- Automatic browser reconnection on WS drop.

Cross-references: `launcher.md` delta (REQ-L-01, daemon serves all repos), `storage.md` delta (REQ-S-02, per-request DB injection, REQ-S-03, repo registry), `daemon.md` delta (REQ-D-04, `/api/daemon/repos`; REQ-D-05, `/internal/notify`).

---

## Requirements

### REQ-R-01: `?repo=` on All REST Requests and WS Connect

Every HTTP request sent by the SPA to the daemon MUST include a `?repo=<url-encoded-absolute-path>` query parameter. The daemon enforces this via the `onRequest` hook described in `storage.md` delta REQ-S-02.

Every WebSocket connection upgrade request MUST also include `?repo=<url-encoded-absolute-path>` in the upgrade URL. The daemon MUST reject WebSocket upgrades that lack a valid `?repo=` parameter with HTTP 400.

The SPA MUST treat a missing or invalid `?repo=` response as an application error and render a user-visible error state rather than silently retrying.

#### Scenario: SPA makes REST request with repo param

- GIVEN the user has `/projects/foo` as the active repo in the SPA
- WHEN the SPA calls `GET /api/tasks`
- THEN the request URL MUST be `GET /api/tasks?repo=%2Fprojects%2Ffoo`
- AND the daemon MUST respond with tasks from `/projects/foo`'s database only

#### Scenario: SPA connects WebSocket with repo param

- GIVEN the user has `/projects/foo` as the active repo
- WHEN the SPA opens a WebSocket connection
- THEN the upgrade URL MUST include `?repo=%2Fprojects%2Ffoo`
- AND the daemon MUST accept the connection and register it in the `/projects/foo` subscriber set

#### Scenario: WS upgrade without `?repo=`

- GIVEN the SPA (or any client) attempts a WebSocket upgrade without `?repo=`
- WHEN the daemon processes the upgrade request
- THEN the daemon MUST reject the upgrade with HTTP 400
- AND MUST NOT register the client as a subscriber

---

### REQ-R-02: Repo-Scoped Broadcasting

The daemon's broadcast manager MUST maintain separate subscriber sets, one per active repo. A push event generated for repo A MUST be delivered only to WS clients that connected with `?repo=<repo-A-path>`.

When `POST /internal/notify` is received (see REQ-R-04), the daemon MUST look up the event by `event_id` in the repo's database and broadcast to subscribers of that repo only.

When the daemon itself generates an event (e.g. from a direct REST write by the human via the SPA), it MUST broadcast to the corresponding repo's subscriber set only.

#### Scenario: Two repos, two browser tabs

- GIVEN browser tab A is connected with `?repo=/projects/foo`
- AND browser tab B is connected with `?repo=/projects/bar`
- WHEN the agent (running in `/projects/foo`) calls `subtask.update(S1, status: "done")`
- AND the STDIO process fires `POST /internal/notify` with `{ "repo": "/projects/foo", "event_id": 42 }`
- THEN the daemon MUST push to tab A only
- AND tab B MUST NOT receive any message

#### Scenario: Multiple clients on the same repo

- GIVEN two browser tabs (tab C and tab D) both connected with `?repo=/projects/foo`
- WHEN an event is inserted for `/projects/foo`
- THEN both tab C and tab D MUST receive the push

---

### REQ-R-03: SPA Repo Selector and Switching

The SPA MUST maintain an `activeRepo` state representing the currently viewed repo. This state MUST be initialized in the following precedence:

1. Value stored in `localStorage` under the key `agentboard.activeRepo` (if present and valid).
2. First repo returned by `GET /api/daemon/repos` (if `localStorage` is empty or stale).
3. An empty/unset state prompting the user to select a repo.

The SPA MUST display a repo selector in the TopBar. The selector MUST list repos returned by `GET /api/daemon/repos`. When the user picks a different repo:

1. The current WebSocket connection MUST be closed.
2. All in-flight REST requests MAY be cancelled (best-effort).
3. `activeRepo` MUST be updated in both state and `localStorage`.
4. A new WebSocket connection MUST be opened with `?repo=<new-repo-path>`.
5. All board panels MUST re-fetch their data with the new `?repo=` param.

`GET /api/daemon/repos` MUST be called at SPA initialization and MAY be polled at a low frequency (e.g. every 60 seconds) to detect newly-opened repos.

#### Scenario: User switches from repo A to repo B

- GIVEN the SPA is showing `/projects/foo` with an active WS connection
- WHEN the user selects `/projects/bar` from the TopBar dropdown
- THEN the existing WS connection MUST close
- AND a new WS connection MUST open with `?repo=%2Fprojects%2Fbar`
- AND all API calls MUST switch to `?repo=%2Fprojects%2Fbar`
- AND the board panels MUST re-fetch and display data from `/projects/bar`
- AND `localStorage["agentboard.activeRepo"]` MUST be set to `/projects/bar`

#### Scenario: SPA restores last-used repo from localStorage

- GIVEN `localStorage["agentboard.activeRepo"]` is `/projects/bar`
- WHEN the user reloads the SPA
- THEN the SPA MUST initialize with `/projects/bar` as the active repo
- AND the initial WS connection MUST use `?repo=%2Fprojects%2Fbar`

#### Scenario: localStorage repo is no longer in the daemon registry

- GIVEN `localStorage["agentboard.activeRepo"]` is `/projects/old`
- AND `GET /api/daemon/repos` does not include `/projects/old`
- WHEN the SPA initializes
- THEN the SPA MUST fall back to the first repo in the list returned by `GET /api/daemon/repos`
- AND MUST update `localStorage` to the fallback value

#### Scenario: No repos in registry

- GIVEN `GET /api/daemon/repos` returns an empty list
- WHEN the SPA initializes
- THEN the SPA MUST render an onboarding or empty state instructing the user to run `npx @jobshimo/agentboard` from a repo

---

### REQ-R-04: `POST /internal/notify` Endpoint

The daemon MUST expose `POST /internal/notify` bound exclusively to `127.0.0.1` (loopback). This endpoint MUST NOT be reachable from external network interfaces.

Request body (normative):

```json
{
  "repo": "/absolute/normalized/repo/path",
  "event_id": 42
}
```

Processing MUST be:
1. Validate `repo` is a string and `event_id` is a positive integer. Return HTTP 400 for invalid payloads.
2. Look up `event_id` in the database for `repo` (using the per-repo DB cache).
3. Construct the push message (`{ event, task_id, entity_ids }`) from the event row.
4. Broadcast the push message to all WS subscribers of `repo`.
5. Return HTTP 200 with `{ "ok": true }` (or HTTP 404 if `event_id` not found in the repo's DB).

This endpoint is optional in the sense that the STDIO process fires it best-effort. The daemon MUST NOT depend on receiving a notification to maintain consistency; the database is always authoritative.

Optional shared-secret protection: if the environment variable `AGENTBOARD_NOTIFY_SECRET` is set, the daemon MUST require an `X-Agentboard-Secret` header matching that value on every `POST /internal/notify` request, and MUST return HTTP 401 if it is absent or mismatched. If `AGENTBOARD_NOTIFY_SECRET` is not set, the endpoint has no authentication (loopback isolation is the only security layer).

#### Scenario: STDIO process notifies daemon — push delivered

- GIVEN the daemon is running and browser tab A is connected to `/projects/foo`
- WHEN `POST /internal/notify` arrives with `{ "repo": "/projects/foo", "event_id": 7 }`
- THEN the daemon MUST look up event 7 in `/projects/foo`'s database
- AND MUST push `{ event: "status_change", task_id: "T1", entity_ids: ["S1"] }` to tab A
- AND MUST return HTTP 200

#### Scenario: Notification for repo with no WS subscribers

- GIVEN no browser is connected to `/projects/foo`
- WHEN `POST /internal/notify` arrives with `{ "repo": "/projects/foo", "event_id": 9 }`
- THEN the daemon MUST look up the event (no-op broadcast)
- AND MUST return HTTP 200
- AND MUST NOT error

#### Scenario: Notification with unknown event ID

- GIVEN event 999 does not exist in `/projects/foo`'s database
- WHEN `POST /internal/notify` arrives with `{ "repo": "/projects/foo", "event_id": 999 }`
- THEN the daemon MUST return HTTP 404

#### Scenario: Notification without secret when secret is required

- GIVEN `AGENTBOARD_NOTIFY_SECRET=mysecret` is set in the daemon's environment
- WHEN `POST /internal/notify` arrives without the `X-Agentboard-Secret` header
- THEN the daemon MUST return HTTP 401
- AND MUST NOT process the payload

#### Scenario: Endpoint not reachable from external interfaces

- GIVEN the daemon is running on a machine with a LAN IP `192.168.1.100`
- WHEN a request to `http://192.168.1.100:7733/internal/notify` is made from another machine
- THEN the request MUST be refused (not bound on that interface)

---

### REQ-R-05: `GET /api/daemon/repos` Endpoint

The daemon MUST expose `GET /api/daemon/repos` returning the list of known repos from the in-memory registry (backed by `daemon.json`).

Response shape (normative):

```json
{
  "repos": [
    { "path": "/projects/foo", "lastSeenAt": "2024-01-15T10:30:00.000Z" },
    { "path": "/projects/bar", "lastSeenAt": "2024-01-14T09:00:00.000Z" }
  ]
}
```

The response MUST NOT require a `?repo=` query parameter; this endpoint is about the daemon's global state, not a per-repo resource. The `onRequest` DB injection hook MUST exempt this endpoint.

#### Scenario: SPA fetches repo list on startup

- GIVEN the daemon has two known repos: `/projects/foo` and `/projects/bar`
- WHEN the SPA calls `GET /api/daemon/repos`
- THEN the response MUST contain both repos with their `path` and `lastSeenAt` fields

#### Scenario: Empty registry

- GIVEN the daemon has no known repos
- WHEN `GET /api/daemon/repos` is called
- THEN the response MUST be `{ "repos": [] }` and HTTP 200

---

## Open Questions

None.
