// Workflows section — lists installed workflow templates from GET /api/workflows.
// Ported 1:1 from agentboard/settings.jsx "Workflows" block.

import { ListIcon } from "../../icons";
import type { WorkflowSummary } from "../../lib/api";
import { en } from "../../i18n/en";

const WF_COLORS = ["#58a6ff", "#3fb950", "#a371f7", "#d29922", "#f85149", "#79c0ff"];

function wfColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return WF_COLORS[hash % WF_COLORS.length] ?? WF_COLORS[0]!;
}

interface Props {
  workflows: WorkflowSummary[];
}

export function WorkflowsSection({ workflows }: Props) {
  return (
    <div className="settings-block">
      <h3><ListIcon sz={14} /> {en.settings_workflows_title}</h3>
      <p className="desc">{en.settings_workflows_desc}</p>
      {workflows.length === 0 && (
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          {en.settings_workflows_empty}
        </p>
      )}
      {workflows.map(wf => (
        <WorkflowCard key={wf.id} workflow={wf} />
      ))}
    </div>
  );
}

function WorkflowCard({ workflow: wf }: { workflow: WorkflowSummary }) {
  const humanSteps = wf.steps.filter(s => s.can_agent_complete_alone === false).length;

  return (
    <div className="workflow-card">
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="swatch" style={{ width: 8, height: 8, borderRadius: 2, background: wfColor(wf.id), flexShrink: 0 }} />
          <span className="name">{wf.label}</span>
          <span className="id">{wf.id}</span>
        </div>
        <div className="meta">
          {wf.steps.length} step{wf.steps.length !== 1 ? "s" : ""}{humanSteps > 0 ? ` · ${humanSteps} require human` : ""}
        </div>
        <div className="steps">
          {wf.steps.map(s => (
            <span key={s.id} className="step" title={s.label}>{s.id}</span>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "start" }}>
        <button className="btn small ghost">{en.settings_workflow_btn_open}</button>
        <button className="btn small">{en.settings_workflow_btn_copy}</button>
      </div>
    </div>
  );
}
