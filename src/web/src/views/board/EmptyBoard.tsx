// Empty state — board has no tasks. Mirrors states.jsx EmptyStateNoTasks.

import { Inbox, Plus } from "../../icons";

export function EmptyBoard() {
  return (
    <div className="empty">
      <div className="empty-inner">
        <div style={{
          display: "inline-grid",
          placeItems: "center",
          width: 56,
          height: 56,
          borderRadius: 16,
          background: "var(--bg-subtle)",
          border: "1px solid var(--border-muted)",
          marginBottom: 6,
        }}>
          <Inbox sz={26} />
        </div>
        <h2>Nothing on the board</h2>
        <p>
          Tasks land here when the agent calls <span className="mono">task.create</span>,
          you create one from the UI, or you reference an external issue.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button className="btn primary">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Plus sz={11} /> New task
            </span>
          </button>
          <button className="btn">Reference issue…</button>
        </div>
      </div>
    </div>
  );
}
