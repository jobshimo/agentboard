import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { findWorkflowById } from "../find.js";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agentboard-find-"));
}

const CODING_TASK_YAML = `
id: coding-task
label: Coding Task
steps:
  - id: implement
    label: Implement
    can_agent_complete_alone: true
`;

const REVIEW_TASK_YAML = `
id: review-task
label: Review Task
steps:
  - id: review
    label: Review
    can_agent_complete_alone: false
`;

// File named "other.yaml" but id field is "coding-task" — tests id-field lookup, not basename
const MISMATCH_YAML = `
id: coding-task
label: Coding Task (alt)
steps:
  - id: implement
    label: Implement
    can_agent_complete_alone: true
`;

const MALFORMED_YAML = "id: bad\nsteps:\n\t- id: x\n";

describe("findWorkflowById", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns the workflow when id matches a file's id field", () => {
    const globalDir = path.join(tmpDir, ".agentboard", "workflows");
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(path.join(globalDir, "coding-task.yaml"), CODING_TASK_YAML);

    const result = findWorkflowById({ repoRoot: tmpDir, home: tmpDir }, "coding-task");
    expect(result).not.toBeNull();
    expect(result?.id).toBe("coding-task");
  });

  it("returns null when no file has a matching id", () => {
    const globalDir = path.join(tmpDir, ".agentboard", "workflows");
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(path.join(globalDir, "coding-task.yaml"), CODING_TASK_YAML);

    const result = findWorkflowById({ repoRoot: tmpDir, home: tmpDir }, "nonexistent-wf");
    expect(result).toBeNull();
  });

  it("prefers per-repo over global when both have a workflow with the same id", () => {
    // Per-repo: single workflow.yaml (override semantics from resolveWorkflowPaths)
    const repoAgentboard = path.join(tmpDir, ".agentboard");
    fs.mkdirSync(repoAgentboard, { recursive: true });
    fs.writeFileSync(path.join(repoAgentboard, "workflow.yaml"), CODING_TASK_YAML);

    // Global dir also has a file with same id but different label
    const globalDir = path.join(tmpDir, "home", ".agentboard", "workflows");
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(path.join(globalDir, "other.yaml"), MISMATCH_YAML);

    const result = findWorkflowById({ repoRoot: tmpDir, home: path.join(tmpDir, "home") }, "coding-task");
    expect(result).not.toBeNull();
    // Both have id "coding-task"; per-repo path is first — resolveWorkflowPaths returns [repoOverride] exclusively
    expect(result?.id).toBe("coding-task");
    expect(result?.label).toBe("Coding Task");
  });

  it("skips a malformed file and finds the next valid one", () => {
    const globalDir = path.join(tmpDir, ".agentboard", "workflows");
    fs.mkdirSync(globalDir, { recursive: true });
    // Sorted: a-malformed.yaml < b-review-task.yaml
    fs.writeFileSync(path.join(globalDir, "a-malformed.yaml"), MALFORMED_YAML);
    fs.writeFileSync(path.join(globalDir, "b-review-task.yaml"), REVIEW_TASK_YAML);

    const result = findWorkflowById({ repoRoot: tmpDir, home: tmpDir }, "review-task");
    expect(result).not.toBeNull();
    expect(result?.id).toBe("review-task");
  });

  it("does not throw when encountering a malformed file", () => {
    const globalDir = path.join(tmpDir, ".agentboard", "workflows");
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(path.join(globalDir, "broken.yaml"), MALFORMED_YAML);

    expect(() => findWorkflowById({ repoRoot: tmpDir, home: tmpDir }, "any-id")).not.toThrow();
  });

  it("returns null when the workflow directory is empty", () => {
    const globalDir = path.join(tmpDir, ".agentboard", "workflows");
    fs.mkdirSync(globalDir, { recursive: true });

    const result = findWorkflowById({ repoRoot: tmpDir, home: tmpDir }, "coding-task");
    expect(result).toBeNull();
  });
});
