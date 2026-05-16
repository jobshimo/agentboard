import { Text } from 'ink';
import { COLORS, GLYPHS } from '../tokens.js';

/**
 * Status badge — glyph + space + label, all in one role color.
 *
 * ok   -> green  checkmark
 * warn -> yellow warning sign
 * err  -> red    cross
 * info -> blue   info letter
 * muted -> gray  dot
 */
export type BadgeKind = 'ok' | 'warn' | 'err' | 'info' | 'muted';

interface BadgeProps {
  kind: BadgeKind;
  /** Optional override for the rendered text. When omitted, the default
   * text comes from KIND_TO_DEFAULT_LABEL. */
  label?: string;
}

const KIND_TO_COLOR: Record<BadgeKind, string> = {
  ok: COLORS.success,
  warn: COLORS.warn,
  err: COLORS.error,
  info: COLORS.info,
  muted: COLORS.muted,
};

const KIND_TO_GLYPH: Record<BadgeKind, string> = {
  ok: GLYPHS.check,
  warn: GLYPHS.warn,
  err: GLYPHS.cross,
  info: GLYPHS.info,
  muted: GLYPHS.dot,
};

const KIND_TO_DEFAULT_LABEL: Record<BadgeKind, string> = {
  ok: 'registered',
  warn: 'not registered',
  err: 'error',
  info: 'info',
  muted: 'not detected',
};

export function Badge({ kind, label }: BadgeProps) {
  const color = KIND_TO_COLOR[kind];
  const glyph = KIND_TO_GLYPH[kind];
  const text = label ?? KIND_TO_DEFAULT_LABEL[kind];
  return (
    <Text color={color}>
      {glyph} {text}
    </Text>
  );
}
