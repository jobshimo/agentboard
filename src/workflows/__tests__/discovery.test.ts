import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveWorkflowPaths } from "../discovery.js";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agentboard-discovery-"));
}

describe("resolveWorkflowPaths", () => {
  let tmpRepo: string;
  let tmpHome: string;

  beforeEach(() => {
    tmpRepo = makeTmpDir();
    tmpHome = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("returns empty array when neither repo override nor global dir exists", () => {
    const paths = resolveWorkflowPaths({ repoRoot: tmpRepo, home: tmpHome });
    expect(paths).toEqual([]);
  });

  it("returns global yaml files when only global dir exists", () => {
    const globalDir = path.join(tmpHome, ".agentboard", "workflows");
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(path.join(globalDir, "coding-task.yaml"), "id: coding-task\n");
    fs.writeFileSync(path.join(globalDir, "review.yaml"), "id: review\n");

    const result = resolveWorkflowPaths({ repoRoot: tmpRepo, home: tmpHome });
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.endsWith(".yaml"))).toBe(true);
  });

  it("returns only the repo override when it exists, ignoring global dir", () => {
    const globalDir = path.join(tmpHome, ".agentboard", "workflows");
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(path.join(globalDir, "global.yaml"), "id: global\n");

    const repoAgentboardDir = path.join(tmpRepo, ".agentboard");
    fs.mkdirSync(repoAgentboardDir, { recursive: true });
    const repoOverride = path.join(repoAgentboardDir, "workflow.yaml");
    fs.writeFileSync(repoOverride, "id: local\n");

    const result = resolveWorkflowPaths({ repoRoot: tmpRepo, home: tmpHome });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(repoOverride);
  });

  it("returns only the repo override even when global dir is absent", () => {
    const repoAgentboardDir = path.join(tmpRepo, ".agentboard");
    fs.mkdirSync(repoAgentboardDir, { recursive: true });
    const repoOverride = path.join(repoAgentboardDir, "workflow.yaml");
    fs.writeFileSync(repoOverride, "id: local\n");

    const result = resolveWorkflowPaths({ repoRoot: tmpRepo, home: tmpHome });
    expect(result).toEqual([repoOverride]);
  });

  it("returns empty array when global dir exists but contains no yaml files", () => {
    const globalDir = path.join(tmpHome, ".agentboard", "workflows");
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(path.join(globalDir, "README.md"), "# docs\n");

    const result = resolveWorkflowPaths({ repoRoot: tmpRepo, home: tmpHome });
    expect(result).toEqual([]);
  });

  it("sorts global yaml files alphabetically", () => {
    const globalDir = path.join(tmpHome, ".agentboard", "workflows");
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(path.join(globalDir, "z-last.yaml"), "");
    fs.writeFileSync(path.join(globalDir, "a-first.yaml"), "");
    fs.writeFileSync(path.join(globalDir, "m-middle.yaml"), "");

    const result = resolveWorkflowPaths({ repoRoot: tmpRepo, home: tmpHome });
    const names = result.map((p) => path.basename(p));
    expect(names).toEqual(["a-first.yaml", "m-middle.yaml", "z-last.yaml"]);
  });
});
