/**
 * Install adapter for Claude Code (claude.ai CLI).
 * Config file: ~/.claude.json
 * MCP entry key: mcpServers.agentboard
 */
import { homedir } from "node:os";
import { join } from "node:path";
import type { Installer, DetectResult, InstallResult, UninstallResult, InstallOptions } from "../types.js";
import { backupFile, atomicWriteJson, readJsonFile } from "../utils.js";

const ENTRY_KEY = "agentboard";

interface ClaudeConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

function agentboardEntry(): Record<string, unknown> {
  return {
    type: "stdio",
    command: "npx",
    args: ["@jobshimo/agentboard", "mcp"],
    env: {
      AGENTBOARD_REPO: "${workspaceFolder}",
    },
  };
}

function readConfig(configPath: string): ClaudeConfig {
  const raw = readJsonFile(configPath);
  if (!raw) return {};
  return raw as ClaudeConfig;
}

/**
 * Factory function — accepts an optional configPath override for tests.
 * Production code uses the default ~/.claude.json path.
 */
export function makeClaudeCodeInstaller(configPath?: string): Installer {
  const resolvedPath = configPath ?? join(homedir(), ".claude.json");

  return {
    id: "claude-code",
    displayName: "Claude Code",

    configPath(): string {
      return resolvedPath;
    },

    async detect(): Promise<DetectResult> {
      const cfg = readConfig(resolvedPath);
      const isEmptyConfig = Object.keys(cfg).length === 0;
      const clientDetected = !isEmptyConfig || (await import("node:fs")).existsSync(resolvedPath);
      const registered = !!cfg.mcpServers?.[ENTRY_KEY];

      return { clientDetected, registered, configPath: resolvedPath };
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

/** Default export — uses the standard ~/.claude.json path. */
export const claudeCodeInstaller: Installer = makeClaudeCodeInstaller();
