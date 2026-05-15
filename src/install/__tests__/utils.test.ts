import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  backupFile,
  atomicWriteJson,
  readJsonFile,
} from "../utils.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "agentboard-install-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("backupFile", () => {
  it("creates a .bak.<timestamp> copy of an existing file", async () => {
    const file = join(tmpDir, "test.json");
    writeFileSync(file, '{"hello":"world"}');

    const bakPath = await backupFile(file);
    expect(bakPath).not.toBeNull();
    expect(bakPath!).toMatch(/\.bak\.\d{4}-\d{2}-\d{2}T/);
    expect(existsSync(bakPath!)).toBe(true);
    expect(readFileSync(bakPath!, "utf8")).toBe('{"hello":"world"}');
  });

  it("returns null when the file does not exist", async () => {
    const bakPath = await backupFile(join(tmpDir, "nonexistent.json"));
    expect(bakPath).toBeNull();
  });
});

describe("atomicWriteJson", () => {
  it("writes JSON with 2-space indent + trailing newline", async () => {
    const file = join(tmpDir, "output.json");
    await atomicWriteJson(file, { key: "value", nested: { a: 1 } });

    const content = readFileSync(file, "utf8");
    expect(content).toBe(JSON.stringify({ key: "value", nested: { a: 1 } }, null, 2) + "\n");
  });

  it("creates parent directories if needed", async () => {
    const file = join(tmpDir, "deep", "nested", "output.json");
    await atomicWriteJson(file, { ok: true });
    expect(existsSync(file)).toBe(true);
  });

  it("replaces an existing file atomically (no tmp file left behind)", async () => {
    const file = join(tmpDir, "existing.json");
    writeFileSync(file, '{"old":true}');
    await atomicWriteJson(file, { new: true });

    const content = readFileSync(file, "utf8");
    expect(content).toContain('"new": true');

    // No tmp files left
    const { readdirSync } = await import("node:fs");
    const files = readdirSync(tmpDir);
    const tmpFiles = files.filter((f) => f.includes(".tmp."));
    expect(tmpFiles).toHaveLength(0);
  });
});

describe("readJsonFile", () => {
  it("returns null when file does not exist", () => {
    expect(readJsonFile(join(tmpDir, "missing.json"))).toBeNull();
  });

  it("returns parsed JSON when file exists", () => {
    const file = join(tmpDir, "data.json");
    writeFileSync(file, '{"hello":"world"}');
    expect(readJsonFile(file)).toEqual({ hello: "world" });
  });

  it("throws on malformed JSON", () => {
    const file = join(tmpDir, "bad.json");
    writeFileSync(file, "not json {");
    expect(() => readJsonFile(file)).toThrow();
  });
});
