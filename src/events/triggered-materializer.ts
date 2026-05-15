import type Database from "better-sqlite3";
import { rehydrateSnapshot } from "../workflows/snapshot.js";
import { materializeTriggeredSubtask } from "../domain/task.js";
import type { Workflow } from "../domain/workflow.js";
import type { EventListener } from "./insert.js";

type Db = InstanceType<typeof Database>;

/**
 * Returns an EventListener that materializes deferred (triggered_by) subtasks
 * when a matching event arrives for a task.
 *
 * On each inserted event the listener:
 *  1. Looks up the task's workflow snapshot.
 *  2. Rehydrates it into a WorkflowSnapshot (compatible with Workflow for materializer).
 *  3. Calls materializeTriggeredSubtask for any step whose triggeredBy matches the event type.
 *
 * Idempotent — materializeTriggeredSubtask returns null if the subtask already exists.
 */
export function createTriggerMaterializer(db: Db): EventListener {
  // S5: _repoRoot added to match new EventListener signature
  return (event, _repoRoot) => {
    if (event.taskId === "_global") return;

    const taskRow = db
      .prepare("SELECT workflow_snapshot FROM tasks WHERE id = ?")
      .get(event.taskId) as { workflow_snapshot: string } | undefined;
    if (!taskRow) return;

    let snapshot: Workflow;
    try {
      snapshot = rehydrateSnapshot(taskRow.workflow_snapshot) as unknown as Workflow;
    } catch {
      return;
    }

    for (const step of snapshot.steps) {
      if (step.triggeredBy === event.type) {
        materializeTriggeredSubtask(db, event.taskId, snapshot, event.type);
      }
    }
  };
}
