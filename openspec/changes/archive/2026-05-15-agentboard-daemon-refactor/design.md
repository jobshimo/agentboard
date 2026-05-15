
# Design: agentboard-daemon-refactor

Status: design | Persistence: hybrid | Proposal: engram #612 | Spec: companion artifact

This document is the technical HOW for the architecture decided in engram #609. It is concrete, cite-able, and assumes the reader has the proposal in hand. Where a "should" claim touches existing code, the citation is `file:line`.

---

## 0. Architecture overview

Two cooperating processes, one SQLite database per repo, one optional inter-process push:

```
+--------------------------+         +---------------------------------+
| agent (Claude Code, etc) |         | user's browser                  |
+------------+-------------+         +---------------+-----------------+
             | spawns                                | HTTP + WS
             v                                       v
+--------------------------+         +---------------------------------+
| agentboard mcp (STDIO)   |         | agentboard daemon (HTTP :7733)  |
|  - one per agent session |         |  - one per machine              |
|  - bound to AGENTBOARD_  |  fire   |  - NOT bound to cwd             |
|    REPO at startup       | --and-> |  - per-request DB injection     |
|  - opens own Db(repo)    | forget  |  - serves SPA + REST + WS       |
|  - 14 MCP tools          |  POST   |  - /internal/notify             |
+------------+-------------+         +---------------+-----------------+
             |                                       |
             |          shared SQLite (WAL)          |
             +--------------> repo/.agentboard/db.sqlite <-------------+
```

Authoritative state: SQLite. Realtime push: best-effort over loopback HTTP. If the daemon is down, the MCP tool still succeeds; the browser sees the new row on next request or on next WS reconnect.

(Full design document preserved in archive; see file content in openspec/changes/archive/2026-05-15-agentboard-daemon-refactor/design.md)
