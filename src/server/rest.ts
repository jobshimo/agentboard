import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { z } from "zod";
import {
  createLocal,
  createReferenced,
  seedWorkflowSubtasks,
  getTask,
  getTaskSubtasks,
  listTasks,
  type TaskRow,
} from "../domain/task.js";
import { appendEntry, getEntries } from "../domain/discussion.js";
import {
  SUBTASK_STATUSES,
  validTransitions,
  addCustomSubtask,
  getSubtask,
  applySubtaskUpdate,
  applyStatusTransition,
  canStartSubtask,
  type SubtaskRow,
} from "../domain/subtask.js";
import { insertEvent, type InsertEventHooks } from "../events/insert.js";
import { addFeedback } from "../feedback/add.js";
import { findWorkflowById } from "../workflows/find.js";
import { resolveWorkflowPaths } from "../workflows/discovery.js";
import { loadWorkflowFile } from "../workflows/load.js";
import { freezeWorkflow } from "../workflows/snapshot.js";
import { renderTaskMarkdown } from "./markdown.js";
import { runExportSnapshot } from "./export.js";
import {
  NotFoundError,
  ValidationError,
  StateError,
} from "./errors.js";
import { homedir } from "node:os";
import { join } from "node:path";

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

function registerTaskRoutes(app: FastifyInstance, db: Db, hooks: InsertEventHooks): void {
  app.get("/api/tasks", async (_req, reply) => {
    reply.send(listTasks(db).map(toCompactTask));
  });

  app.get("/api/tasks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = getTask(db, id);
    if (!task) throw new NotFoundError("task", id);
    const subtasks = getTaskSubtasks(db, id);
    reply.send({
      ...toTaskDetail(task),
      subtasks: subtasks.map(toSubtaskResponse),
    });
  });

  app.get("/api/tasks/:id/discussion", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!getTask(db, id)) throw new NotFoundError("task", id);
    const result = getEntries(db, id);
    reply.send(result);
  });

  app.get("/api/tasks/:id/markdown", async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = getTask(db, id);
    if (!task) throw new NotFoundError("task", id);
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

    const workflow = findWorkflowById({ repoRoot: process.cwd(), home: homedir() }, workflow_id);
    if (!workflow) {
      throw new ValidationError(`unknown workflow_id: ${workflow_id}`, "use GET /api/workflows to list available workflows");
    }
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

    seedWorkflowSubtasks(db, taskId, workflow);

    const task = getTask(db, taskId);
    if (!task) throw new NotFoundError("task", taskId);
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
    if (!getTask(db, id)) throw new NotFoundError("task", id);

    appendEntry(db, id, "human", parsed.data.body);
    insertEvent(db, {
      taskId: id,
      type: "comment_added",
      payload: { body: parsed.data.body },
      origin: "human",
    }, hooks);

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
    if (!getTask(db, id)) throw new NotFoundError("task", id);

    const { label, type: subtaskType } = parsed.data;
    const subtask = addCustomSubtask(db, id, { label, type: subtaskType });

    insertEvent(db, {
      taskId: id,
      type: "custom_subtask_added",
      payload: { subtask_id: subtask.id, label },
      origin: "human",
    }, hooks);

    reply.status(201).send(toSubtaskResponse(subtask));
  });

  app.post("/api/tasks/:id/feedback", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = AddFeedbackBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => i.message).join("; "),
      );
    }
    if (!getTask(db, id)) throw new NotFoundError("task", id);

    const { target, text, severity } = parsed.data;
    const result = addFeedback(db, { target, taskId: id, text, severity, origin: "human", hooks });

    reply.status(201).send(result);
  });
}

function registerSubtaskRoutes(app: FastifyInstance, db: Db, hooks: InsertEventHooks): void {
  app.patch("/api/subtasks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = PatchSubtaskBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => i.message).join("; "),
      );
    }

    const current = getSubtask(db, id);
    if (!current) throw new NotFoundError("subtask", id);

    const { status, note } = parsed.data;

    if (status !== undefined) {
      const allowed = validTransitions[current.status] ?? [];
      if (!allowed.includes(status)) {
        throw new StateError(
          `Cannot transition subtask ${id} from "${current.status}" to "${status}"`,
          `Valid transitions from "${current.status}": ${allowed.join(", ") || "none (terminal state)"}`,
        );
      }
      if (status === "in-progress" && !canStartSubtask(db, current.task_id, id)) {
        throw new StateError(
          `Subtask ${id} is blocked by a preceding step with blocks_next: true`,
          "Complete or skip the blocking step before starting this one",
        );
      }
    }

    let updated;
    if (status !== undefined) {
      const transition = applyStatusTransition(db, id, current.status, status, note);
      updated = transition.updatedRow;
      for (const ev of transition.events) {
        insertEvent(db, { taskId: current.task_id, type: ev.type, payload: ev.payload, origin: "human" }, hooks);
      }
    } else {
      updated = applySubtaskUpdate(db, id, { note });
      insertEvent(db, {
        taskId: current.task_id,
        type: "subtask_updated",
        payload: { task_id: current.task_id, subtask_id: id, field: "note", value: note },
        origin: "human",
      }, hooks);
    }

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
    const snapshotDir = join(process.cwd(), ".agentboard", "snapshot");
    const result = runExportSnapshot(db, snapshotDir);
    reply.send(result);
  });
}

// ---------------------------------------------------------------------------
// Plugin registration
// ---------------------------------------------------------------------------

export function registerRestRoutes(app: FastifyInstance, db: Db, hooks: InsertEventHooks = {}): void {
  registerTaskRoutes(app, db, hooks);
  registerSubtaskRoutes(app, db, hooks);
  registerWorkflowRoutes(app);
  registerExportRoute(app, db);
}
