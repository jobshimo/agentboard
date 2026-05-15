import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "agentboard-install-cmd-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("runInstall", () => {
  it("installs to a single specified client", async () => {
    const claudeConfigPath = join(tmpDir, ".claude.json");
    const { runInstall } = await import("../install-cmd.js");

    // Provide adapter overrides so we don't touch real config files
    await runInstall({
      clientId: "claude-code",
      dryRun: false,
      adapterOverrides: {
        "claude-code": claudeConfigPath,
      },
    });

    expect(existsSync(claudeConfigPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(claudeConfigPath, "utf8")) as Record<string, unknown>;
    const servers = cfg["mcpServers"] as Record<string, unknown>;
    expect(servers["agentboard"]).toBeDefined();
  });

  it("dry-run: does not write any files", async () => {
    const claudeConfigPath = join(tmpDir, ".claude.json");
    const { runInstall } = await import("../install-cmd.js");

    await runInstall({
      clientId: "claude-code",
      dryRun: true,
      adapterOverrides: { "claude-code": claudeConfigPath },
    });

    expect(existsSync(claudeConfigPath)).toBe(false);
  });

  it("installs to all detected clients when no clientId given and files are pre-existing", async () => {
    const claudeConfigPath = join(tmpDir, ".claude.json");
    const openCodeConfigPath = join(tmpDir, "opencode.json");
    const copilotConfigPath = join(tmpDir, "mcp-config.json");

    // Pre-create files so detection returns true
    writeFileSync(claudeConfigPath, JSON.stringify({ mcpServers: {} }));
    writeFileSync(openCodeConfigPath, JSON.stringify({ mcp: {} }));
    writeFileSync(copilotConfigPath, JSON.stringify({ mcpServers: {} }));

    const { runInstall } = await import("../install-cmd.js");

    await runInstall({
      clientId: null,
      dryRun: false,
      adapterOverrides: {
        "claude-code": claudeConfigPath,
        opencode: openCodeConfigPath,
        copilot: copilotConfigPath,
      },
    });

    const cfgClaude = JSON.parse(readFileSync(claudeConfigPath, "utf8")) as Record<string, unknown>;
    expect((cfgClaude["mcpServers"] as Record<string, unknown>)["agentboard"]).toBeDefined();

    const cfgOpenCode = JSON.parse(readFileSync(openCodeConfigPath, "utf8")) as Record<string, unknown>;
    expect((cfgOpenCode["mcp"] as Record<string, unknown>)["agentboard"]).toBeDefined();

    const cfgCopilot = JSON.parse(readFileSync(copilotConfigPath, "utf8")) as Record<string, unknown>;
    expect((cfgCopilot["mcpServers"] as Record<string, unknown>)["agentboard"]).toBeDefined();
  });
});

describe("runUninstall", () => {
  it("removes agentboard from a specified client", async () => {
    const claudeConfigPath = join(tmpDir, ".claude.json");
    writeFileSync(
      claudeConfigPath,
      JSON.stringify({
        mcpServers: {
          agentboard: { type: "stdio", command: "npx" },
        },
      }),
    );

    const { runUninstall } = await import("../install-cmd.js");

    await runUninstall({
      clientId: "claude-code",
      dryRun: false,
      adapterOverrides: { "claude-code": claudeConfigPath },
    });

    const cfg = JSON.parse(readFileSync(claudeConfigPath, "utf8")) as Record<string, unknown>;
    const servers = cfg["mcpServers"] as Record<string, unknown>;
    expect(servers["agentboard"]).toBeUndefined();
  });
});
