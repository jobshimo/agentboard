import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readLanguage, writeLanguage } from "../lang-config.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "agentboard-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("readLanguage", () => {
  it("returns 'en' when config.yaml does not exist", () => {
    expect(readLanguage(tmpDir)).toBe("en");
  });

  it("returns 'en' when config.yaml has no language field", () => {
    writeFileSync(join(tmpDir, "config.yaml"), "server:\n  port: 7733\n");
    expect(readLanguage(tmpDir)).toBe("en");
  });

  it("returns 'es' when config.yaml has language: es", () => {
    writeFileSync(join(tmpDir, "config.yaml"), "language: es\n");
    expect(readLanguage(tmpDir)).toBe("es");
  });

  it("returns 'en' when config.yaml has language: en", () => {
    writeFileSync(join(tmpDir, "config.yaml"), "language: en\n");
    expect(readLanguage(tmpDir)).toBe("en");
  });

  it("returns 'en' when config.yaml has an unknown language value", () => {
    writeFileSync(join(tmpDir, "config.yaml"), "language: fr\n");
    expect(readLanguage(tmpDir)).toBe("en");
  });
});

describe("writeLanguage", () => {
  it("creates config.yaml with language field when file does not exist", () => {
    writeLanguage(tmpDir, "es");
    const content = readFileSync(join(tmpDir, "config.yaml"), "utf8");
    expect(content).toContain("language: es");
  });

  it("creates parent directory if it does not exist", () => {
    const nested = join(tmpDir, "nested", "dir");
    writeLanguage(nested, "en");
    const content = readFileSync(join(nested, "config.yaml"), "utf8");
    expect(content).toContain("language: en");
  });

  it("adds language field to existing config.yaml without clobbering other keys", () => {
    writeFileSync(join(tmpDir, "config.yaml"), "server:\n  port: 7733\n");
    writeLanguage(tmpDir, "es");
    const content = readFileSync(join(tmpDir, "config.yaml"), "utf8");
    expect(content).toContain("language: es");
    expect(content).toContain("port: 7733");
  });

  it("updates existing language field in place", () => {
    writeFileSync(join(tmpDir, "config.yaml"), "language: en\n");
    writeLanguage(tmpDir, "es");
    const content = readFileSync(join(tmpDir, "config.yaml"), "utf8");
    expect(content).toContain("language: es");
    expect(content).not.toContain("language: en");
  });
});
