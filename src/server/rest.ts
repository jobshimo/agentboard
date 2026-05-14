import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { z } from "zod";
import { createLocal, createReferenced } from "../domain/task.js";
import { appendEntry, getEntries } from "../domain/discussion.js";
import { nextSubtaskId } from "../domain/ids.js";
import {
  SUBTASK_STATUSES,
  validTransitions,
  isTerminal,
  type SubtaskStatus,
} from "../domain/subtask.js";
import { insertEvent } from "../events/insert.js";
import { resolveWorkflowPaths } from "../workflows/discovery.js";
import { loadWorkflowFile } from "../workflows/load.js";
import { freezeWorkflow } from "../workflows/snapshot.js";
import { renderTaskMarkdown } from "./markdown.js";
import {
  NotFoundError,
  ValidationError,
  StateError,
} from "./errors.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

type Db = InstanceType<typeof Database>;

// ---------------------------------------------------------------------------
// Compact response shapes
// ---------------------------------------------------------------------------

interface CompactTask {
  id: string;
  title: string;
  type: string;
  derived_status: string;
  workflow_id: string;
  ref_source: string | null;
  ref_id: string | null;
  created_at: string;
}

interface TaskRow {
  id: string;
  type: string;
  title: string;
  ref_source: string | null;
  ref_id: string | null;
  ref_url: string | null;
  ref_title: string | null;
  ref_status: string | null;
  ref_assignee: string | null;
  workflow_id: string;
  workflow_snapshot: string;
  snapshot_taken_at: string | null;
  derived_status: string;
  created_at: string;
  closed_at: string | null;
}

interface SubtaskRow {
  id: string;
  task_id: string;
  type: string;
  step_id: string | null;
  label: string;
  status: string;
  note: string | null;
  custom: number;
  triggered_by: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

function toCompactTask(row: TaskRow): CompactTask {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    derived_status: row.derived_status,
    workflow_id: row.workflow_id,
    ref_source: row.ref_source,
    ref_id: row.ref_id,
    created_at: row.created_at,
  };
}

function toTaskDetail(row: TaskRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    ref_source: row.ref_source,
    ref_id: row.ref_id,
    ref_url: row.ref_url,
    ref_title: row.ref_title,
    ref_status: row.ref_status,
    ref_assignee: row.ref_assignee,
    workflow_id: row.workflow_id,
    derived_status: row.derived_status,
    created_at: row.created_at,
    closed_at: row.closed_at,
    // workflow_snapshot and snapshot_taken_at are internal — not exposed
  };
}

