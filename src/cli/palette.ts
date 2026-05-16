/**
 * Design token palette for the agentboard TUI.
 *
 * Colors are sourced from agentboard/styles.css (.theme-dark):
 * - accent-fg:   #58a6ff
 * - success-fg:  #3fb950
 * - warning-fg:  #d29922
 * - danger-fg:   #f85149
 * - done-fg:     #a371f7
 * - fg-default:  #e6edf3
 * - fg-muted:    #8b949e
 * - fg-subtle:   #6e7681
 *
 * Every Ink <Text color="..."> in the TUI reads from this module.
 * Do NOT scatter hex literals through the codebase.
 *
 * When NO_COLOR is set, all color values resolve to undefined so Ink
 * renders plain text without ANSI sequences.
 */

const noColor = Boolean(process.env["NO_COLOR"]);

function c(hex: string): string | undefined {
  return noColor ? undefined : hex;
}

export const palette = {
  /** Primary interactive highlight — accent blue */
  accent: c("#58a6ff"),
  /** Success / running state — green */
  ok: c("#3fb950"),
  /** Warning / caution state — amber */
  warn: c("#d29922"),
  /** Error / failure state — red */
  err: c("#f85149"),
  /** Informational — same as accent */
  info: c("#58a6ff"),
  /** Secondary / inactive text */
  muted: c("#8b949e"),
  /** Tertiary / very faint text */
  subtle: c("#6e7681"),
  /** Primary readable text */
  default: c("#e6edf3"),
  /** Bold primary text — same hex as default, paired with bold={true} */
  highlight: c("#e6edf3"),
  /** Completed / archived state — purple */
  done: c("#a371f7"),
} as const;

export type PaletteKey = keyof typeof palette;
