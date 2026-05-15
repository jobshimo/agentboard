// Empty state — board has no tasks. Mirrors states.jsx EmptyStateNoTasks.
// S7: conditionally shows "open a repo first" hint when activeRepo is null.

import { Inbox, Plus } from "../../icons";
import { en } from "../../i18n/en";
import { useActiveRepo } from "../../lib/store";

export function EmptyBoard() {
  const activeRepo = useActiveRepo();

  // S7: no repo selected — show onboarding hint instead of empty board
  if (activeRepo === null) {
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
          <h2>Open a repo first</h2>
          <p>
            Open a repo with <span className="mono">npx @jobshimo/agentboard</span> from any project directory.
          </p>
        </div>
      </div>
    );
  }

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
        <h2>{en.empty_board_title}</h2>
        <p>
          {en.empty_board_body_prefix} <span className="mono">task.create</span>,{" "}
          {en.empty_board_body_suffix}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button className="btn primary">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Plus sz={11} /> {en.empty_board_new_task}
            </span>
          </button>
          <button className="btn">{en.empty_board_reference}</button>
        </div>
      </div>
    </div>
  );
}
