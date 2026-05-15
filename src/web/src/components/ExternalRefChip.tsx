// External reference chip — github/jira/linear/local glyphs.
// Mirrors components.jsx ExternalRefChip exactly.

import { OriginGlyph, ArrowUpRight } from "../icons";

export interface RefData {
  source: string;
  id: string;
  url?: string | null;
}

interface ExternalRefChipProps {
  refData: RefData | null | undefined;
  compact?: boolean;
}

export function ExternalRefChip({ refData: r, compact = false }: ExternalRefChipProps) {
  if (!r) return null;

  if (compact) {
    return (
      <span className="origin" data-source={r.source} title={r.id}>
        <OriginGlyph source={r.source} />
      </span>
    );
  }

  return (
    <a
      className="ref-chip"
      href={r.url ?? "#"}
      onClick={(e) => e.preventDefault()}
    >
      <span
        className="origin"
        data-source={r.source}
        style={{ border: 0, background: "transparent", width: 14, height: 14 }}
      >
        <OriginGlyph source={r.source} sz={12} />
      </span>
      <span className="ref-id">{r.id}</span>
      <ArrowUpRight sz={11} />
    </a>
  );
}
