import type { DiscussionEntry } from "../domain/discussion.js";

export interface SubtaskView {
  id: string;
  label: string | null;
  status: string;
  note: string | null;
  custom: boolean;
}

export interface TaskFullView {
  id: string;
  title: string;
  type: "referenced" | "local";
  derivedStatus: string;
  refSource?: string | null;
  refId?: string | null;
  refUrl?: string | null;
  workflowId: string;
  createdAt: string;
  closedAt?: string | null;
  subtasks: SubtaskView[];
  discussion: DiscussionEntry[];
}

function statusGlyph(status: string): string {
  const glyphs: Record<string, string> = {
    pending: "○",
    "in-progress": "◑",
    done: "●",
    blocked: "⊘",
    failed: "✕",
    skipped: "—",
  };
  return glyphs[status] ?? "?";
}

function renderHeader(task: TaskFullView): string {
  const lines: string[] = [];
  lines.push(`# ${task.title}`);
  lines.push("");
  lines.push(`**ID**: ${task.id}`);
  lines.push(`**Status**: ${task.derivedStatus}`);
  lines.push(`**Type**: ${task.type}`);
  lines.push(`**Workflow**: ${task.workflowId}`);
  lines.push(`**Created**: ${task.createdAt}`);

  if (task.closedAt) {
    lines.push(`**Closed**: ${task.closedAt}`);
  }

  if (task.refSource && task.refId) {
    const link = task.refUrl
      ? `[${task.refId}](${task.refUrl})`
      : task.refId;
    lines.push(`**Reference**: ${task.refSource} ${link}`);
  }

  return lines.join("\n");
}

function renderSubtasks(subtasks: SubtaskView[]): string {
  if (subtasks.length === 0) return "";

  const lines: string[] = [];
  lines.push("## Subtasks");
  lines.push("");

  for (const s of subtasks) {
    const glyph = statusGlyph(s.status);
    const custom = s.custom ? " *(custom)*" : "";
    lines.push(`- ${glyph} **${s.label ?? ""}**${custom} \`${s.status}\``);
    if (s.note) {
      lines.push(`  > ${s.note}`);
    }
  }

  return lines.join("\n");
}

function renderDiscussion(entries: DiscussionEntry[]): string {
  if (entries.length === 0) return "";

  const lines: string[] = [];
  lines.push("## Discussion");
  lines.push("");

  for (const e of entries) {
    lines.push(`**${e.author}** — ${e.createdAt}`);
    lines.push("");
    lines.push(e.body);
    lines.push("");
  }

  // Remove trailing blank line from the last entry
  while (lines.length > 0 && lines.at(-1) === "") {
    lines.pop();
  }

  return lines.join("\n");
}

export function renderTaskMarkdown(task: TaskFullView): string {
  const sections = [
    renderHeader(task),
    renderSubtasks(task.subtasks),
    renderDiscussion(task.discussion),
  ].filter((s) => s.length > 0);

  return sections.join("\n\n") + "\n";
}
