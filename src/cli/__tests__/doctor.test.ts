import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildDoctorReport,
  formatDoctorReport,
  type DoctorReport,
} from "../doctor-report.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "agentboard-doctor-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("buildDoctorReport", () => {
  it("returns a report object with all expected sections", async () => {
    const agbHome = tmpDir;
    const report = await buildDoctorReport({ agbHome, checkDaemon: false });

    expect(report).toHaveProperty("daemon");
    expect(report).toHaveProperty("clients");
    expect(report).toHaveProperty("registry");
    expect(report).toHaveProperty("version");
    expect(report).toHaveProperty("paths");
  });

  it("daemon section: running:false when no daemon is running", async () => {
    const agbHome = tmpDir;
    const report = await buildDoctorReport({ agbHome, checkDaemon: false });
    expect(report.daemon.running).toBe(false);
  });

  it("clients section: array of 3 entries (one per client)", async () => {
    const agbHome = tmpDir;
    const report = await buildDoctorReport({ agbHome, checkDaemon: false });
    expect(report.clients).toHaveLength(3);
    const ids = report.clients.map((c) => c.id);
    expect(ids).toContain("claude-code");
    expect(ids).toContain("opencode");
    expect(ids).toContain("copilot");
  });

  it("version section: contains currentVersion", async () => {
    const agbHome = tmpDir;
    const report = await buildDoctorReport({ agbHome, checkDaemon: false });
    expect(typeof report.version.current).toBe("string");
    expect(report.version.current.length).toBeGreaterThan(0);
  });

  it("paths section: lists config file locations", async () => {
    const agbHome = tmpDir;
    const report = await buildDoctorReport({ agbHome, checkDaemon: false });
    expect(report.paths.agbHome).toBe(agbHome);
    expect(typeof report.paths.configYaml).toBe("string");
  });
});

describe("formatDoctorReport", () => {
  it("output contains [ok], [warn], or [err] tokens", () => {
    const mockReport: DoctorReport = {
      daemon: { running: false, pid: null, port: null, uptime: null },
      clients: [
        {
          id: "claude-code",
          displayName: "Claude Code",
          mcp: "not-registered",
          instructions: "missing",
          configPath: "/tmp/test/.claude.json",
        },
      ],
      registry: { knownRepos: 0, lastSeenAt: null },
      version: { current: "0.1.0", updateStatus: "up-to-date" },
      paths: {
        agbHome: "/tmp/agentboard",
        configYaml: "/tmp/agentboard/config.yaml",
        configYamlExists: false,
      },
    };

    const output = formatDoctorReport(mockReport);
    // At least one of the status tokens must appear
    expect(output).toMatch(/\[(ok|warn|err)\]/);
  });

  it("output contains all section names", () => {
    const mockReport: DoctorReport = {
      daemon: { running: false, pid: null, port: null, uptime: null },
      clients: [],
      registry: { knownRepos: 0, lastSeenAt: null },
      version: { current: "0.1.0", updateStatus: "up-to-date" },
      paths: {
        agbHome: "/tmp/agentboard",
        configYaml: "/tmp/agentboard/config.yaml",
        configYamlExists: false,
      },
    };

    const output = formatDoctorReport(mockReport);
    expect(output).toContain("daemon");
    expect(output).toContain("version");
    expect(output).toContain("paths");
  });

  it("daemon running state is reflected in output", () => {
    const runningReport: DoctorReport = {
      daemon: { running: true, pid: 1234, port: 7733, uptime: 3600 },
      clients: [],
      registry: { knownRepos: 2, lastSeenAt: "2026-05-15T20:00:00Z" },
      version: { current: "0.1.0", updateStatus: "up-to-date" },
      paths: {
        agbHome: "/tmp/agentboard",
        configYaml: "/tmp/agentboard/config.yaml",
        configYamlExists: true,
      },
    };

    const output = formatDoctorReport(runningReport);
    expect(output).toContain("1234"); // PID
    expect(output).toContain("7733"); // port
  });
});
