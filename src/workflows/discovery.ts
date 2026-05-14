import path from "node:path";
import fs from "node:fs";

export interface WorkflowDiscoveryOpts {
  /** Absolute path to the repo root (cwd at server start). */
  repoRoot: string;
  /** Absolute path to the user's home directory (e.g. os.homedir()). */
  home: string;
}

/**
 * Returns all workflow YAML file paths to load, applying override semantics:
 * if <repoRoot>/.agentboard/workflow.yaml exists, it is returned exclusively.
 * Otherwise all *.yaml files from <home>/.agentboard/workflows/ are returned.
 *
 * Returns an empty array when neither location exists.
 */
export function resolveWorkflowPaths(opts: WorkflowDiscoveryOpts): string[] {
  const repoOverride = path.join(opts.repoRoot, ".agentboard", "workflow.yaml");

  if (fs.existsSync(repoOverride)) {
    return [repoOverride];
  }

  const globalDir = path.join(opts.home, ".agentboard", "workflows");

  if (!fs.existsSync(globalDir)) {
    return [];
  }

  return fs
    .readdirSync(globalDir)
    .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
    .map((name) => path.join(globalDir, name))
    .sort();
}
