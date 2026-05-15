// Single Kanban column. Mirrors board.jsx column rendering 1:1.
// Receives only its own data — no god prop.

import type { CompactTask } from "../../lib/store";
import type { ColumnDef } from "../../lib/board-grouping";
import { TaskCard } from "../../components/TaskCard";
import { MoreH, Plus } from "../../icons";

interface BoardColumnProps {
  col: ColumnDef;
  tasks: CompactTask[];
  onOpen: (taskId: string) => void;
}

export function BoardColumn({ col, tasks, onOpen }: BoardColumnProps) {
  return (
    <div key={col.id} className="ab-col">
      <div className="ab-col-header">
        <span className="ab-col-name">{col.label}</span>
        <span className="ab-col-count">{tasks.length}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
          <button className="ab-iconbtn" style={{ width: 22, height: 22 }} aria-label="More">
            <MoreH sz={12} />
          </button>
          <button className="ab-iconbtn" style={{ width: 22, height: 22 }} aria-label="Add">
            <Plus sz={12} />
          </button>
        </div>
      </div>
      <div className="ab-col-body">
        {tasks.length === 0 && (
          <div style={{
            padding: "20px 8px",
            textAlign: "center",
            color: "var(--fg-subtle)",
            fontSize: 12,
          }}>
            No tasks here.
          </div>
        )}
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
