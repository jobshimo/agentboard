import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "agentboard-install-cmd-test-"));
  vi.resetModules();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("runInstall", () => {
  it("installs to a single specified client", async () => {
    const claudeConfigPath = join(tmpDir, ".claude.json");
    const claudeInstrPath = join(tmpDir, "CLAUDE.md");
    const { runInstall } = await import("../install-cmd.js");

    // Provide adapter overrides so we don't touch real config files
    await runInstall({
      clientId: "claude-code",
      dryRun: false,
      adapterOverrides: { "claude-code": claudeConfigPath },
      instructionsOverrides: { "claude-code": claudeInstrPath },
    });

    expect(existsSync(claudeConfigPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(claudeConfigPath, "utf8")) as Record<string, unknown>;
    const servers = cfg["mcpServers"] as Record<string, unknown>;
    expect(servers["agentboard"]).toBeDefined();
  });

  it("installs instructions block alongside MCP config", async () => {
    const claudeConfigPath = join(tmpDir, ".claude.json");
    const claudeInstrPath = join(tmpDir, "CLAUDE.md");
    const { runInstall } = await import("../install-cmd.js");

    await runInstall({
      clientId: "claude-code",
      dryRun: false,
      adapterOverrides: { "claude-code": claudeConfigPath },
      instructionsOverrides: { "claude-code": claudeInstrPath },
    });

    // Instructions block file must have been created
    expect(existsSync(claudeInstrPath)).toBe(true);
    const instrContent = readFileSync(claudeInstrPath, "utf8");
    expect(instrContent).toContain("agentboard:instructions:begin");
  });

  it("dry-run: does not write any files", async () => {
    const claudeConfigPath = join(tmpDir, ".claude.json");
    const claudeInstrPath = join(tmpDir, "CLAUDE.md");
    const { runInstall } = await import("../install-cmd.js");

    await runInstall({
      clientId: "claude-code",
      dryRun: true,
      adapterOverrides: { "claude-code": claudeConfigPath },
      instructionsOverrides: { "claude-code": claudeInstrPath },
    });

    expect(existsSync(claudeConfigPath)).toBe(false);
    expect(existsSync(claudeInstrPath)).toBe(false);
  });

  it("installs to all detected clients when no clientId given and files are pre-existing", async () => {
    const claudeConfigPath = join(tmpDir, ".claude.json");
    const openCodeConfigPath = join(tmpDir, "opencode.json");
    const copilotConfigPath = join(tmpDir, "mcp-config.json");
    const claudeInstrPath = join(tmpDir, "CLAUDE.md");
    const openCodeInstrPath = join(tmpDir, "opencode-AGENTS.md");
    const copilotInstrPath = join(tmpDir, "copilot-AGENTS.md");

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
      instructionsOverrides: {
        "claude-code": claudeInstrPath,
        opencode: openCodeInstrPath,
        copilot: copilotInstrPath,
      },
    });

    const cfgClaude = JSON.parse(readFileSync(claudeConfigPath, "utf8")) as Record<string, unknown>;
    expect((cfgClaude["mcpServers"] as Record<string, unknown>)["agentboard"]).toBeDefined();

    const cfgOpenCode = JSON.parse(readFileSync(openCodeConfigPath, "utf8")) as Record<string, unknown>;
    expect((cfgOpenCode["mcp"] as Record<string, unknown>)["agentboard"]).toBeDefined();

    const cfgCopilot = JSON.parse(readFileSync(copilotConfigPath, "utf8")) as Record<string, unknown>;
    expect((cfgCopilot["mcpServers"] as Record<string, unknown>)["agentboard"]).toBeDefined();

    // All three instructions blocks should be installed
    expect(existsSync(claudeInstrPath)).toBe(true);
    expect(existsSync(openCodeInstrPath)).toBe(true);
    expect(existsSync(copilotInstrPath)).toBe(true);
  });

  it("no-clients-detected: prints friendly message and does not throw", async () => {
    // Override all adapters with non-existent paths so detection returns false
    const noop = join(tmpDir, "nonexistent.json");

    // Spy on stdout.write to capture printed output
    const captured: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((data: unknown) => {
      captured.push(String(data));
      return true;
    });

    const { runInstall } = await import("../install-cmd.js");

    await runInstall({
      clientId: null,
      dryRun: false,
      adapterOverrides: {
        "claude-code": noop,
        opencode: noop,
        copilot: noop,
      },
      instructionsOverrides: {
        "claude-code": noop,
        opencode: noop,
        copilot: noop,
      },
    });

    spy.mockRestore();
    const all = captured.join("");
    expect(all).toContain("No supported MCP clients detected");
  });
});

