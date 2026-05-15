/**
 * `agentboard doctor` — structured diagnostic report.
 * Implemented in commit 9. This module is a placeholder that satisfies the
 * import in index.ts until the full implementation lands.
 */

export interface DoctorOptions {
  agbHome: string;
}

export async function runDoctor(_opts: DoctorOptions): Promise<void> {
  // Full implementation in commit 9 (feat(cli): agentboard doctor command).
  // Stub: no-op placeholder so the CLI can import without error.
  throw new Error("doctor command not yet implemented — coming in a later commit");
}
