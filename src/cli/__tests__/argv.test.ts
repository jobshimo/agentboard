import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseArgv } from "../index.js";

// parseArgv calls process.exit on bad input — mock it so tests don't abort.
beforeEach(() => {
  vi.spyOn(process, "exit").mockImplementation((_code?: string | number) => {
    throw new Error(`process.exit(${_code})`);
  });
  // suppress stderr noise in test output
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseArgv", () => {
  it("defaults to start command with no args", () => {
    const result = parseArgv(["node", "agentboard"]);
    expect(result.command).toBe("start");
    expect(result.port).toBe(0);
    expect(result.noOpen).toBe(false);
    expect(result.verbose).toBe(false);
  });

  it("parses init subcommand", () => {
    const result = parseArgv(["node", "agentboard", "init"]);
    expect(result.command).toBe("init");
  });

  it("parses export subcommand", () => {
    const result = parseArgv(["node", "agentboard", "export"]);
    expect(result.command).toBe("export");
  });

  it("parses --help flag", () => {
    const result = parseArgv(["node", "agentboard", "--help"]);
    expect(result.command).toBe("help");
  });

  it("parses -h shorthand for help", () => {
    const result = parseArgv(["node", "agentboard", "-h"]);
    expect(result.command).toBe("help");
  });

  it("parses --version flag", () => {
    const result = parseArgv(["node", "agentboard", "--version"]);
    expect(result.command).toBe("version");
  });

  it("parses -v shorthand for version", () => {
    const result = parseArgv(["node", "agentboard", "-v"]);
    expect(result.command).toBe("version");
  });

  it("parses --port <n> as two tokens", () => {
    const result = parseArgv(["node", "agentboard", "--port", "8080"]);
    expect(result.port).toBe(8080);
  });

  it("parses --port=<n> as a single token", () => {
    const result = parseArgv(["node", "agentboard", "--port=9000"]);
    expect(result.port).toBe(9000);
  });

  it("parses --no-open flag", () => {
    const result = parseArgv(["node", "agentboard", "--no-open"]);
    expect(result.noOpen).toBe(true);
  });

  it("parses --verbose flag", () => {
    const result = parseArgv(["node", "agentboard", "--verbose"]);
    expect(result.verbose).toBe(true);
  });

  it("exits on unknown subcommand", () => {
    expect(() => parseArgv(["node", "agentboard", "unknown"])).toThrow(
      "process.exit(1)",
    );
  });

  it("exits on unknown flag", () => {
    expect(() => parseArgv(["node", "agentboard", "--unknown"])).toThrow(
      "process.exit(1)",
    );
  });

  it("exits on invalid port value", () => {
    expect(() =>
      parseArgv(["node", "agentboard", "--port", "notaport"]),
    ).toThrow("process.exit(1)");
  });

  it("parses install subcommand", () => {
    const result = parseArgv(["node", "agentboard", "install"]);
    expect(result.command).toBe("install");
    expect(result.client).toBeNull();
    expect(result.dryRun).toBe(false);
  });

  it("parses install --client claude-code", () => {
    const result = parseArgv(["node", "agentboard", "install", "--client", "claude-code"]);
    expect(result.command).toBe("install");
    expect(result.client).toBe("claude-code");
  });

  it("parses install --dry-run", () => {
    const result = parseArgv(["node", "agentboard", "install", "--dry-run"]);
    expect(result.command).toBe("install");
    expect(result.dryRun).toBe(true);
  });

  it("parses uninstall subcommand", () => {
    const result = parseArgv(["node", "agentboard", "uninstall"]);
    expect(result.command).toBe("uninstall");
  });

  it("parses doctor subcommand", () => {
    const result = parseArgv(["node", "agentboard", "doctor"]);
    expect(result.command).toBe("doctor");
  });
});
