// Snapshots section — export current board to markdown.
// Ported 1:1 from agentboard/settings.jsx "Snapshots" block.

import { useState } from "react";
import { Archive, Send } from "../../icons";
import { postExport } from "../../lib/api";

export function SnapshotsSection() {
  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);

  function handleExport() {
    if (exporting) return;
    setExporting(true);
    postExport()
      .then(() => {
        setLastExport(new Date().toLocaleString());
      })
      .catch(() => { /* silent degrade */ })
      .finally(() => setExporting(false));
  }

  return (
    <div className="settings-block">
      <h3><Archive sz={14} /> Snapshots</h3>
      <p className="desc">Export current board to markdown for git commit.</p>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn" onClick={handleExport} disabled={exporting}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Send sz={12} />{exporting ? "Exporting…" : "agentboard export"}
          </span>
        </button>
        {lastExport && (
          <span className="muted" style={{ fontSize: 12 }}>
            last export · <span className="mono">{lastExport}</span>
          </span>
        )}
      </div>
    </div>
  );
}
