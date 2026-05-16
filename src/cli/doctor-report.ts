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
import { detectInstructionsBlock, BLOCK_VERSION } from "../install/instructions.js";
import { t } from "../i18n/strings.js";
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
        // Consider the registration outdated when the instructions block version
        // is older than the current BLOCK_VERSION, or when the block is missing
        // even though the client is registered (run `agentboard install` to fix).
        mcp = instrStatus === "outdated" ? "registered-outdated" : "registered-current";
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

/** Simple template substitution: replace `{key}` with the corresponding value. */
function sub(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

export function formatDoctorReport(report: DoctorReport, lang: "en" | "es" = "en"): string {
  const lines: string[] = [];

  lines.push(`${c.bold}${t("doctor.title", lang)}${c.reset}`);
  lines.push("");

  // ── Daemon ──────────────────────────────────────────────────────
  lines.push(`${c.dim}── ${t("doctor.section.daemon", lang)} ──────────────────────────────────${c.reset}`);
  if (report.daemon.running) {
    lines.push(ok(sub(t("doctor.daemon.running", lang), {
      pid: String(report.daemon.pid),
      port: String(report.daemon.port),
      uptime: String(report.daemon.uptime),
    })));
  } else {
    lines.push(warn(t("doctor.daemon.not_running", lang)));
  }
  lines.push("");

  // ── Clients ─────────────────────────────────────────────────────
  lines.push(`${c.dim}── ${t("doctor.section.clients", lang)} ─────────────────────────────────${c.reset}`);
  for (const client of report.clients) {
    const mcpLine = (() => {
      switch (client.mcp) {
        case "registered-current":
          return ok(sub(t("doctor.mcp.registered", lang), { name: client.displayName }));
        case "registered-outdated":
          return warn(sub(t("doctor.mcp.outdated", lang), { name: client.displayName }));
        case "not-registered":
          return warn(sub(t("doctor.mcp.not_registered", lang), { name: client.displayName, id: client.id }));
        case "not-detected":
          return `${c.dim}[--]${c.reset}  ${sub(t("doctor.mcp.not_detected", lang), { name: client.displayName })}`;
      }
    })();
    lines.push(mcpLine);

    const instrLine = (() => {
      switch (client.instructions) {
        case "current":
          return ok(sub(t("doctor.instr.current", lang), { name: client.displayName }));
        case "outdated":
          return warn(sub(t("doctor.instr.outdated", lang), { name: client.displayName }));
        case "missing":
          return client.mcp === "not-detected"
            ? `${c.dim}[--]${c.reset}  ${sub(t("doctor.instr.na", lang), { name: client.displayName })}`
            : warn(sub(t("doctor.instr.missing", lang), { name: client.displayName, id: client.id }));
      }
    })();
    lines.push(instrLine);
  }
  lines.push("");

  // ── Registry ────────────────────────────────────────────────────
  lines.push(`${c.dim}── ${t("doctor.section.registry", lang)} ────────────────────────────────${c.reset}`);
  lines.push(ok(sub(t("doctor.registry.summary", lang), {
    repos: String(report.registry.knownRepos),
    lastSeen: report.registry.lastSeenAt ?? "n/a",
  })));
  lines.push("");

  // ── Version ─────────────────────────────────────────────────────
  lines.push(`${c.dim}── ${t("doctor.section.version", lang)} ─────────────────────────────────${c.reset}`);
  lines.push(ok(sub(t("doctor.version.current", lang), { version: report.version.current })));
  if (report.version.updateStatus === "newer") {
    lines.push(warn(sub(t("doctor.version.newer", lang), { latest: report.version.latest ?? "?" })));
  } else if (report.version.updateStatus === "up-to-date") {
    lines.push(ok(t("doctor.version.up_to_date", lang)));
  } else {
    lines.push(warn(t("doctor.version.unknown", lang)));
  }
  lines.push("");

  // ── Paths ───────────────────────────────────────────────────────
  lines.push(`${c.dim}── ${t("doctor.section.paths", lang)} ───────────────────────────────────${c.reset}`);
  lines.push(ok(sub(t("doctor.paths.agb_home", lang), { path: report.paths.agbHome })));
  const cfgLine = report.paths.configYamlExists
    ? ok(sub(t("doctor.paths.config_found", lang), { path: report.paths.configYaml }))
    : warn(sub(t("doctor.paths.config_missing", lang), { path: report.paths.configYaml }));
  lines.push(cfgLine);
  lines.push("");

  return lines.join("\n");
}
