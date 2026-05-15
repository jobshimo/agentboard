// Kanban Board view. Two column modes: macro-status (default) and workflow-step.
// Mirrors agentboard/board.jsx + prototype.jsx column-mode toggle.
// Reads all state from the store — no fetch, no local state beyond UI toggle.

import { useTasks, useWorkflowFilter, useColumnMode, dispatch } from "../lib/store";
import { groupTasks, getColumns } from "../lib/board-grouping";
import { BoardColumn } from "./board/BoardColumn";
import { EmptyBoard } from "./board/EmptyBoard";
import { navigate } from "../router/Router";
import { en } from "../i18n/en";

export function Board() {
  const tasks = useTasks();
  const workflowFilter = useWorkflowFilter();
  const columnMode = useColumnMode();

  if (tasks.length === 0) {
    return <EmptyBoard />;
  }

  const grouped = groupTasks(tasks, columnMode, workflowFilter);
  const cols = getColumns(columnMode);

  function handleOpen(taskId: string): void {
    navigate({ view: "detail", taskId });
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Column-mode toggle — floating top-right, mirrors prototype.jsx */}
      <div style={{
        position: "absolute", top: 12, right: 16, zIndex: 2,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span className="muted" style={{ fontSize: 11 }}>{en.col_mode_label}</span>
        <div style={{
          display: "flex", gap: 2,
          background: "var(--bg-subtle)", padding: 2,
          borderRadius: 6, border: "1px solid var(--border-muted)",
        }}>
          <button
            className="btn small ghost"
            data-active={String(columnMode === "macro")}
            onClick={() => dispatch({ type: "SET_COLUMN_MODE", columnMode: "macro" })}
            style={columnMode === "macro"
              ? { background: "var(--bg-elevated)", color: "var(--fg-default)" }
              : {}}
          >
            macro-status
          </button>
          <button
            className="btn small ghost"
            data-active={String(columnMode === "workflow")}
            onClick={() => dispatch({ type: "SET_COLUMN_MODE", columnMode: "workflow" })}
            style={columnMode === "workflow"
              ? { background: "var(--bg-elevated)", color: "var(--fg-default)" }
              : {}}
          >
            workflow step
          </button>
        </div>
      </div>

      <div className="ab-board">
        {cols.map((col) => (
          <BoardColumn
            key={col.id}
            col={col}
            tasks={grouped.get(col.id) ?? []}
            onOpen={handleOpen}
          />
        ))}
      </div>
    </div>
  );
}
