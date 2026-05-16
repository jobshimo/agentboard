import { Text } from 'ink';

/**
 * Visual keyboard cue — inverted-block "keycap" style for hotkey hints
 * in footers. One space of padding either side of the label with the
 * `inverse` text modifier (swaps foreground and background).
 *
 * We use `inverse` rather than `backgroundColor` so the terminal's own
 * color scheme determines the contrast: dark terminal -> light keycap,
 * light terminal -> dark keycap.
 */
interface KeyCapProps {
  /** Visible label inside the cap — e.g. "↵", "Esc", "↑↓", "s". */
  label: string;
}

export function KeyCap({ label }: KeyCapProps) {
  return <Text inverse>{` ${label} `}</Text>;
}