function toSubtaskResponse(row: SubtaskRow) {
  return {
    id: row.id,
    task_id: row.task_id,
    type: row.type,
    step_id: row.step_id,
    label: row.label,
    status: row.status,
    note: row.note,
    custom: row.custom === 1,
    triggered_by: row.triggered_by,
    position: row.position,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getTask(db: Db, taskId: string): TaskRow {
  const row = db
    .prepare("SELECT * FROM tasks WHERE id = ?")
    .get(taskId) as TaskRow | undefined;
  if (!row) throw new NotFoundError("task", taskId);
  return row;
}

function getTaskSubtasks(db: Db, taskId: string): SubtaskRow[] {
  return db
    .prepare(
      "SELECT * FROM subtasks WHERE task_id = ? ORDER BY position ASC",
    )
    .all(taskId) as SubtaskRow[];
}

// ---------------------------------------------------------------------------
// Zod schemas for request validation
// ---------------------------------------------------------------------------

const CreateTaskBody = z.object({
  title: z.string().min(1),
  workflow_id: z.string().min(1),
  ref: z
    .object({
      source: z.string().optional(),
      id: z.string().optional(),
      url: z.string().optional(),
      title: z.string().optional(),
      status: z.string().optional(),
      assignee: z.string().optional(),
    })
    .optional(),
});

const AddCommentBody = z.object({
  body: z.string().min(1),
});

const AddSubtaskBody = z.object({
  label: z.string().min(1),
  type: z.string().optional(),
});

const PatchSubtaskBody = z.object({
  status: z.enum(SUBTASK_STATUSES).optional(),
  note: z.string().optional(),
}).refine((b) => b.status !== undefined || b.note !== undefined, {
  message: "at least one of status or note is required",
});

const AddFeedbackBody = z.object({
  target: z.string().min(1),
  text: z.string().min(1),
  severity: z.enum(["info", "correction", "failed_in_practice"]).optional(),
});

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function registerTaskRoutes(app: FastifyInstance, db: Db): void {
  app.get("/api/tasks", async (_req, reply) => {
    const rows = db
      .prepare("SELECT * FROM tasks ORDER BY created_at DESC")
      .all() as TaskRow[];
    reply.send(rows.map(toCompactTask));
  });

  app.get("/api/tasks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = getTask(db, id);
    const subtasks = getTaskSubtasks(db, id);
    reply.send({
      ...toTaskDetail(task),
      subtasks: subtasks.map(toSubtaskResponse),
    });
  });

  app.get("/api/tasks/:id/discussion", async (req, reply) => {
    const { id } = req.params as { id: string };
    getTask(db, id); // throws NotFoundError if missing
    const result = getEntries(db, id);
    reply.send(result);
  });

  app.get("/api/tasks/:id/markdown", async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = getTask(db, id);
    const subtasks = getTaskSubtasks(db, id);
    const discussionResult = getEntries(db, id);
    const discussion =
      discussionResult.type === "entries" ? discussionResult.entries : [];

    const md = renderTaskMarkdown({
      id: task.id,
      title: task.title,
      type: task.type as "referenced" | "local",
      derivedStatus: task.derived_status,
      refSource: task.ref_source,
      refId: task.ref_id,
      refUrl: task.ref_url,
      workflowId: task.workflow_id,
      createdAt: task.created_at,
      closedAt: task.closed_at,
      subtasks: subtasks.map((s) => ({
        id: s.id,
        label: s.label,
        status: s.status,
        note: s.note,
        custom: s.custom === 1,
      })),
      discussion,
    });

    reply.type("text/markdown; charset=utf-8").send(md);
  });

  app.post("/api/tasks", async (req, reply) => {
    const parsed = CreateTaskBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => i.message).join("; "),
      );
    }
    const { title, workflow_id, ref } = parsed.data;

    const paths = resolveWorkflowPaths({
      repoRoot: process.cwd(),
      home: homedir(),
    });
    const workflowPath = paths.find((p) =>
      p.endsWith(`${workflow_id}.yaml`) || p.endsWith(`${workflow_id}.yml`),
    );
    if (!workflowPath) {
      throw new ValidationError(`unknown workflow_id: ${workflow_id}`, "use GET /api/workflows to list available workflows");
    }

    const workflow = loadWorkflowFile(workflowPath);
    const snapshot = freezeWorkflow(workflow);
    const snapshotJson = JSON.stringify(snapshot);

    const taskId = ref
      ? createReferenced(db, {
          title,
          workflowId: workflow_id,
          workflowSnapshot: snapshotJson,
          refSource: ref.source,
          refId: ref.id,
          refUrl: ref.url,
          refTitle: ref.title,
          refStatus: ref.status,
          refAssignee: ref.assignee,
        })
      : createLocal(db, {
          title,
          workflowId: workflow_id,
          workflowSnapshot: snapshotJson,
        });

    const insertSubtask = db.prepare(
      `INSERT INTO subtasks (id, task_id, type, step_id, label, status, custom, triggered_by, position)
       VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
    );
    workflow.steps.forEach((step, i) => {
      insertSubtask.run(
        nextSubtaskId(db),
        taskId,
        "workflow",
        step.id,
        step.label,
        step.triggeredBy ?? null,
        i,
      );
    });

    const task = getTask(db, taskId);
    const subtasks = getTaskSubtasks(db, taskId);
    reply.status(201).send({ ...toTaskDetail(task), subtasks: subtasks.map(toSubtaskResponse) });
  });

  app.post("/api/tasks/:id/comments", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = AddCommentBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => i.message).join("; "),
      );
    }
    getTask(db, id); // throws if not found

    appendEntry(db, id, "human", parsed.data.body);
    insertEvent(db, {
      taskId: id,
      type: "comment_added",
      payload: { body: parsed.data.body },
      origin: "human",
    });

    const result = getEntries(db, id);
    const entries = result.type === "entries" ? result.entries : [];
    // appendEntry guarantees at least one entry exists at this point
    const latest = entries.at(-1);
    reply.status(201).send(latest ?? null);
  });

  app.post("/api/tasks/:id/subtasks", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = AddSubtaskBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => i.message).join("; "),
      );
    }
    getTask(db, id); // throws if not found

    const { label, type: subtaskType } = parsed.data;
    const position = (
      db
        .prepare("SELECT COUNT(*) AS cnt FROM subtasks WHERE task_id = ?")
        .get(id) as { cnt: number }
    ).cnt;

    const subtaskId = nextSubtaskId(db);
    db.prepare(
      `INSERT INTO subtasks (id, task_id, type, label, status, custom, position)
       VALUES (?, ?, ?, ?, 'pending', 1, ?)`,
    ).run(subtaskId, id, subtaskType ?? "custom", label, position);

    insertEvent(db, {
      taskId: id,
      type: "custom_subtask_added",
      payload: { subtask_id: subtaskId, label },
      origin: "human",
    });

    const row = db
      .prepare("SELECT * FROM subtasks WHERE id = ?")
      .get(subtaskId) as SubtaskRow;
    reply.status(201).send(toSubtaskResponse(row));
  });

  app.post("/api/tasks/:id/feedback", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = AddFeedbackBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => i.message).join("; "),
      );
    }
    getTask(db, id); // throws if not found

    const { target, text, severity = "info" } = parsed.data;
    const eventId = insertEvent(db, {
      taskId: id,
      type: "feedback_added",
      payload: { target, text, severity },
      origin: "human",
    });

    reply.status(201).send({ ok: true, event_id: eventId });
  });
}

function registerSubtaskRoutes(app: FastifyInstance, db: Db): void {
  app.patch("/api/subtasks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = PatchSubtaskBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => i.message).join("; "),
      );
    }

    const current = db
      .prepare("SELECT * FROM subtasks WHERE id = ?")
      .get(id) as SubtaskRow | undefined;
    if (!current) throw new NotFoundError("subtask", id);

    const { status, note } = parsed.data;

    if (status !== undefined) {
      const currentStatus = current.status as SubtaskStatus;
      const allowed: SubtaskStatus[] = validTransitions[currentStatus] ?? [];
      if (!allowed.includes(status)) {
        throw new StateError(
          `Cannot transition subtask ${id} from "${current.status}" to "${status}"`,
          `Valid transitions from "${current.status}": ${allowed.join(", ") || "none (terminal state)"}`,
        );
      }
    }

    db.prepare(
      `UPDATE subtasks
       SET status = COALESCE(?, status),
           note   = COALESCE(?, note),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(status ?? null, note ?? null, id);

    if (status !== undefined) {
      const taskId = current.task_id;
      insertEvent(db, {
        taskId,
        type: "subtask_updated",
        payload: { subtask_id: id, status },
        origin: "human",
      });

      // Recompute derived_status on the parent task
      const subtaskStatuses = (
        db
          .prepare("SELECT status FROM subtasks WHERE task_id = ?")
          .all(taskId) as { status: string }[]
      ).map((r) => r.status);

      let newTaskStatus = "backlog";
      if (subtaskStatuses.some((s) => s === "blocked")) newTaskStatus = "blocked";
      else if (subtaskStatuses.some((s) => s === "in-progress")) newTaskStatus = "active";
      else if (subtaskStatuses.every((s) => isTerminal(s as SubtaskStatus))) newTaskStatus = "done";

      db.prepare(
        "UPDATE tasks SET derived_status = ? WHERE id = ?",
      ).run(newTaskStatus, taskId);
    }

    const updated = db
      .prepare("SELECT * FROM subtasks WHERE id = ?")
      .get(id) as SubtaskRow;
    reply.send(toSubtaskResponse(updated));
  });
}

