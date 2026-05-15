/**
 * `agentboard` TUI (Ink + React) — launched when stdout is a TTY with no args.
 * Implemented in commit 10. This module is a placeholder that satisfies the
 * import in index.ts until the full implementation lands.
 */

export interface TuiOptions {
  agbHome: string;
}

export async function runTui(_opts: TuiOptions): Promise<void> {
  // Full implementation in commit 10 (feat(tui): Ink+React menu).
  // Stub: print a message so it's usable in tests without Ink.
  process.stdout.write("[agentboard TUI — not yet implemented]\n");
}
