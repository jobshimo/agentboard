import { Box, Text } from 'ink';
import { COLORS, SPACE } from '../tokens.js';

/**
 * Section header inside a screen body.
 * Cyan bold caps line — used to group menu items.
 * Margin top of 1 separates it from the previous group.
 */
interface SectionHeadProps {
  /** Visible header text. Caller decides whether to upper-case it. */
  children: string;
  /** Optional dim trailing string — e.g. "3 / 5 enabled". */
  hint?: string;
}

export function SectionHead({ children, hint }: SectionHeadProps) {
  return (
    <Box marginTop={SPACE.gap}>
      <Text color={COLORS.heading} bold>
        {children}
      </Text>
      {hint !== undefined && hint !== '' && (
        <Text color={COLORS.muted} dimColor>
          {'   '}
          {hint}
        </Text>
      )}
    </Box>
  );
}
