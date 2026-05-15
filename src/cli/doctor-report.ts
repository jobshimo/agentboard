/**
 * Doctor report builder and formatter.
 * Separated from doctor.ts so the pure functions are testable without
 * side effects (no process.stdout.write, no process.exit).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ClientId } from "../install/types.js";
import { makeClaudeCodeInstaller } from "../install/adapters/claude-code.js";
import { makeOpenCodeInstaller } from "../install/adapters/opencode.js";
import { makeCopilotInstaller } from "../install/adapters/copilot.js";
import { detectInstructionsBlock } from "../install/instructions.js";
import { getVersion } from "./version.js";

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

export type McpStatus = "registered-current" | "registered-outdated" | "not-registered" | "not-detected";
export type InstructionsStatus = "current" | "outdated" | "missing";

export interface ClientStatus {
  id: ClientId;
  displayName: string;
  mcp: McpStatus;
  instructions: InstructionsStatus;
  configPath: string;
}

export interface DaemonStatus {
  running: boolean;
  pid: number | null;
  port: number | null;
  uptime: number | null; // seconds
}

export interface RegistryStatus {
  knownRepos: number;
  lastSeenAt: string | null;
}

export interface VersionStatus {
  current: string;
  updateStatus: "up-to-date" | "newer" | "unknown";
  latest?: string | undefined;
}

export interface PathsStatus {
  agbHome: string;
  configYaml: string;
  configYamlExists: boolean;
}

export interface DoctorReport {
  daemon: DaemonStatus;
  clients: ClientStatus[];
  registry: RegistryStatus;
  version: VersionStatus;
  paths: PathsStatus;
}

// ──────────────────────────────────────────────────────────────────
// Instructions file paths per client
// ──────────────────────────────────────────────────────────────────

import { homedir } from "node:os";

function instructionsFilePath(id: ClientId): string {
  switch (id) {
    case "claude-code": return join(homedir(), ".claude", "CLAUDE.md");
    case "opencode":    return join(homedir(), ".config", "opencode", "AGENTS.md");
    case "copilot":     return join(homedir(), ".copilot", "AGENTS.md");
  }
}

// ──────────────────────────────────────────────────────────────────
// Report builder
// ──────────────────────────────────────────────────────────────────

export interface BuildDoctorReportOptions {
  agbHome: string;
  /** Set to false in tests to skip the actual HTTP probe. */
  checkDaemon?: boolean;
  /** Injected for testing. */
  _fetch?: typeof fetch;
}

export async function buildDoctorReport(opts: BuildDoctorReportOptions): Promise<DoctorReport> {
  const { agbHome, checkDaemon = true, _fetch: fetchFn = fetch } = opts;

  // ── Daemon ──────────────────────────────────────────────────────
  let daemon: DaemonStatus = { running: false, pid: null, port: null, uptime: null };

  if (checkDaemon) {
    try {
      const res = await fetchFn(`http://127.0.0.1:7733/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const body = (await res.json()) as Record<string, unknown>;
        daemon = {
          running: true,
          pid: typeof body["pid"] === "number" ? body["pid"] : null,
          port: typeof body["port"] === "number" ? body["port"] : 7733,
          uptime: typeof body["uptime_ms"] === "number" ? Math.round(body["uptime_ms"] / 1000) : null,
        };
      }
    } catch {
      // not running
    }
  }

  // ── Clients ─────────────────────────────────────────────────────
  const clientDefs: Array<{ id: ClientId; makeAdapter: () => ReturnType<typeof makeClaudeCodeInstaller> }> = [
    { id: "claude-code", makeAdapter: () => makeClaudeCodeInstaller() },
    { id: "opencode",    makeAdapter: () => makeOpenCodeInstaller() },
    { id: "copilot",     makeAdapter: () => makeCopilotInstaller() },
  ];

  const clients: ClientStatus[] = await Promise.all(
    clientDefs.map(async ({ id, makeAdapter }) => {
      const adapter = makeAdapter();
      const detected = await adapter.detect();
      const instrPath = instructionsFilePath(id);
      const instrStatus = detectInstructionsBlock(instrPath);

      let mcp: McpStatus;
      if (!detected.clientDetected) {
        mcp = "not-detected";
      } else if (detected.registered) {
        mcp = "registered-current";
      } else {
        mcp = "not-registered";
      }

      return {
        id,
        displayName: adapter.displayName,
        mcp,
        instructions: instrStatus,
        configPath: detected.configPath,
      };
    }),
  );

  // ── Registry ────────────────────────────────────────────────────
  let knownRepos = 0;
  let lastSeenAt: string | null = null;

  if (daemon.running && daemon.port) {
    try {
      const res = await fetchFn(`http://127.0.0.1:${daemon.port}/api/daemon/repos`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const body = (await res.json()) as { repos: Array<{ path: string; lastSeenAt: string }> };
        knownRepos = body.repos.length;
        if (body.repos.length > 0) {
          lastSeenAt = body.repos[0]?.lastSeenAt ?? null;
        }
      }
    } catch {
      // non-fatal
    }
  }

  // ── Version ─────────────────────────────────────────────────────
  const current = getVersion();
  let updateStatus: VersionStatus["updateStatus"] = "unknown";
  let latest: string | undefined;

  try {
    const { checkForUpdate } = await import("./update-check.js");
    const result = await checkForUpdate(current);
    updateStatus = result.status;
    latest = result.latest;
  } catch {
    // non-fatal
  }

  // ── Paths ───────────────────────────────────────────────────────
  const configYaml = join(agbHome, "config.yaml");
  const paths: PathsStatus = {
    agbHome,
    configYaml,
    configYamlExists: existsSync(configYaml),
  };

  return {
    daemon,
    clients,
    registry: { knownRepos, lastSeenAt },
    version: { current, updateStatus, latest },
    paths,
  };
}

