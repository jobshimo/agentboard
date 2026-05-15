// Compact origin square chip — used inside task cards.
// Mirrors components.jsx OriginChip exactly.

import { OriginGlyph } from "../icons";

interface OriginChipProps {
  source?: string | null;
}

export function OriginChip({ source }: OriginChipProps) {
  const src = source ?? "local";
  return (
    <span className="origin" data-source={src}>
      <OriginGlyph source={src} sz={11} />
    </span>
  );
}
