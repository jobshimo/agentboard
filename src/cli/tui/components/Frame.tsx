import { Box, Text } from 'ink';
import type { ReactNode } from 'react';
import { COLORS, SPACE } from '../tokens.js';
import { StatusBar } from './StatusBar.js';
import type { FooterKeyItem } from './FooterKeys.js';
import { FooterKeys } from './FooterKeys.js';

/**
 * Frame — the layout contract for every screen.
 *
 * Wraps children with a round border, title row (with optional right-aligned
 * badge), a global StatusBar below the title, a children slot, and a
 * FooterKeys strip at the bottom.
 *
 * Every screen renders inside Frame. No screen renders its own border,
 * banner, or footer independently.
 */
interface FrameProps {
  title: string;
  /** Right-aligned tag rendered next to the title — e.g. "v0.1.0". */
  badge?: ReactNode;
  /** Override the border color. Defaults to gray; error screens use red. */
  borderColor?: 'gray' | 'red';
  /** The agbHome path, forwarded to StatusBar for daemon probe. */
  agbHome: string;
  /** Footer keybinding items. */
  footerKeys: FooterKeyItem[];
  children: ReactNode;
}

export function Frame({
  title,
  badge,
  borderColor = 'gray',
  agbHome,
  footerKeys,
  children,
}: FrameProps) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1}>
      {/* Title row */}
      <Box flexDirection="column" marginBottom={SPACE.gap}>
        <Box>
          <Text color={COLORS.heading} bold>
            {title}
          </Text>
          {badge !== undefined && (
            <Box marginLeft={2} flexGrow={1} justifyContent="flex-end">
              {badge}
            </Box>
          )}
        </Box>
        {/* StatusBar is always rendered */}
        <StatusBar agbHome={agbHome} />
      </Box>

      {/* Children slot */}
      <Box flexDirection="column">{children}</Box>

      {/* Footer always-on */}
      <Box marginTop={SPACE.gap}>
        <FooterKeys keys={footerKeys} />
      </Box>
    </Box>
  );
}