// ──────────────────────────────────────────────────────────────────
// Formatter
// ──────────────────────────────────────────────────────────────────

const colorEnabled = !process.env["NO_COLOR"] && process.stdout.isTTY === true;

const c = {
  reset: colorEnabled ? "\x1b[0m" : "",
  green: colorEnabled ? "\x1b[32m" : "",
  yellow: colorEnabled ? "\x1b[33m" : "",
  red: colorEnabled ? "\x1b[31m" : "",
  cyan: colorEnabled ? "\x1b[36m" : "",
  bold: colorEnabled ? "\x1b[1m" : "",
  dim: colorEnabled ? "\x1b[2m" : "",
};

function ok(text: string): string {
  return `${c.green}[ok]${c.reset}  ${text}`;
}

function warn(text: string): string {
  return `${c.yellow}[warn]${c.reset} ${text}`;
}

function err(text: string): string {
  return `${c.red}[err]${c.reset}  ${text}`;
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];

  lines.push(`${c.bold}agentboard doctor${c.reset}`);
  lines.push("");

  // ── Daemon ──────────────────────────────────────────────────────
  lines.push(`${c.dim}── daemon ──────────────────────────────────${c.reset}`);
  if (report.daemon.running) {
    lines.push(ok(`running  pid=${report.daemon.pid}  port=${report.daemon.port}  uptime=${report.daemon.uptime}s`));
  } else {
    lines.push(warn("not running — run: agentboard daemon"));
  }
  lines.push("");

  // ── Clients ─────────────────────────────────────────────────────
  lines.push(`${c.dim}── clients ─────────────────────────────────${c.reset}`);
  for (const client of report.clients) {
    const mcpLine = (() => {
      switch (client.mcp) {
        case "registered-current":  return ok(`${client.displayName}  mcp: registered`);
        case "registered-outdated": return warn(`${client.displayName}  mcp: outdated — run: agentboard install`);
        case "not-registered":      return warn(`${client.displayName}  mcp: not registered — run: agentboard install --client ${client.id}`);
        case "not-detected":        return `${c.dim}[--]${c.reset}  ${client.displayName}  not detected`;
      }
    })();
    lines.push(mcpLine);

    const instrLine = (() => {
      switch (client.instructions) {
        case "current":  return ok(`${client.displayName}  instructions: current`);
        case "outdated": return warn(`${client.displayName}  instructions: outdated`);
        case "missing":  return client.mcp === "not-detected"
          ? `${c.dim}[--]${c.reset}  ${client.displayName}  instructions: n/a`
          : warn(`${client.displayName}  instructions: missing — run: agentboard install --client ${client.id}`);
      }
    })();
    lines.push(instrLine);
  }
  lines.push("");

  // ── Registry ────────────────────────────────────────────────────
  lines.push(`${c.dim}── registry ────────────────────────────────${c.reset}`);
  lines.push(ok(`known repos: ${report.registry.knownRepos}  last-seen: ${report.registry.lastSeenAt ?? "n/a"}`));
  lines.push("");

  // ── Version ─────────────────────────────────────────────────────
  lines.push(`${c.dim}── version ─────────────────────────────────${c.reset}`);
  lines.push(ok(`current: v${report.version.current}`));
  if (report.version.updateStatus === "newer") {
    lines.push(warn(`newer available: v${report.version.latest} — run: npm i -g @jobshimo/agentboard`));
  } else if (report.version.updateStatus === "up-to-date") {
    lines.push(ok("up to date"));
  } else {
    lines.push(warn("update check failed (offline?)"));
  }
  lines.push("");

  // ── Paths ───────────────────────────────────────────────────────
  lines.push(`${c.dim}── paths ───────────────────────────────────${c.reset}`);
  lines.push(ok(`agb-home:   ${report.paths.agbHome}`));
  const cfgLine = report.paths.configYamlExists
    ? ok(`config.yaml: ${report.paths.configYaml}`)
    : warn(`config.yaml: ${report.paths.configYaml}  (not found — defaults apply)`);
  lines.push(cfgLine);
  lines.push("");

  return lines.join("\n");
}
