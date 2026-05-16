import { Box, Text } from 'ink';
import type { ReactNode } from 'react';
import { COLORS, GLYPHS } from '../tokens.js';

/**
 * Menu row — cursor + optional hotkey marker `[h]` + label + dim hint
 * + optional right-aligned badge.
 *
 * Cursor: ❯ to the left of the focused item, space placeholder for others.
 * Hotkey: rendered as [s] — brackets in muted, letter in primary (cyan)
 * when unfocused, primary bold when focused, underlined always.
 * Label: muted when unfocused, white bold when focused.
 */
interface MenuRowProps {
  focused?: boolean;
  /** Single-character hotkey marker rendered as [h] before the label. */
  hotkey?: string;
  label: string;
  /** Dim trailing string after the label. */
  hint?: string;
  /** Right-aligned status badge — typically a <Badge>. */
  badge?: ReactNode;
  /** Called when the row is selected (via Enter or hotkey). */
  onFire?: () => void;
}

export function MenuRow({ focused = false, hotkey, label, hint, badge }: MenuRowProps) {
  const cursor = focused ? GLYPHS.cursor : GLYPHS.cursorEmpty;
  return (
    <Box>
      <Text color={focused ? COLORS.focus : COLORS.muted}>{cursor} </Text>
      {hotkey !== undefined && hotkey !== '' && (
        <Text>
          <Text color={COLORS.muted}>[</Text>
          <Text color={focused ? COLORS.focus : COLORS.primary} bold={focused} underline>
            {hotkey}
          </Text>
          <Text color={COLORS.muted}>] </Text>
        </Text>
      )}
      <Text color={focused ? 'white' : COLORS.muted} bold={focused}>
        {label}
      </Text>
      {hint !== undefined && hint !== '' && (
        <Text color={COLORS.muted} dimColor>
          {'  '}
          {hint}
        </Text>
      )}
      {badge !== undefined && (
        <Box marginLeft={2} flexGrow={1} justifyContent="flex-end">
          {badge}
        </Box>
      )}
    </Box>
  );
}
