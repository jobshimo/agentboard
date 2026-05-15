/**
 * Install adapter for GitHub Copilot.
 * Config file: $COPILOT_HOME/mcp-config.json (default: ~/.copilot/mcp-config.json)
 * MCP entry key: mcpServers.agentboard
 * Copilot requires env and tools fields.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import type { Installer, DetectResult, InstallResult, UninstallResult, InstallOptions } from "../types.js";
import { backupFile, atomicWriteJson, readJsonFile } from "../utils.js";

const ENTRY_KEY = "agentboard";

interface CopilotMcpEntry {
  type: "local" | "remote";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  tools?: string[];
}

interface CopilotConfig {
  mcpServers?: Record<string, CopilotMcpEntry>;
  [key: string]: unknown;
}

function defaultConfigPath(): string {
  const copilotHome = process.env["COPILOT_HOME"] ?? join(homedir(), ".copilot");
  return join(copilotHome, "mcp-config.json");
}

function readConfig(configPath: string): CopilotConfig {
  const raw = readJsonFile(configPath);
  if (!raw) return {};
  return raw as CopilotConfig;
}

function agentboardEntry(): CopilotMcpEntry {
  return {
    type: "local",
    command: "npx",
    args: ["@jobshimo/agentboard", "mcp"],
    env: {
      AGENTBOARD_REPO: "${workspaceFolder}",
    },
    tools: ["*"],
  };
}

/**
 * Factory function — accepts optional configPath override for tests.
 */
export function makeCopilotInstaller(configPath?: string): Installer {
  const resolvedPath = configPath ?? defaultConfigPath();

  return {
    id: "copilot",
    displayName: "GitHub Copilot",

    configPath(): string {
      return resolvedPath;
    },

    async detect(): Promise<DetectResult> {
      const { existsSync } = await import("node:fs");
      const fileExists = existsSync(resolvedPath);
      if (!fileExists) {
        return { clientDetected: false, registered: false, configPath: resolvedPath };
      }
      const cfg = readConfig(resolvedPath);
      return {
        clientDetected: true,
        registered: !!cfg.mcpServers?.[ENTRY_KEY],
        configPath: resolvedPath,
      };
    },

    async install(opts: InstallOptions = {}): Promise<InstallResult> {
      const { dryRun = false } = opts;

      if (dryRun) {
        return {
          ok: true,
          message: `[dry-run] would add mcpServers.agentboard to ${resolvedPath}`,
          backupPath: null,
        };
      }

      const { existsSync } = await import("node:fs");
      const fileExisted = existsSync(resolvedPath);

      const cfg = readConfig(resolvedPath);
      const bakPath = fileExisted ? await backupFile(resolvedPath) : null;

      cfg.mcpServers = cfg.mcpServers ?? {};
      cfg.mcpServers[ENTRY_KEY] = agentboardEntry();

      await atomicWriteJson(resolvedPath, cfg);

      return {
        ok: true,
        message: fileExisted
          ? `Updated agentboard MCP entry in ${resolvedPath}`
          : `Created ${resolvedPath} with agentboard MCP entry`,
        backupPath: bakPath,
      };
    },

    async uninstall(opts: InstallOptions = {}): Promise<UninstallResult> {
      const { dryRun = false } = opts;
      const { existsSync } = await import("node:fs");

      if (!existsSync(resolvedPath)) {
        return { ok: true, message: `${resolvedPath} does not exist — nothing to remove`, backupPath: null };
      }

      const cfg = readConfig(resolvedPath);

      if (!cfg.mcpServers?.[ENTRY_KEY]) {
        return { ok: true, message: `agentboard was not registered in ${resolvedPath}`, backupPath: null };
      }

      if (dryRun) {
        return {
          ok: true,
          message: `[dry-run] would remove mcpServers.agentboard from ${resolvedPath}`,
          backupPath: null,
        };
      }

      const bakPath = await backupFile(resolvedPath);
      const { [ENTRY_KEY]: _removed, ...rest } = cfg.mcpServers;
      cfg.mcpServers = rest;

      await atomicWriteJson(resolvedPath, cfg);

      return {
        ok: true,
        message: `Removed agentboard MCP entry from ${resolvedPath}`,
        backupPath: bakPath,
      };
    },
  };
}

/** Default export — uses the standard path. */
export const copilotInstaller: Installer = makeCopilotInstaller();
