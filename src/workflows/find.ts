import { resolveWorkflowPaths } from "./discovery.js";
import { loadWorkflowFile } from "./load.js";
import type { Workflow } from "../domain/workflow.js";

export interface FindWorkflowOpts {
  repoRoot: string;
  home: string;
}

/** Resolves a workflow by id, scanning per-repo first then global. Returns null if no file's id field matches. */
export function findWorkflowById(opts: FindWorkflowOpts, id: string): Workflow | null {
  const paths = resolveWorkflowPaths(opts);
  for (const p of paths) {
    try {
      const workflow = loadWorkflowFile(p);
      if (workflow.id === id) return workflow;
    } catch {
      // skip malformed or missing files — discovery concern, not lookup concern
    }
  }
  return null;
}
