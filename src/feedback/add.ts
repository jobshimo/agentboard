import type Database from "better-sqlite3";
import { insertEvent, type InsertEventHooks } from "../events/insert.js";
import { SEVERITY_VALUES, type Severity } from "./types.js";

type Db = InstanceType<typeof Database>;

export interface AddFeedbackOpts {
  target: string;
  taskId: string;
  text: string;
  severity?: Severity;
  filePaths?: string[];
  origin?: "human" | "agent" | "system";
  hooks?: InsertEventHooks;
}

export interface AddFeedbackResult {
  ok: true;
  event_id: number;
}

export function addFeedback(db: Db, opts: AddFeedbackOpts): AddFeedbackResult {
  const severity = opts.severity ?? "info";

  if (!SEVERITY_VALUES.includes(severity)) {
    throw new Error(`invalid severity: "${severity}". Must be one of: ${SEVERITY_VALUES.join(", ")}`);
  }

  const task = db
    .prepare(`SELECT workflow_id, type FROM tasks WHERE id = ?`)
    .get(opts.taskId) as { workflow_id: string; type: string } | undefined;

  const workflowAtCapture = task?.workflow_id ?? "";
  const targetTaskType = task?.type ?? "";

  const eventId = insertEvent(db, {
    taskId: opts.taskId,
    type: "feedback_added",
    payload: {
      target: opts.target,
      text: opts.text,
      severity,
      workflow_at_capture: workflowAtCapture,
      target_task_type: targetTaskType,
      file_paths: opts.filePaths ?? [],
    },
    origin: opts.origin ?? "human",
  }, opts.hooks ?? {});

  return { ok: true, event_id: eventId };
}
