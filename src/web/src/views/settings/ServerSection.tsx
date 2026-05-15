// Server info section — shows runtime addresses, db path, uptime.
// Ported 1:1 from agentboard/settings.jsx "Server" block.

import { Cube } from "../../icons";
import type { HealthInfo } from "../../lib/api";
import { en } from "../../i18n/en";

interface Props {
  port: number;
  health: HealthInfo | null;
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function ServerSection({ port, health }: Props) {
  const base = `http://localhost:${port}`;

  return (
    <div className="settings-block">
      <h3><Cube sz={14} /> {en.settings_server_title}</h3>
      <p className="desc">{en.settings_server_desc}</p>
      <div className="kv-grid">
        <span className="k">{en.settings_kv_web_ui}</span>
        <span className="v">{base}</span>
        <span className="k">{en.settings_kv_mcp_endpoint}</span>
        <span className="v">{base}/mcp</span>
        <span className="k">{en.settings_kv_database}</span>
        <span className="v">.agentboard/db.sqlite</span>
        <span className="k">{en.settings_kv_snapshot_dir}</span>
        <span className="v">.agentboard/snapshot/</span>
        {health && (
          <>
            <span className="k">{en.settings_kv_version}</span>
            <span className="v">{health.version}</span>
            <span className="k">{en.settings_kv_uptime}</span>
            <span className="v">{formatUptime(health.uptime_ms)}</span>
          </>
        )}
      </div>
    </div>
  );
}
