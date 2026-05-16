/**
 * Design tokens for the agentboard TUI.
 *
 * Ink accepts ANSI color names directly via the `color` prop on <Text>,
 * so this module is a thin semantic-role -> ANSI-name mapping, not a
 * hex-to-color translator. ANSI names adapt to the terminal theme
 * (light or dark) while hex literals do not.
 *
 * `dimColor` on Ink's <Text> handles the "muted" role; we still expose
 * `muted: 'gray'` so consumers reading from COLORS get a sensible
 * fallback when they want the muted color (e.g. a separator dot) and
 * not the dim effect (applied via the dimColor prop instead).
 */

export const COLORS = {
  primary: 'cyan',
  success: 'green',
  warn: 'yellow',
  error: 'red',
  info: 'blue',
  muted: 'gray',
  focus: 'cyan',
  heading: 'cyan',
} as const;

export type ColorRole = keyof typeof COLORS;

/**
 * Spacing scale — three levels only, mapped directly to Ink margin props.
 * Don't introduce a fourth value.
 */
export const SPACE = {
  none: 0,
  gap: 1,
  block: 2,
} as const;

export type SpaceKey = keyof typeof SPACE;

/**
 * Glyph set — single registry for every glyph in the TUI.
 * Every glyph below renders cleanly on Windows Terminal, iTerm2, and
 * modern xterms.
 */
export const GLYPHS = {
  cursor: '❯',
  cursorEmpty: ' ',
  up: '↑',
  down: '↓',
  enter: '↵',
  dot: '·',
  check: '✓',
  cross: '✗',
  warn: '⚠',
  info: 'i',
  spinnerFrames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
} as const;

export type GlyphKey = keyof typeof GLYPHS;
