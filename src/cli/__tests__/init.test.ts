import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runInit } from "../init.js";
import { closeDb } from "../../db/connection.js";

let activeCwd: string | null = null;

function makeTmpDir(): string {
  const dir = join(tmpdir(), `agentboard-init-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  activeCwd = dir;
  return dir;
}

afterEach(() => {
  // closeDb() MUST run before rmSync — Windows refuses to unlink a held SQLite handle (EBUSY).
  closeDb();
  if (activeCwd) {
    rmSync(activeCwd, { recursive: true, force: true });
    activeCwd = null;
  }
});

describe("runInit", () => {
  it("creates .agentboard/ directory", () => {
    const cwd = makeTmpDir();
    runInit(cwd);
    expect(existsSync(join(cwd, ".agentboard"))).toBe(true);
  });

  it("creates db.sqlite via migration runner", () => {
    const cwd = makeTmpDir();
    runInit(cwd);
    expect(existsSync(join(cwd, ".agentboard", "db.sqlite"))).toBe(true);
  });

  it("appends db.sqlite to .gitignore when no .gitignore exists", () => {
    const cwd = makeTmpDir();
    runInit(cwd);
    const content = readFileSync(join(cwd, ".gitignore"), "utf8");
    expect(content).toContain(".agentboard/db.sqlite");
  });

  it("does not duplicate the gitignore entry on second run", () => {
    const cwd = makeTmpDir();
    runInit(cwd);
    closeDb();
    runInit(cwd);
    const content = readFileSync(join(cwd, ".gitignore"), "utf8");
    const occurrences = content.split(".agentboard/db.sqlite").length - 1;
    expect(occurrences).toBe(1);
  });

  it("appends to an existing .gitignore without clobbering existing entries", () => {
    const cwd = makeTmpDir();
    writeFileSync(join(cwd, ".gitignore"), "node_modules/\ndist/\n", "utf8");
    runInit(cwd);
    const content = readFileSync(join(cwd, ".gitignore"), "utf8");
    expect(content).toContain("node_modules/");
    expect(content).toContain("dist/");
    expect(content).toContain(".agentboard/db.sqlite");
  });

  it("is idempotent — second call does not throw", () => {
    const cwd = makeTmpDir();
    runInit(cwd);
    closeDb();
    expect(() => runInit(cwd)).not.toThrow();
  });

  it("copies coding-task.yaml into .agentboard/workflows/", () => {
    const cwd = makeTmpDir();
    runInit(cwd);
    expect(existsSync(join(cwd, ".agentboard", "workflows", "coding-task.yaml"))).toBe(true);
  });

  it("does not clobber an existing workflow file on second init", () => {
    const cwd = makeTmpDir();
    runInit(cwd);
    const dest = join(cwd, ".agentboard", "workflows", "coding-task.yaml");
    writeFileSync(dest, "# user edits", "utf8");
    closeDb();
    runInit(cwd);
    const content = readFileSync(dest, "utf8");
    expect(content).toBe("# user edits");
  });
});
