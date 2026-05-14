-- 0001_init.sql — initial schema for agentboard
-- Applied once by the migration runner; idempotent via schema_migrations tracking.

-- 3.1 tasks
CREATE TABLE tasks (
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL CHECK (type IN ('referenced', 'local')),
  title             TEXT NOT NULL,
  ref_source        TEXT,                               -- 'github' | 'jira' | 'linear' | NULL when local
  ref_id            TEXT,                               -- e.g. 'jobshimo/agentboard#42'
  ref_url           TEXT,
  ref_title         TEXT,                               -- cached from external system
  ref_status        TEXT,                               -- cached
  ref_assignee      TEXT,                               -- cached
  workflow_id       TEXT NOT NULL,                      -- copied from snapshot for fast filter
  workflow_snapshot JSON NOT NULL,                      -- frozen YAML-as-JSON; immutable after start
  snapshot_taken_at TIMESTAMP,
  derived_status    TEXT NOT NULL DEFAULT 'backlog'
                      CHECK (derived_status IN ('backlog', 'active', 'blocked', 'done')),
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at         TIMESTAMP
);
CREATE INDEX idx_tasks_status   ON tasks (derived_status);
CREATE INDEX idx_tasks_workflow ON tasks (workflow_id);

-- 3.2 subtasks
CREATE TABLE subtasks (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  type         TEXT NOT NULL,                           -- 'implement' | 'tests' | 'commit' | ...
  step_id      TEXT,                                    -- workflow step id; NULL for custom
  label        TEXT NOT NULL,                           -- workflow label or custom label
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'in-progress', 'done', 'blocked', 'failed', 'skipped')),
  note         TEXT,                                    -- optional artifact link / note
  custom       INTEGER NOT NULL DEFAULT 0,              -- boolean; 1 for ad-hoc subtasks
  triggered_by TEXT,                                    -- copied from workflow step; NULL for upfront-created
  position     INTEGER NOT NULL,                        -- order within task; preserves workflow order
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_subtasks_task   ON subtasks (task_id);
CREATE INDEX idx_subtasks_status ON subtasks (task_id, status);

-- 3.3 discussion entries (append-only)
CREATE TABLE discussion_entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  author     TEXT NOT NULL CHECK (author IN ('human', 'agent', 'system')),
  body       TEXT NOT NULL,
  tag        TEXT,                                      -- optional, e.g. 'subtask'
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_discussion_task ON discussion_entries (task_id, id);

-- 3.4 events (append-only, queue + audit)
-- NOTE: type is validated by events/types.ts in application code, not by CHECK here,
-- so that adding a new event type is a single-source change in TypeScript.
CREATE TABLE events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    TEXT NOT NULL,                             -- not FK: events can outlive task deletion
  type       TEXT NOT NULL,
  payload    JSON NOT NULL,
  origin     TEXT NOT NULL CHECK (origin IN ('human', 'agent', 'system')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_events_task ON events (task_id, id);

-- 3.5 agent_sessions
CREATE TABLE agent_sessions (
  id            TEXT PRIMARY KEY,                       -- server-minted UUID, returned from activate()
  last_event_id INTEGER NOT NULL DEFAULT 0,
  host_label    TEXT,                                   -- optional host-provided hint (e.g. 'claude-code')
  connected_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active        INTEGER NOT NULL DEFAULT 1              -- 0 once deactivate() called or zombie pruned
);
CREATE INDEX idx_sessions_lastseen ON agent_sessions (last_seen);
