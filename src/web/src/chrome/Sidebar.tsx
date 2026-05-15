// Ported from agentboard/chrome.jsx — Sidebar component.
// Receives task counts and workflow list from App.

import type { ViewName } from "../lib/store";
import { ListIcon, Inbox, Archive, Plus, Gear, TerminalIcon } from "../icons";
import { OriginGlyph } from "../icons";
import { en } from "../i18n/en";

export interface WorkflowSummary {
  id: string;
  label: string;
}

export interface TaskCounts {
  all: number;
  done: number;
  byWorkflow: Record<string, number>;
  byRef: { github: number; jira: number; linear: number; local: number };
}

interface SidebarProps {
  activeView: ViewName;
  onPickView: (v: ViewName) => void;
  workflowFilter: string | null;
  onSetWorkflowFilter: (id: string | null) => void;
  workflows: WorkflowSummary[];
  taskCounts: TaskCounts;
}

function wfColor(id: string): string {
  const colors: Record<string, string> = {
    feature:  "var(--accent-fg)",
    hotfix:   "var(--danger-fg)",
    refactor: "var(--done-fg)",
    spike:    "var(--warning-fg)",
  };
  return colors[id] ?? "var(--fg-muted)";
}

export function Sidebar({
  activeView,
  onPickView,
  workflowFilter,
  onSetWorkflowFilter,
  workflows,
  taskCounts,
}: SidebarProps) {
  return (
    <aside className="ab-sidebar">
      <div className="ab-side-section">
        <div className="ab-side-label">{en.sidebar_views}</div>
        <div
          className="ab-side-item"
          data-active={String(activeView === "board")}
          onClick={() => onPickView("board")}
        >
          <ListIcon sz={13} /> {en.sidebar_board}
          <span className="count">{taskCounts.all}</span>
        </div>
        <div className="ab-side-item">
          <Inbox sz={13} /> {en.sidebar_all_tasks}
          <span className="count">{taskCounts.all}</span>
        </div>
        <div className="ab-side-item">
          <Archive sz={13} /> {en.sidebar_closed}
          <span className="count">{taskCounts.done}</span>
        </div>
      </div>

      <div className="ab-side-section">
        <div className="ab-side-label">
          <span>{en.sidebar_workflows}</span>
          <Plus sz={11} />
        </div>
        {workflows.map(wf => (
          <div
            key={wf.id}
            className="ab-side-item"
            data-active={String(workflowFilter === wf.id)}
            onClick={() => onSetWorkflowFilter(workflowFilter === wf.id ? null : wf.id)}
          >
            <span className="swatch" style={{ background: wfColor(wf.id) }} />
            {wf.label}
            <span className="count">{taskCounts.byWorkflow[wf.id] ?? 0}</span>
          </div>
        ))}
      </div>

      <div className="ab-side-section">
        <div className="ab-side-label">{en.sidebar_references}</div>
        <div className="ab-side-item">
          <OriginGlyph source="github" /> {en.ref_github}
          <span className="count">{taskCounts.byRef.github}</span>
        </div>
        <div className="ab-side-item">
          <OriginGlyph source="jira" /> {en.ref_jira}
          <span className="count">{taskCounts.byRef.jira}</span>
        </div>
        <div className="ab-side-item">
          <OriginGlyph source="linear" /> {en.ref_linear}
          <span className="count">{taskCounts.byRef.linear}</span>
        </div>
        <div className="ab-side-item">
          <OriginGlyph source="local" /> {en.ref_local}
          <span className="count">{taskCounts.byRef.local}</span>
        </div>
      </div>

      <div className="ab-side-section" style={{ marginTop: "auto" }}>
        <div
          className="ab-side-item"
          data-active={String(activeView === "settings")}
          onClick={() => onPickView("settings")}
        >
          <Gear sz={13} /> {en.sidebar_settings}
        </div>
        <div className="ab-side-item">
          <TerminalIcon sz={13} /> {en.sidebar_mcp_endpoint}
        </div>
      </div>
    </aside>
  );
}