describe("install diagnostic strings i18n (lang param)", () => {
  it("dry-run single client: output contains translated dry-run message when lang=es", async () => {
    const claudeConfigPath = join(tmpDir, ".claude.json");
    const claudeInstrPath = join(tmpDir, "CLAUDE.md");

    const captured: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((data: unknown) => {
      captured.push(String(data));
      return true;
    });

    const { runInstall } = await import("../install-cmd.js");
    await runInstall({
      clientId: "claude-code",
      dryRun: true,
      lang: "es",
      adapterOverrides: { "claude-code": claudeConfigPath },
      instructionsOverrides: { "claude-code": claudeInstrPath },
    });

    spy.mockRestore();
    const all = captured.join("");
    // Spanish dry-run diagnostic must appear
    expect(all).toContain("instalaría bloque de instrucciones");
  });

  it("install single client with backup: output contains translated backup label when lang=es", async () => {
    const claudeConfigPath = join(tmpDir, ".claude.json");
    const claudeInstrPath = join(tmpDir, "CLAUDE.md");
    // Pre-create config with existing MCP so a backup is triggered
    writeFileSync(claudeConfigPath, JSON.stringify({ mcpServers: { agentboard: { type: "stdio", command: "npx" } } }));

    const captured: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((data: unknown) => {
      captured.push(String(data));
      return true;
    });

    const { runInstall } = await import("../install-cmd.js");
    await runInstall({
      clientId: "claude-code",
      dryRun: false,
      lang: "es",
      adapterOverrides: { "claude-code": claudeConfigPath },
      instructionsOverrides: { "claude-code": claudeInstrPath },
    });

    spy.mockRestore();
    const all = captured.join("");
    // Spanish backup label must appear (backup file was written from the update)
    expect(all).toContain("respaldo:");
    // Spanish instructions block diagnostic must appear
    expect(all).toContain("bloque de instrucciones");
  });
});

describe("runUninstall", () => {
  it("removes agentboard from a specified client", async () => {
    const claudeConfigPath = join(tmpDir, ".claude.json");
    const claudeInstrPath = join(tmpDir, "CLAUDE.md");
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
      instructionsOverrides: { "claude-code": claudeInstrPath },
    });

    const cfg = JSON.parse(readFileSync(claudeConfigPath, "utf8")) as Record<string, unknown>;
    const servers = cfg["mcpServers"] as Record<string, unknown>;
    expect(servers["agentboard"]).toBeUndefined();
  });

  it("removes instructions block when uninstalling", async () => {
    const claudeConfigPath = join(tmpDir, ".claude.json");
    const claudeInstrPath = join(tmpDir, "CLAUDE.md");
    writeFileSync(
      claudeConfigPath,
      JSON.stringify({ mcpServers: { agentboard: { type: "stdio", command: "npx" } } }),
    );
    // Pre-create an instructions file with the block
    const blockContent = [
      "<!-- agentboard:instructions:begin v0.1.0 -->",
      "<!-- managed-by: agentboard v0.1.0; do not edit between markers; run `agentboard install` to refresh. -->",
      "# Agentboard",
      "<!-- agentboard:instructions:end -->",
    ].join("\n") + "\n";
    writeFileSync(claudeInstrPath, blockContent, "utf8");

    const { runUninstall } = await import("../install-cmd.js");

    await runUninstall({
      clientId: "claude-code",
      dryRun: false,
      adapterOverrides: { "claude-code": claudeConfigPath },
      instructionsOverrides: { "claude-code": claudeInstrPath },
    });

    const instrContent = readFileSync(claudeInstrPath, "utf8");
    expect(instrContent).not.toContain("agentboard:instructions:begin");
  });
});
