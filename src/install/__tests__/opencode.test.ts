import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "agentboard-opencode-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

async function makeAdapter(overridePath: string) {
  const { makeOpenCodeInstaller } = await import("../adapters/opencode.js");
  return makeOpenCodeInstaller(overridePath);
}

describe("OpenCode adapter - detect", () => {
  it("returns clientDetected:false when config file does not exist", async () => {
    const adapter = await makeAdapter(join(tmpDir, "opencode.json"));
    const result = await adapter.detect();
    expect(result.clientDetected).toBe(false);
    expect(result.registered).toBe(false);
  });

  it("returns clientDetected:true, registered:false when file exists but no agentboard entry", async () => {
    const configPath = join(tmpDir, "opencode.json");
    writeFileSync(configPath, JSON.stringify({ mcp: {} }));
    const adapter = await makeAdapter(configPath);
    const result = await adapter.detect();
    expect(result.clientDetected).toBe(true);
    expect(result.registered).toBe(false);
  });

  it("returns registered:true when mcp.agentboard is present", async () => {
    const configPath = join(tmpDir, "opencode.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        mcp: {
          agentboard: { type: "local", command: ["npx", "@jobshimo/agentboard", "mcp"] },
        },
      }),
    );
    const adapter = await makeAdapter(configPath);
    const result = await adapter.detect();
    expect(result.clientDetected).toBe(true);
    expect(result.registered).toBe(true);
  });
});

describe("OpenCode adapter - install", () => {
  it("creates config file with correct mcp.agentboard entry", async () => {
    const configPath = join(tmpDir, "opencode.json");
    const adapter = await makeAdapter(configPath);
    await adapter.install();

    const cfg = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    const mcp = cfg["mcp"] as Record<string, unknown>;
    const entry = mcp["agentboard"] as Record<string, unknown>;
    expect(entry["type"]).toBe("local");
    expect(entry["command"]).toEqual(["npx", "@jobshimo/agentboard", "mcp"]);
  });

  it("adds $schema to new config", async () => {
    const configPath = join(tmpDir, "opencode.json");
    const adapter = await makeAdapter(configPath);
    await adapter.install();

    const cfg = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    expect(cfg["$schema"]).toBe("https://opencode.ai/config.json");
  });

  it("preserves existing $schema when already set", async () => {
    const configPath = join(tmpDir, "opencode.json");
    writeFileSync(
      configPath,
      JSON.stringify({ $schema: "https://opencode.ai/config.json", mcp: {} }),
    );
    const adapter = await makeAdapter(configPath);
    await adapter.install();

    const cfg = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    expect(cfg["$schema"]).toBe("https://opencode.ai/config.json");
  });

  it("merges in-place — preserves other mcp entries", async () => {
    const configPath = join(tmpDir, "opencode.json");
    writeFileSync(
      configPath,
      JSON.stringify({ mcp: { "other-tool": { type: "local", command: ["other"] } } }),
    );
    const adapter = await makeAdapter(configPath);
    await adapter.install();

    const cfg = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    const mcp = cfg["mcp"] as Record<string, unknown>;
    expect(mcp["other-tool"]).toBeDefined();
    expect(mcp["agentboard"]).toBeDefined();
  });

  it("creates a backup when the file already existed", async () => {
    const configPath = join(tmpDir, "opencode.json");
    writeFileSync(configPath, JSON.stringify({ mcp: {} }));
    const adapter = await makeAdapter(configPath);
    const result = await adapter.install();
    expect(result.backupPath).not.toBeNull();
    expect(existsSync(result.backupPath!)).toBe(true);
  });

  it("does NOT create a backup when creating a new file", async () => {
    const configPath = join(tmpDir, "opencode.json");
    const adapter = await makeAdapter(configPath);
    const result = await adapter.install();
    expect(result.backupPath).toBeNull();
  });

  it("dry-run: does not write the file", async () => {
    const configPath = join(tmpDir, "opencode.json");
    const adapter = await makeAdapter(configPath);
    await adapter.install({ dryRun: true });
    expect(existsSync(configPath)).toBe(false);
  });
});

describe("OpenCode adapter - uninstall", () => {
  it("removes mcp.agentboard from config", async () => {
    const configPath = join(tmpDir, "opencode.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        mcp: {
          agentboard: { type: "local", command: ["npx", "@jobshimo/agentboard", "mcp"] },
          other: { type: "local", command: ["other"] },
        },
      }),
    );
    const adapter = await makeAdapter(configPath);
    const result = await adapter.uninstall();
    expect(result.ok).toBe(true);

    const cfg = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    const mcp = cfg["mcp"] as Record<string, unknown>;
    expect(mcp["agentboard"]).toBeUndefined();
    expect(mcp["other"]).toBeDefined();
  });

  it("is idempotent when entry not present", async () => {
    const configPath = join(tmpDir, "opencode.json");
    writeFileSync(configPath, JSON.stringify({ mcp: {} }));
    const adapter = await makeAdapter(configPath);
    const result = await adapter.uninstall();
    expect(result.ok).toBe(true);
  });

  it("is safe when file does not exist", async () => {
    const configPath = join(tmpDir, "opencode.json");
    const adapter = await makeAdapter(configPath);
    const result = await adapter.uninstall();
    expect(result.ok).toBe(true);
  });
});
