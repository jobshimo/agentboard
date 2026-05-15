import type Database from "better-sqlite3";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listTasks, getTaskSubtasks } from "../domain/task.js";
import { getEntries } from "../domain/discussion.js";
import { renderTaskMarkdown } from "./markdown.js";

type Db = InstanceType<typeof Database>;

export interface ExportResult {
  path: string;
  count: number;
}

// Shared by REST POST /api/export and the CLI `agentboard export` command.
// Writes one .md file per task under <outputDir>/ and returns the count + path.
export function runExportSnapshot(db: Db, outputDir: string): ExportResult {
  mkdirSync(outputDir, { recursive: true });

  const tasks = listTasks(db);

  for (const task of tasks) {
    const subtasks = getTaskSubtasks(db, task.id);
    const discussionResult = getEntries(db, task.id);
    const discussion =
      discussionResult.type === "entries" ? discussionResult.entries : [];

    const md = renderTaskMarkdown({
      id: task.id,
      title: task.title,
      type: task.type as "referenced" | "local",
      derivedStatus: task.derived_status,
      refSource: task.ref_source,
      refId: task.ref_id,
      refUrl: task.ref_url,
      workflowId: task.workflow_id,
      createdAt: task.created_at,
      closedAt: task.closed_at,
      subtasks: subtasks.map((s) => ({
        id: s.id,
        label: s.label,
        status: s.status,
        note: s.note,
        custom: s.custom === 1,
      })),
      discussion,
    });

    writeFileSync(join(outputDir, `${task.id}.md`), md, "utf8");
  }

  return { path: outputDir, count: tasks.length };
}
