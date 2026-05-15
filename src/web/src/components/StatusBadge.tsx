// Task-level macro status badge. Mirrors components.jsx StatusBadge.
// Accepts derived_status directly — no subtask array needed for badge display.
// The full-subtask "currentSubtask" logic lives in S10c (TaskDetail).

type DerivedStatus = "backlog" | "active" | "blocked" | "done";

interface StatusBadgeProps {
  derived_status: DerivedStatus;
}

export function StatusBadge({ derived_status }: StatusBadgeProps) {
  if (derived_status === "done") {
    return (
      <span className="status-badge" data-tone="success">
        <span className="dot" /> Done
      </span>
    );
  }
  if (derived_status === "blocked") {
    return (
      <span className="status-badge" data-tone="warning">
        <span className="dot" /> Blocked
      </span>
    );
  }
  if (derived_status === "active") {
    return (
      <span className="status-badge" data-tone="accent">
        <span className="dot" /> Active
      </span>
    );
  }
  // backlog
  return (
    <span className="status-badge">
      <span className="dot" /> Pending
    </span>
  );
}
