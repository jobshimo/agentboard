import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdirSync, existsSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runInit, seedUserWorkflows } from "../init.js";
import { closeDb } from "../../db/connection.js";

let activeCwd: string | null = null;
let activeHome: string | null = null;

function makeTmpDir(prefix = "agentboard-init-test"): string {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeCwd(): string {
  const dir = makeTmpDir();
  activeCwd = dir;
  return dir;
}

function makeHome(): string {
  const dir = makeTmpDir("agentboard-home-test");
  activeHome = dir;
  return dir;
}

/** Seed a home dir with one workflow yaml so runInit can copy it. */
function seedGlobalWorkflow(home: string, filename = "coding-task.yaml", content = "id: test\nlabel: Test\nsteps: []\n"): void {
  const globalDir = join(home, ".agentboard", "workflows");
  mkdirSync(globalDir, { recursive: true });
  writeFileSync(join(globalDir, filename), content, "utf8");
}

afterEach(() => {
  closeDb();
  if (activeCwd) {
    rmSync(activeCwd, { recursive: true, force: true });
    activeCwd = null;
  }
  if (activeHome) {
    rmSync(activeHome, { recursive: true, force: true });
    activeHome = null;
  }
  vi.restoreAllMocks();
});

describe("runInit", () => {
  it("creates .agentboard/ directory", () => {
    const cwd = makeCwd();
    const home = makeHome();
    seedGlobalWorkflow(home);
    runInit(cwd, home);
    expect(existsSync(join(cwd, ".agentboard"))).toBe(true);
  });

  it("creates db.sqlite via migration runner", () => {
    const cwd = makeCwd();
    const home = makeHome();
    seedGlobalWorkflow(home);
    runInit(cwd, home);
    expect(existsSync(join(cwd, ".agentboard", "db.sqlite"))).toBe(true);
  });

  it("appends db.sqlite to .gitignore when no .gitignore exists", () => {
    const cwd = makeCwd();
    const home = makeHome();
    seedGlobalWorkflow(home);
    runInit(cwd, home);
    const content = readFileSync(join(cwd, ".gitignore"), "utf8");
    expect(content).toContain(".agentboard/db.sqlite");
  });

  it("does not duplicate the gitignore entry on two separate inits", () => {
    const cwd = makeCwd();
    const home = makeHome();
    seedGlobalWorkflow(home);
    runInit(cwd, home);
    closeDb();

    // Second init: dest workflow.yaml already exists → process.exit(1)
    // We only check gitignore here — mock exit to avoid killing test process
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: string | number | null | undefined) => { throw new Error("exit"); });
    expect(() => runInit(cwd, home)).toThrow("exit");
    exitSpy.mockRestore();

    const content = readFileSync(join(cwd, ".gitignore"), "utf8");
    const occurrences = content.split(".agentboard/db.sqlite").length - 1;
    expect(occurrences).toBe(1);
  });

  it("appends to an existing .gitignore without clobbering existing entries", () => {
    const cwd = makeCwd();
    const home = makeHome();
    seedGlobalWorkflow(home);
    writeFileSync(join(cwd, ".gitignore"), "node_modules/\ndist/\n", "utf8");
    runInit(cwd, home);
    const content = readFileSync(join(cwd, ".gitignore"), "utf8");
    expect(content).toContain("node_modules/");
    expect(content).toContain("dist/");
    expect(content).toContain(".agentboard/db.sqlite");
  });

  it("copies first global workflow file to .agentboard/workflow.yaml (singular)", () => {
    const cwd = makeCwd();
    const home = makeHome();
    seedGlobalWorkflow(home, "my-flow.yaml", "id: my-flow\nlabel: My\nsteps: []\n");
    runInit(cwd, home);
    expect(existsSync(join(cwd, ".agentboard", "workflow.yaml"))).toBe(true);
    const content = readFileSync(join(cwd, ".agentboard", "workflow.yaml"), "utf8");
    expect(content).toContain("id: my-flow");
  });

  it("refuses to overwrite an existing workflow.yaml — exits non-zero", () => {
    const cwd = makeCwd();
    const home = makeHome();
    seedGlobalWorkflow(home);
    runInit(cwd, home);
    closeDb();

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: string | number | null | undefined) => { throw new Error("exit"); });
    expect(() => runInit(cwd, home)).toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("does not clobber existing workflow.yaml content on second init", () => {
    const cwd = makeCwd();
    const home = makeHome();
    seedGlobalWorkflow(home);
    runInit(cwd, home);
    closeDb();

    const dest = join(cwd, ".agentboard", "workflow.yaml");
    const originalContent = readFileSync(dest, "utf8");

    // Even if exit is mocked, the file must not be overwritten
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: string | number | null | undefined) => { throw new Error("exit"); });
    try { runInit(cwd, home); } catch { /* expected */ }
    exitSpy.mockRestore();

    expect(readFileSync(dest, "utf8")).toBe(originalContent);
  });

  it("exits non-zero when global workflows directory does not exist", () => {
    const cwd = makeCwd();
    const home = makeHome();
    // No global workflows dir seeded
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: string | number | null | undefined) => { throw new Error("exit"); });
    expect(() => runInit(cwd, home)).toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("exits non-zero when global workflows directory is empty", () => {
    const cwd = makeCwd();
    const home = makeHome();
    mkdirSync(join(home, ".agentboard", "workflows"), { recursive: true });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: string | number | null | undefined) => { throw new Error("exit"); });
    expect(() => runInit(cwd, home)).toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});

describe("seedUserWorkflows", () => {
  it("creates ~/.agentboard/workflows/ and copies bundled template when dir does not exist", () => {
    const home = makeHome();
    seedUserWorkflows(home);
    expect(existsSync(join(home, ".agentboard", "workflows"))).toBe(true);
  });

  it("is a no-op when ~/.agentboard/workflows/ already exists", () => {
    const home = makeHome();
    const globalDir = join(home, ".agentboard", "workflows");
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(join(globalDir, "existing.yaml"), "# custom", "utf8");
    seedUserWorkflows(home);
    // existing file should still be there, only file
    const files = readdirSync(globalDir);
    expect(files).toContain("existing.yaml");
    // bundled template was NOT copied (dir existed)
    expect(files).not.toContain("coding-task.yaml");
  });
});
