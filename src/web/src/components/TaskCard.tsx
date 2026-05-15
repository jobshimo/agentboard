// Compact 2-row task card for the Board view. Mirrors components.jsx TaskCard.
// Click navigates to TaskDetail. WorkflowStrip shows dots when subtask data is present.
// CompactTask from GET /api/tasks omits subtasks — strip renders empty until S10c enriches.

import type { CompactTask } from "../lib/store";
import { OriginChip } from "./OriginChip";
import { WorkflowStrip } from "./WorkflowStrip";

interface TaskCardProps {
  task: CompactTask;
  onOpen: (taskId: string) => void;
}

export function TaskCard({ task, onOpen }: TaskCardProps) {
  // derived_status drives card accent border — mirrors data.blocked / data.failed in deliverable
  const isBlocked = task.derived_status === "blocked";

  return (
    <div
      className="ab-card"
      data-blocked={String(isBlocked)}
      data-failed="false"
      onClick={() => onOpen(task.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(task.id); }}
    >
      <div className="ab-card-row">
        <OriginChip source={task.ref_source} />
        <span className="ab-card-title">{task.title}</span>
      </div>
      <div className="ab-card-meta">
        {/* WorkflowStrip: CompactTask has no subtasks; renders empty gracefully */}
        <WorkflowStrip />
        <span className="sep" />
        <span className="mono">{task.workflow_id}</span>
        <span className="sep" />
        <span className="mono" style={{ color: "var(--fg-subtle)" }}>{task.id}</span>
        {task.ref_id && (
          <>
            <span className="sep" />
            <span className="mono" style={{ color: "var(--fg-muted)" }}>{task.ref_id}</span>
          </>
        )}
      </div>
    </div>
  );
}
