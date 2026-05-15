/**
 * S9 RED tests: printBanner and printHelp must reflect STDIO MCP architecture.
 *
 * WARN-6: old HTTP /mcp endpoint references must be absent; new mcp/daemon/stop/status
 * subcommand listing must be present.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { printBanner, printHelp } from "../output.js";

// ---------------------------------------------------------------------------
// Helpers — capture stdout
// ---------------------------------------------------------------------------

function captureStdout(fn: () => void): string {
  const lines: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    lines.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  });
  fn();
  spy.mockRestore();
  return lines.join("");
}

// ---------------------------------------------------------------------------
// printBanner
// ---------------------------------------------------------------------------

describe("printBanner", () => {
  it("does NOT mention /mcp HTTP endpoint", () => {
    const out = captureStdout(() =>
      printBanner({ version: "1.0.0", port: 7733, cwd: "/tmp/repo", firstRun: false, webBundlePresent: true }),
    );
    // Old HTTP MCP endpoint line must be absent
    expect(out).not.toContain("/mcp");
  });

  it("mentions 'agentboard mcp' for agent integration", () => {
    const out = captureStdout(() =>
      printBanner({ version: "1.0.0", port: 7733, cwd: "/tmp/repo", firstRun: false, webBundlePresent: true }),
    );
    expect(out).toContain("agentboard mcp");
  });

  it("still shows web ui and websocket lines", () => {
    const out = captureStdout(() =>
      printBanner({ version: "1.0.0", port: 7733, cwd: "/tmp/repo", firstRun: false, webBundlePresent: true }),
    );
    expect(out).toContain("http://localhost:7733");
    expect(out).toContain("ws://localhost:7733/ws");
  });
});

// ---------------------------------------------------------------------------
// printHelp
// ---------------------------------------------------------------------------

describe("printHelp", () => {
  it("lists 'mcp' subcommand", () => {
    const out = captureStdout(() => printHelp());
    expect(out).toContain("mcp");
  });

  it("lists 'daemon' subcommand", () => {
    const out = captureStdout(() => printHelp());
    expect(out).toContain("daemon");
  });

  it("lists 'stop' subcommand", () => {
    const out = captureStdout(() => printHelp());
    expect(out).toContain("stop");
  });

  it("lists 'status' subcommand", () => {
    const out = captureStdout(() => printHelp());
    expect(out).toContain("status");
  });

  it("does NOT mention HTTP /mcp endpoint", () => {
    const out = captureStdout(() => printHelp());
    expect(out).not.toContain("localhost");
  });
});
