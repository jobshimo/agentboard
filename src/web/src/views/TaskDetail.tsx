// TaskDetail — full-page replacement view. Mirrors agentboard/detail.jsx 1:1.
// Left: workflow snapshot (immutable) + custom subtasks.
// Right: discussion thread + composer.

import { useState } from "react";
import { ArrowLeft, Lock, Info, Send, MoreH } from "../icons";
import { ExternalRefChip } from "../components/ExternalRefChip";
import { StatusBadge } from "../components/StatusBadge";
import { SubtaskRow } from "../components/SubtaskRow";
import { DiscussionThread } from "./detail/DiscussionThread";
import { CommentForm } from "./detail/CommentForm";
import { FeedbackForm } from "./detail/FeedbackForm";
import { AddCustomSubtaskForm } from "./detail/AddCustomSubtaskForm";
import { useTaskDetailData } from "../lib/useTaskDetailData";
import { currentSubtask, partitionSubtasks } from "../lib/task-detail-helpers";
import type { SubtaskCompact } from "../lib/api";
import { en } from "../i18n/en";

interface TaskDetailProps {
  taskId: string;
  onBack: () => void;
}

// Workflow snapshot metadata is embedded in task.workflow_snapshot (YAML-parsed object).
// The backend stores the full WorkflowFile JSON there.
interface WorkflowSnapshot {
  id: string;
  label?: string;
  version?: string;
  steps?: Array<{ id: string; can_agent_complete_alone?: boolean }>;
}

function parseSnapshot(raw: unknown): WorkflowSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as WorkflowSnapshot;
}

export function TaskDetail({ taskId, onBack }: TaskDetailProps) {
  const { task, discussion } = useTaskDetailData(taskId);
  const [showFeedback, setShowFeedback] = useState(false);

  if (!task) {
    return (
      <div className="ab-detail">
        <div className="ab-detail-head">
          <button className="ab-back" onClick={onBack}>
            <ArrowLeft sz={12} /> Board
          </button>
          <span className="muted mono" style={{ fontSize: 12 }}>{taskId}</span>
        </div>
        <div className="empty">
          <div className="empty-inner">
            <p className="muted">{en.loading}</p>
          </div>
        </div>
      </div>
    );
  }

  const wf = parseSnapshot(task.workflow_snapshot);
  const { snapshot: snapshotSubtasks, custom: customSubtasks } = partitionSubtasks(task.subtasks);

  // Determine if a snapshot subtask's step requires human.
  function requiresHuman(subtask: SubtaskCompact): boolean {
    if (!wf?.steps) return false;
    const step = wf.steps.find(x => x.id === subtask.step_id);
    return step?.can_agent_complete_alone === false;
  }

  const refData = task.ref_id
    ? { source: task.ref_source ?? "local", id: task.ref_id, url: task.ref_url }
    : null;

  const activeSubtask = currentSubtask(task);

  return (
    <div className="ab-detail" style={{ display: "grid", gridTemplateRows: "auto auto 1fr", height: "100%" }}>
      {/* Header row */}
      <div className="ab-detail-head">
        <button className="ab-back" onClick={onBack}>
          <ArrowLeft sz={12} /> Board
        </button>
        <div className="ab-detail-title-row">
          {refData && <ExternalRefChip refData={refData} />}
          <span className="muted mono" style={{ fontSize: 11 }}>{task.id}</span>
          <h1 className="ab-detail-title">{task.title}</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusBadge derived_status={task.derived_status} />
          <button className="ab-iconbtn" aria-label={en.detail_aria_more}><MoreH sz={14} /></button>
        </div>
      </div>

      {/* Sub-bar: workflow metadata + action buttons */}
      <div className="ab-detail-sub">
        <span>
          <span className="muted">{en.detail_workflow}</span>{" · "}
          <span className="mono">{wf?.label || task.workflow_id}</span>
        </span>
        {wf && <>
          <span className="muted">·</span>
          <span>
            <span className="muted">{en.detail_snapshot}</span>{" · "}
            <span className="mono">{wf.id}{wf.version ? `@${wf.version}` : ""}</span>
          </span>
        </>}
        {task.snapshot_taken_at && <>
          <span className="muted">·</span>
          <span>
            <span className="muted">{en.detail_snapshot_taken}</span>{" · "}
            <span className="mono">{new Date(task.snapshot_taken_at).toLocaleDateString()}</span>
          </span>
        </>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button className="btn small ghost" onClick={() => setShowFeedback(f => !f)}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Send sz={11} /> {en.detail_feedback_btn}
            </span>
          </button>
          <button className="btn small">{en.detail_close_task}</button>
        </div>
      </div>

      {/* Body: two-column layout */}
      <div className="ab-detail-body">
        {/* Left column: workflow snapshot + custom subtasks */}
        <div className="ab-detail-left">
          {/* Workflow snapshot section */}
          <div>
            <div className="h-row">
              <h3>{en.detail_section_workflow_snapshot}</h3>
              <span className="chip" data-tone="skipped" title="The workflow snapshot is locked for an in-flight task.">
                <Lock sz={10} /> {en.detail_snapshot_chip}
              </span>
            </div>
            {wf && (
              <div className="wf-meta">
                <Lock sz={11} className="lock" />
                <span>
                  {en.detail_snapshot_locked_prefix}{" "}<span className="mono">{wf.id}{wf.version ? `@${wf.version}` : ""}</span>
                  {task.snapshot_taken_at && (
                    <> · {en.detail_snapshot_taken_prefix}{" "}<span className="mono">{new Date(task.snapshot_taken_at).toLocaleDateString()}</span></>
                  )}
                </span>
              </div>
            )}
            <div className="subtask-list">
              {snapshotSubtasks.map(s => (
                <SubtaskRow
                  key={s.id}
                  subtask={s}
                  active={s === activeSubtask}
                  requiresHuman={requiresHuman(s)}
                />
              ))}
            </div>
          </div>

          {/* Custom subtasks section */}
          <div>
            <div className="h-row">
              <h3>{en.detail_section_custom_subtasks}</h3>
              <span className="muted mono" style={{ fontSize: 11 }}>{en.detail_outside_snapshot}</span>
            </div>
            <div className="subtask-list">
              {customSubtasks.map(s => (
                <SubtaskRow key={s.id} subtask={s} custom />
              ))}
              <AddCustomSubtaskForm taskId={taskId} />
            </div>
          </div>

          {/* Inline help — immutability explanation */}
          <div className="banner" data-tone="info">
            <Info sz={13} className="icon" />
            <span>{en.detail_immutability_note}</span>
          </div>

          {/* Feedback form — shown inline below the info banner */}
          {showFeedback && (
            <FeedbackForm taskId={taskId} onClose={() => setShowFeedback(false)} />
          )}
        </div>

        {/* Right column: discussion + composer */}
        <div className="ab-detail-right">
          <DiscussionThread entries={discussion} />
          <CommentForm taskId={taskId} />
        </div>
      </div>
    </div>
  );
}
