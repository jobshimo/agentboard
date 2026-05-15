import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tmpDir: string;

// We'll override the config file path by monkey-patching process.env.HOME
// Actually, since the adapter uses os.homedir(), we need to control the path
// differently. The cleanest approach: import the factory function that takes a
// configPath override, which we'll add to the adapter.

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "agentboard-claudecode-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// Helper to create an adapter with a custom config path
async function makeAdapter(overridePath: string) {
  const { makeClaudeCodeInstaller } = await import("../adapters/claude-code.js");
  return makeClaudeCodeInstaller(overridePath);
}

describe("ClaudeCode adapter - detect", () => {
  it("returns clientDetected:false when config file does not exist", async () => {
    const adapter = await makeAdapter(join(tmpDir, ".claude.json"));
    const result = await adapter.detect();
    expect(result.clientDetected).toBe(false);
    expect(result.registered).toBe(false);
  });

  it("returns clientDetected:true, registered:false when file exists but no agentboard entry", async () => {
    const configPath = join(tmpDir, ".claude.json");
    writeFileSync(configPath, JSON.stringify({ mcpServers: {} }));
    const adapter = await makeAdapter(configPath);
    const result = await adapter.detect();
    expect(result.clientDetected).toBe(true);
    expect(result.registered).toBe(false);
  });

  it("returns registered:true when mcpServers.agentboard is present", async () => {
    const configPath = join(tmpDir, ".claude.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          agentboard: { type: "stdio", command: "npx", args: ["@jobshimo/agentboard", "mcp"] },
        },
      }),
    );
    const adapter = await makeAdapter(configPath);
    const result = await adapter.detect();
    expect(result.clientDetected).toBe(true);
    expect(result.registered).toBe(true);
  });
});

describe("ClaudeCode adapter - install", () => {
  it("creates the config file with correct agentboard MCP entry", async () => {
    const configPath = join(tmpDir, ".claude.json");
    const adapter = await makeAdapter(configPath);
    const result = await adapter.install();

    expect(result.ok).toBe(true);
    const cfg = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    const servers = cfg["mcpServers"] as Record<string, unknown>;
    expect(servers).toBeDefined();
    const entry = servers["agentboard"] as Record<string, unknown>;
    expect(entry["type"]).toBe("stdio");
    expect(entry["command"]).toBe("npx");
    expect(entry["args"]).toEqual(["@jobshimo/agentboard", "mcp"]);
    // env should contain AGENTBOARD_REPO as a literal template string
    const env = entry["env"] as Record<string, string>;
    expect(env["AGENTBOARD_REPO"]).toBe("${workspaceFolder}");
  });

  it("creates a backup when the file already existed", async () => {
    const configPath = join(tmpDir, ".claude.json");
    writeFileSync(configPath, JSON.stringify({ mcpServers: {} }));
    const adapter = await makeAdapter(configPath);
    const result = await adapter.install();

    expect(result.backupPath).not.toBeNull();
    expect(existsSync(result.backupPath!)).toBe(true);
  });

  it("does NOT create a backup when the file was newly created", async () => {
    const configPath = join(tmpDir, ".claude.json");
    const adapter = await makeAdapter(configPath);
    const result = await adapter.install();
    expect(result.backupPath).toBeNull();
  });

  it("merges in-place — does not clobber other mcpServers entries", async () => {
    const configPath = join(tmpDir, ".claude.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          "other-server": { type: "stdio", command: "other" },
        },
      }),
    );
    const adapter = await makeAdapter(configPath);
    await adapter.install();

    const cfg = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    const servers = cfg["mcpServers"] as Record<string, unknown>;
    expect(servers["other-server"]).toBeDefined();
    expect(servers["agentboard"]).toBeDefined();
  });

  it("dry-run: does not write the file", async () => {
    const configPath = join(tmpDir, ".claude.json");
    const adapter = await makeAdapter(configPath);
    await adapter.install({ dryRun: true });
    expect(existsSync(configPath)).toBe(false);
  });

  it("dry-run: returns message describing what would change", async () => {
    const configPath = join(tmpDir, ".claude.json");
    const adapter = await makeAdapter(configPath);
    const result = await adapter.install({ dryRun: true });
    expect(result.message).toMatch(/dry-run|would/i);
  });
});

describe("ClaudeCode adapter - uninstall", () => {
  it("removes agentboard entry from mcpServers", async () => {
    const configPath = join(tmpDir, ".claude.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          agentboard: { type: "stdio", command: "npx" },
          other: { type: "stdio", command: "other" },
        },
      }),
    );
    const adapter = await makeAdapter(configPath);
    const result = await adapter.uninstall();

    expect(result.ok).toBe(true);
    const cfg = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    const servers = cfg["mcpServers"] as Record<string, unknown>;
    expect(servers["agentboard"]).toBeUndefined();
    expect(servers["other"]).toBeDefined();
  });

  it("is idempotent when entry is not present", async () => {
    const configPath = join(tmpDir, ".claude.json");
    writeFileSync(configPath, JSON.stringify({ mcpServers: {} }));
    const adapter = await makeAdapter(configPath);
    const result = await adapter.uninstall();
    expect(result.ok).toBe(true);
  });

  it("is safe when config file does not exist", async () => {
    const configPath = join(tmpDir, ".claude.json");
    const adapter = await makeAdapter(configPath);
    const result = await adapter.uninstall();
    expect(result.ok).toBe(true);
  });
});
