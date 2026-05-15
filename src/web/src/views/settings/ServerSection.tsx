// Server info section — shows runtime addresses, db path, uptime.
// Ported 1:1 from agentboard/settings.jsx "Server" block.

import { Cube } from "../../icons";
import type { HealthInfo } from "../../lib/api";

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
      <h3><Cube sz={14} /> Server</h3>
      <p className="desc">
        Local launcher running. The agent talks via the MCP endpoint; the UI talks via REST + WebSocket.
      </p>
      <div className="kv-grid">
        <span className="k">Web UI</span>
        <span className="v">{base}</span>
        <span className="k">MCP endpoint</span>
        <span className="v">{base}/mcp</span>
        <span className="k">Database</span>
        <span className="v">.agentboard/db.sqlite</span>
        <span className="k">Snapshot dir</span>
        <span className="v">.agentboard/snapshot/</span>
        {health && (
          <>
            <span className="k">Version</span>
            <span className="v">{health.version}</span>
            <span className="k">Uptime</span>
            <span className="v">{formatUptime(health.uptime_ms)}</span>
          </>
        )}
      </div>
    </div>
  );
}