function registerWorkflowRoutes(app: FastifyInstance): void {
  app.get("/api/workflows", async (_req, reply) => {
    const paths = resolveWorkflowPaths({
      repoRoot: process.cwd(),
      home: homedir(),
    });

    const workflows = paths.flatMap((p) => {
      try {
        return [loadWorkflowFile(p)];
      } catch {
        return [];
      }
    });

    reply.send(workflows);
  });
}

function registerExportRoute(app: FastifyInstance, db: Db): void {
  app.post("/api/export", async (_req, reply) => {
    const tasks = db
      .prepare("SELECT * FROM tasks ORDER BY created_at DESC")
      .all() as TaskRow[];

    const snapshotDir = join(process.cwd(), ".agentboard", "snapshot");
    mkdirSync(snapshotDir, { recursive: true });

    for (const task of tasks) {
      const subtasks = getTaskSubtasks(db, task.id);
      const discussionResult = getEntries(db, task.id);
      const discussion =
        discussionResult.type === "entries" ? discussionResult.entries : [];

      const md = renderTaskMarkdown({
        id: task.id,
        title: task.title,
        type: task.type as "referenced" | "local",
        derivedStatus: task.derived_status,
        refSource: task.ref_source,
        refId: task.ref_id,
        refUrl: task.ref_url,
        workflowId: task.workflow_id,
        createdAt: task.created_at,
        closedAt: task.closed_at,
        subtasks: subtasks.map((s) => ({
          id: s.id,
          label: s.label,
          status: s.status,
          note: s.note,
          custom: s.custom === 1,
        })),
        discussion,
      });

      writeFileSync(join(snapshotDir, `${task.id}.md`), md, "utf8");
    }

    reply.send({ path: snapshotDir, count: tasks.length });
  });
}

// ---------------------------------------------------------------------------
// Plugin registration
// ---------------------------------------------------------------------------

export function registerRestRoutes(app: FastifyInstance, db: Db): void {
  registerTaskRoutes(app, db);
  registerSubtaskRoutes(app, db);
  registerWorkflowRoutes(app);
  registerExportRoute(app, db);
}
