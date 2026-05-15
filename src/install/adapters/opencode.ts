/**
 * Install adapter for OpenCode.
 * Config file: ~/.config/opencode/opencode.json
 * MCP entry key: mcp.agentboard
 * Shape mirrors browser-link opencode adapter (no env field — OpenCode uses "environment").
 */
import { homedir } from "node:os";
import { join } from "node:path";
import type { Installer, DetectResult, InstallResult, UninstallResult, InstallOptions } from "../types.js";
import { backupFile, atomicWriteJson, readJsonFile } from "../utils.js";

const ENTRY_KEY = "agentboard";
const SCHEMA_URL = "https://opencode.ai/config.json";

interface OpenCodeMcpEntry {
  type: "local" | "remote";
  command?: string[];
  url?: string;
  enabled?: boolean;
  environment?: Record<string, string>;
}

interface OpenCodeConfig {
  $schema?: string;
  mcp?: Record<string, OpenCodeMcpEntry>;
  [key: string]: unknown;
}

function defaultConfigPath(): string {
  return join(homedir(), ".config", "opencode", "opencode.json");
}

function readConfig(configPath: string): OpenCodeConfig {
  const raw = readJsonFile(configPath);
  if (!raw) return {};
  return raw as OpenCodeConfig;
}

function agentboardEntry(): OpenCodeMcpEntry {
  return {
    type: "local",
    command: ["npx", "@jobshimo/agentboard", "mcp"],
  };
}

/**
 * Factory function — accepts optional configPath override for tests.
 */
export function makeOpenCodeInstaller(configPath?: string): Installer {
  const resolvedPath = configPath ?? defaultConfigPath();

  return {
    id: "opencode",
    displayName: "OpenCode",

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
        registered: !!cfg.mcp?.[ENTRY_KEY],
        configPath: resolvedPath,
      };
    },

    async install(opts: InstallOptions = {}): Promise<InstallResult> {
      const { dryRun = false } = opts;

      if (dryRun) {
        return {
          ok: true,
          message: `[dry-run] would add mcp.agentboard to ${resolvedPath}`,
          backupPath: null,
        };
      }

      const { existsSync } = await import("node:fs");
      const fileExisted = existsSync(resolvedPath);

      const cfg = readConfig(resolvedPath);
      const bakPath = fileExisted ? await backupFile(resolvedPath) : null;

      if (!cfg.$schema) cfg.$schema = SCHEMA_URL;
      cfg.mcp = cfg.mcp ?? {};
      cfg.mcp[ENTRY_KEY] = agentboardEntry();

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

      if (!cfg.mcp?.[ENTRY_KEY]) {
        return { ok: true, message: `agentboard was not registered in ${resolvedPath}`, backupPath: null };
      }

      if (dryRun) {
        return {
          ok: true,
          message: `[dry-run] would remove mcp.agentboard from ${resolvedPath}`,
          backupPath: null,
        };
      }

      const bakPath = await backupFile(resolvedPath);
      const { [ENTRY_KEY]: _removed, ...rest } = cfg.mcp;
      cfg.mcp = rest;

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
export const openCodeInstaller: Installer = makeOpenCodeInstaller();
