/**
 * Shared types for all install adapters.
 */

export type ClientId = "claude-code" | "opencode" | "copilot";

export interface DetectResult {
  /** True when the client config file exists (client appears to be installed). */
  clientDetected: boolean;
  /** True when agentboard is already registered in the client config. */
  registered: boolean;
  /** Absolute path to the client config file. */
  configPath: string;
}

export interface InstallResult {
  ok: boolean;
  /** Human-readable description of what changed (or would change in dry-run). */
  message: string;
  /** Path to the backup file, or null if no backup was made. */
  backupPath: string | null;
}

export interface UninstallResult {
  ok: boolean;
  message: string;
  backupPath: string | null;
}

export interface InstallOptions {
  dryRun?: boolean;
}

export interface Installer {
  readonly id: ClientId;
  readonly displayName: string;

  /** Returns the expected absolute path to the client config file. */
  configPath(): string;

  /** Detect whether the client is installed and whether agentboard is registered. */
  detect(): Promise<DetectResult>;

  /** Register agentboard in the client config. Idempotent. */
  install(opts?: InstallOptions): Promise<InstallResult>;

  /** Remove agentboard from the client config. Idempotent. */
  uninstall(opts?: InstallOptions): Promise<UninstallResult>;
}
