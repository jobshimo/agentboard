/**
 * `agentboard install` and `agentboard uninstall` command implementations.
 * Wires the adapter factories to CLI flags.
 */
import type { ClientId, Installer, InstallOptions } from "../install/types.js";
import { makeClaudeCodeInstaller } from "../install/adapters/claude-code.js";
import { makeOpenCodeInstaller } from "../install/adapters/opencode.js";
import { makeCopilotInstaller } from "../install/adapters/copilot.js";
import { printLine } from "./output.js";

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

export interface InstallCmdOptions {
  /** If set, install only this client. If null, auto-detect and install all detected. */
  clientId: ClientId | null;
  dryRun: boolean;
  adapterOverrides?: AdapterOverrides;
}

/** Run `agentboard install [--client <id>] [--dry-run]`. */
export async function runInstall(opts: InstallCmdOptions): Promise<void> {
  const { clientId, dryRun, adapterOverrides = {} } = opts;
  const installOpts: InstallOptions = { dryRun };

  if (clientId) {
    const adapter = buildAdapter(clientId, adapterOverrides);
    const result = await adapter.install(installOpts);
    printLine(result.message);
    if (result.backupPath) {
      printLine(`  backup: ${result.backupPath}`);
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
      printLine(`  backup: ${result.backupPath}`);
    }
    installedAny = true;
  }

  if (!installedAny) {
    printLine("No supported MCP clients detected. Install Claude Code, OpenCode, or GitHub Copilot first.");
  }
}

export interface UninstallCmdOptions {
  clientId: ClientId | null;
  dryRun: boolean;
  adapterOverrides?: AdapterOverrides;
}

/** Run `agentboard uninstall [--client <id>] [--dry-run]`. */
export async function runUninstall(opts: UninstallCmdOptions): Promise<void> {
  const { clientId, dryRun, adapterOverrides = {} } = opts;
  const installOpts: InstallOptions = { dryRun };

  if (clientId) {
    const adapter = buildAdapter(clientId, adapterOverrides);
    const result = await adapter.uninstall(installOpts);
    printLine(result.message);
    if (result.backupPath) {
      printLine(`  backup: ${result.backupPath}`);
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
      printLine(`  backup: ${result.backupPath}`);
    }
    removedAny = true;
  }

  if (!removedAny) {
    printLine("agentboard was not registered in any supported MCP client.");
  }
}
