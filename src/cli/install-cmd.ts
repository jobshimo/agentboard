/**
 * `agentboard install` and `agentboard uninstall` command implementations.
 * Wires the adapter factories to CLI flags.
 */
import type { ClientId, Installer, InstallOptions } from "../install/types.js";
import { makeClaudeCodeInstaller } from "../install/adapters/claude-code.js";
import { makeOpenCodeInstaller } from "../install/adapters/opencode.js";
import { makeCopilotInstaller } from "../install/adapters/copilot.js";
import {
  installInstructionsBlock,
  uninstallInstructionsBlock,
  BLOCK_VERSION as INSTRUCTIONS_VERSION,
} from "../install/instructions.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { t } from "../i18n/strings.js";
import { printLine } from "./output.js";

/** Map a client id to the path of its global instructions file. */
function instructionsFilePath(id: ClientId): string {
  switch (id) {
    case "claude-code": return join(homedir(), ".claude", "CLAUDE.md");
    case "opencode":    return join(homedir(), ".config", "opencode", "AGENTS.md");
    case "copilot":     return join(homedir(), ".copilot", "AGENTS.md");
  }
}

/** Map of clientId → config file override path (for testing). */
type AdapterOverrides = Partial<Record<ClientId, string>>;

function buildAdapter(id: ClientId, overrides: AdapterOverrides): Installer {
  const path = overrides[id];
  switch (id) {
    case "claude-code": return makeClaudeCodeInstaller(path);
    case "opencode":    return makeOpenCodeInstaller(path);
    case "copilot":     return makeCopilotInstaller(path);
  }
}

const ALL_CLIENT_IDS: ClientId[] = ["claude-code", "opencode", "copilot"];

/**
 * Map of clientId → instructions file override path (for testing).
 * When not set, falls back to the real per-client path.
 */
type InstructionsOverrides = Partial<Record<ClientId, string>>;

export interface InstallCmdOptions {
  /** If set, install only this client. If null, auto-detect and install all detected. */
  clientId: ClientId | null;
  dryRun: boolean;
  adapterOverrides?: AdapterOverrides;
  /** Override instructions file paths per client (for testing). */
  instructionsOverrides?: InstructionsOverrides;
  /** Language for user-facing messages. Defaults to "en". */
  lang?: "en" | "es";
}

/** Simple template substitution: replace `{key}` placeholders with values. */
function sub(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k as string] ?? `{${k}}`);
}

/** Run `agentboard install [--client <id>] [--dry-run]`. */
export async function runInstall(opts: InstallCmdOptions): Promise<void> {
  const { clientId, dryRun, adapterOverrides = {}, instructionsOverrides = {}, lang = "en" } = opts;
  const installOpts: InstallOptions = { dryRun };

  const resolveInstrPath = (id: ClientId): string =>
    instructionsOverrides[id] ?? instructionsFilePath(id);

  if (clientId) {
    const adapter = buildAdapter(clientId, adapterOverrides);
    const result = await adapter.install(installOpts);
    printLine(result.message);
    if (result.backupPath) {
      printLine(sub(t("install.diag.backup", lang), { path: result.backupPath }));
    }
    if (!dryRun) {
      const instrResult = await installInstructionsBlock(resolveInstrPath(clientId));
      printLine(sub(t("install.diag.instr_block", lang), { id: clientId, status: instrResult.status }));
      if (instrResult.backupPath) {
        printLine(sub(t("install.diag.instr_backup", lang), { path: instrResult.backupPath }));
      }
    } else {
      printLine(sub(t("install.diag.dry_run_install", lang), { version: INSTRUCTIONS_VERSION, path: resolveInstrPath(clientId) }));
    }
    return;
  }

  // Auto-detect: install in all clients where the config file exists.
  let installedAny = false;
  for (const id of ALL_CLIENT_IDS) {
    const adapter = buildAdapter(id, adapterOverrides);
    const detected = await adapter.detect();
    if (!detected.clientDetected) continue;

    const result = await adapter.install(installOpts);
    printLine(`[${id}] ${result.message}`);
    if (result.backupPath) {
      printLine(sub(t("install.diag.backup", lang), { path: result.backupPath }));
    }
    if (!dryRun) {
      const instrResult = await installInstructionsBlock(resolveInstrPath(id));
      printLine(sub(t("install.diag.auto_instr_block", lang), { id, status: instrResult.status }));
      if (instrResult.backupPath) {
        printLine(sub(t("install.diag.auto_instr_backup", lang), { id, path: instrResult.backupPath }));
      }
    } else {
      printLine(sub(t("install.diag.auto_dry_run_install", lang), { id, version: INSTRUCTIONS_VERSION, path: resolveInstrPath(id) }));
    }
    installedAny = true;
  }

  if (!installedAny) {
    printLine(t("install.no_clients_detected", lang));
  }
}

export interface UninstallCmdOptions {
  clientId: ClientId | null;
  dryRun: boolean;
  adapterOverrides?: AdapterOverrides;
  /** Override instructions file paths per client (for testing). */
  instructionsOverrides?: InstructionsOverrides;
  /** Language for user-facing messages. Defaults to "en". */
  lang?: "en" | "es";
}

/** Run `agentboard uninstall [--client <id>] [--dry-run]`. */
export async function runUninstall(opts: UninstallCmdOptions): Promise<void> {
  const { clientId, dryRun, adapterOverrides = {}, instructionsOverrides = {}, lang = "en" } = opts;
  const installOpts: InstallOptions = { dryRun };

  const resolveInstrPath = (id: ClientId): string =>
    instructionsOverrides[id] ?? instructionsFilePath(id);

  if (clientId) {
    const adapter = buildAdapter(clientId, adapterOverrides);
    const result = await adapter.uninstall(installOpts);
    printLine(result.message);
    if (result.backupPath) {
      printLine(sub(t("install.diag.backup", lang), { path: result.backupPath }));
    }
    if (!dryRun) {
      const instrResult = await uninstallInstructionsBlock(resolveInstrPath(clientId));
      printLine(sub(t("uninstall.diag.instr_block", lang), { id: clientId, status: instrResult.status }));
    } else {
      printLine(sub(t("uninstall.diag.dry_run_remove", lang), { path: resolveInstrPath(clientId) }));
    }
    return;
  }

  // Auto: uninstall from all clients where agentboard is registered.
  let removedAny = false;
  for (const id of ALL_CLIENT_IDS) {
    const adapter = buildAdapter(id, adapterOverrides);
    const detected = await adapter.detect();
    if (!detected.registered) continue;

    const result = await adapter.uninstall(installOpts);
    printLine(`[${id}] ${result.message}`);
    if (result.backupPath) {
      printLine(sub(t("install.diag.backup", lang), { path: result.backupPath }));
    }
    if (!dryRun) {
      const instrResult = await uninstallInstructionsBlock(resolveInstrPath(id));
      printLine(sub(t("uninstall.diag.auto_instr_block", lang), { id, status: instrResult.status }));
    } else {
      printLine(sub(t("uninstall.diag.auto_dry_run_remove", lang), { id, path: resolveInstrPath(id) }));
    }
    removedAny = true;
  }

  if (!removedAny) {
    printLine(t("uninstall.not_registered", lang));
  }
}
