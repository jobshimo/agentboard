import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "agentboard-copilot-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

async function makeAdapter(overridePath: string) {
  const { makeCopilotInstaller } = await import("../adapters/copilot.js");
  return makeCopilotInstaller(overridePath);
}

describe("Copilot adapter - detect", () => {
  it("returns clientDetected:false when config file does not exist", async () => {
    const adapter = await makeAdapter(join(tmpDir, "mcp-config.json"));
    const result = await adapter.detect();
    expect(result.clientDetected).toBe(false);
    expect(result.registered).toBe(false);
  });

  it("returns clientDetected:true, registered:false when file exists but no agentboard entry", async () => {
    const configPath = join(tmpDir, "mcp-config.json");
    writeFileSync(configPath, JSON.stringify({ mcpServers: {} }));
    const adapter = await makeAdapter(configPath);
    const result = await adapter.detect();
    expect(result.clientDetected).toBe(true);
    expect(result.registered).toBe(false);
  });

  it("returns registered:true when mcpServers.agentboard is present", async () => {
    const configPath = join(tmpDir, "mcp-config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          agentboard: {
            type: "local",
            command: "npx",
            args: ["@jobshimo/agentboard", "mcp"],
            env: { AGENTBOARD_REPO: "${workspaceFolder}" },
            tools: ["*"],
          },
        },
      }),
    );
    const adapter = await makeAdapter(configPath);
    const result = await adapter.detect();
    expect(result.clientDetected).toBe(true);
    expect(result.registered).toBe(true);
  });
});

describe("Copilot adapter - install", () => {
  it("creates config file with correct mcpServers.agentboard entry", async () => {
    const configPath = join(tmpDir, "mcp-config.json");
    const adapter = await makeAdapter(configPath);
    await adapter.install();

    const cfg = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    const servers = cfg["mcpServers"] as Record<string, unknown>;
    const entry = servers["agentboard"] as Record<string, unknown>;

    expect(entry["type"]).toBe("local");
    expect(entry["command"]).toBe("npx");
    expect(entry["args"]).toEqual(["@jobshimo/agentboard", "mcp"]);
    // Copilot requires env and tools
    const env = entry["env"] as Record<string, string>;
    expect(env["AGENTBOARD_REPO"]).toBe("${workspaceFolder}");
    expect(entry["tools"]).toEqual(["*"]);
  });

  it("creates a backup when file already existed", async () => {
    const configPath = join(tmpDir, "mcp-config.json");
    writeFileSync(configPath, JSON.stringify({ mcpServers: {} }));
    const adapter = await makeAdapter(configPath);
    const result = await adapter.install();
    expect(result.backupPath).not.toBeNull();
    expect(existsSync(result.backupPath!)).toBe(true);
  });

  it("does NOT create a backup when file was newly created", async () => {
    const configPath = join(tmpDir, "mcp-config.json");
    const adapter = await makeAdapter(configPath);
    const result = await adapter.install();
    expect(result.backupPath).toBeNull();
  });

  it("merges in-place — preserves other mcpServers entries", async () => {
    const configPath = join(tmpDir, "mcp-config.json");
    writeFileSync(
      configPath,
      JSON.stringify({ mcpServers: { "other-server": { type: "local", command: "other" } } }),
    );
    const adapter = await makeAdapter(configPath);
    await adapter.install();

    const cfg = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    const servers = cfg["mcpServers"] as Record<string, unknown>;
    expect(servers["other-server"]).toBeDefined();
    expect(servers["agentboard"]).toBeDefined();
  });

  it("dry-run: does not write the file", async () => {
    const configPath = join(tmpDir, "mcp-config.json");
    const adapter = await makeAdapter(configPath);
    await adapter.install({ dryRun: true });
    expect(existsSync(configPath)).toBe(false);
  });

  it("dry-run: returns a message with 'dry-run'", async () => {
    const configPath = join(tmpDir, "mcp-config.json");
    const adapter = await makeAdapter(configPath);
    const result = await adapter.install({ dryRun: true });
    expect(result.message).toMatch(/dry-run|would/i);
  });
});

describe("Copilot adapter - uninstall", () => {
  it("removes mcpServers.agentboard from config", async () => {
    const configPath = join(tmpDir, "mcp-config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          agentboard: { type: "local", command: "npx" },
          other: { type: "local", command: "other" },
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

  it("is idempotent when entry not present", async () => {
    const configPath = join(tmpDir, "mcp-config.json");
    writeFileSync(configPath, JSON.stringify({ mcpServers: {} }));
    const adapter = await makeAdapter(configPath);
    const result = await adapter.uninstall();
    expect(result.ok).toBe(true);
  });

  it("is safe when file does not exist", async () => {
    const configPath = join(tmpDir, "mcp-config.json");
    const adapter = await makeAdapter(configPath);
    const result = await adapter.uninstall();
    expect(result.ok).toBe(true);
  });
});
