import { Box, Text } from 'ink';
import { COLORS, GLYPHS } from '../tokens.js';
import { KeyCap } from './KeyCap.js';

/**
 * Footer keybinding strip.
 * Renders a horizontal row: [key] label   ·   [key] label   ·   ...
 * Replaces the plain-text footer pattern that every screen had to hand-roll.
 */

export interface FooterKeyItem {
  /** Visible key label — single character ("q"), short word ("Esc"),
   * or a combined cue ("↑↓"). */
  k: string;
  /** What pressing the key does — "navigate", "back", "select", etc. */
  label: string;
}

interface FooterKeysProps {
  keys: FooterKeyItem[];
}

export function FooterKeys({ keys }: FooterKeysProps) {
  return (
    <Box>
      {keys.map((it, i) => {
        const last = i === keys.length - 1;
        return (
          <Box key={`${it.k}-${String(i)}`}>
            <KeyCap label={it.k} />
            <Text color={COLORS.muted}> {it.label}</Text>
            {!last && (
              <Text color={COLORS.muted} dimColor>
                {`   ${GLYPHS.dot}   `}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
