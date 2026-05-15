// Snapshots section — export current board to markdown.
// Ported 1:1 from agentboard/settings.jsx "Snapshots" block.

import { useState } from "react";
import { Archive, Send } from "../../icons";
import { postExport } from "../../lib/api";
import { en } from "../../i18n/en";

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
      <h3><Archive sz={14} /> {en.settings_snapshots_title}</h3>
      <p className="desc">{en.settings_snapshots_desc}</p>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn" onClick={handleExport} disabled={exporting}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Send sz={12} />{exporting ? en.settings_export_in_progress : en.settings_export_btn}
          </span>
        </button>
        {lastExport && (
          <span className="muted" style={{ fontSize: 12 }}>
            {en.settings_export_last} <span className="mono">{lastExport}</span>
          </span>
        )}
      </div>
    </div>
  );
}
