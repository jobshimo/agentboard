// SubtaskRow — detail view row. Mirrors components.jsx SubtaskRow 1:1.
// Click state dot → advance via REST PATCH (optimistic via UPSERT_SUBTASK).
// Shows: state dot (lg), label, custom badge, triggered_by chip, human chip, trailing note.

import type { MouseEvent } from "react";
import { StateDot } from "./StateDot";
import { dispatch } from "../lib/store";
import { patchSubtask } from "../lib/api";
import type { SubtaskCompact } from "../lib/api";
import { resolveSubtaskLabel } from "../lib/task-detail-helpers";

// Valid advance transitions per domain/subtask.ts state machine.
// Clicking the dot advances: pending → in-progress → done.
const ADVANCE: Record<string, SubtaskCompact["status"]> = {
  pending: "in-progress",
  "in-progress": "done",
};

interface SubtaskRowProps {
  subtask: SubtaskCompact;
  active?: boolean;
  custom?: boolean;
  requiresHuman?: boolean;
}

export function SubtaskRow({ subtask, active = false, custom = false, requiresHuman = false }: SubtaskRowProps) {
  const label = resolveSubtaskLabel(subtask);

  // Clicking the dot advances the status (if there's a valid next state).
  async function handleDotClick(e: MouseEvent<HTMLSpanElement>) {
    e.stopPropagation();
    const next = ADVANCE[subtask.status];
    if (!next) return;
    try {
      const updated = await patchSubtask(subtask.id, { status: next });
      dispatch({ type: "UPSERT_SUBTASK", taskId: subtask.task_id, subtask: updated });
    } catch {
      // Non-fatal: UI stays in sync on next WS push.
    }
  }

  // Show the note artifact for done commit/open-pr rows, or subdued for others.
  const showArtifact = subtask.note && (subtask.status === "done" || subtask.type === "commit" || subtask.type === "open-pr");
  const showMuted = subtask.note && !showArtifact;

  return (
    <div
      className="subtask-row"
      data-state={subtask.status}
      data-active={active ? "true" : "false"}
    >
      {/* Clicking the dot advances state — matches notes.jsx "click to advance" UX decision */}
      <span onClick={handleDotClick} style={{ cursor: ADVANCE[subtask.status] ? "pointer" : "default" }}>
        <StateDot state={subtask.status} size="lg" />
      </span>
      <div className="subtask-label">
        <span className="name">{label}</span>
        {custom && <span className="custom-badge">custom</span>}
        {subtask.triggered_by && (
          <span className="chip mono" title={`Triggered by ${subtask.triggered_by}`}>
            on {subtask.triggered_by}
          </span>
        )}
        {requiresHuman && !custom && (
          <span className="chip" data-tone="warning" title="can_agent_complete_alone: false">
            human
          </span>
        )}
      </div>
      <div className="subtask-trailing">
        {showArtifact ? (
          <span className="subtask-artifact mono">
            {subtask.type === "open-pr" ? "PR " : null}
            {subtask.note}
          </span>
        ) : showMuted ? (
          <span className="mono" style={{ color: "var(--fg-subtle)" }}>{subtask.note}</span>
        ) : null}
      </div>
    </div>
  );
}

