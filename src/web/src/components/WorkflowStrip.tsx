// One dot per subtask, colored by state. Mirrors components.jsx WorkflowStrip.

import { StateDot } from "./StateDot";

interface SubtaskSummary {
  status: "pending" | "in-progress" | "done" | "blocked" | "failed" | "skipped";
}

interface WorkflowStripProps {
  subtasks?: SubtaskSummary[];
}

export function WorkflowStrip({ subtasks = [] }: WorkflowStripProps) {
  return (
    <span className="wf-strip">
      {subtasks.map((s, i) => (
        <StateDot key={i} state={s.status} />
      ))}
    </span>
  );
}
