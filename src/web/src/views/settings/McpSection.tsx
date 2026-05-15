// MCP activation section — shows endpoint URL + activation mode selector.
// Ported 1:1 from agentboard/settings.jsx "MCP activation" block.
// Mode changes are informational only in MVP — the server reads config from disk.

import { useState } from "react";
import { Bolt } from "../../icons";

type ActivationMode = "lazy" | "always-on" | "prompt";

const MODES: ActivationMode[] = ["lazy", "always-on", "prompt"];

const MODE_DESCRIPTIONS: Record<ActivationMode, string> = {
  "lazy": "Ships one tool (agentboard.activate) and reveals the full set on demand.",
  "always-on": "All tools exposed immediately when the server starts.",
  "prompt": "Asks the agent before activating the full tool surface.",
};

interface Props {
  port: number;
}

export function McpSection({ port }: Props) {
  const [mode, setMode] = useState<ActivationMode>("lazy");
  const endpoint = `http://localhost:${port}/mcp`;

  return (
    <div className="settings-block">
      <h3><Bolt sz={14} /> MCP activation</h3>
      <p className="desc">
        How the agent's tool surface is exposed. {MODE_DESCRIPTIONS[mode]}
      </p>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {MODES.map(m => (
          <button
            key={m}
            className="btn"
            style={mode === m ? { background: "var(--accent-subtle)", borderColor: "transparent", color: "var(--accent-fg)" } : undefined}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="kv-grid">
        <span className="k">MCP endpoint</span>
        <span className="v">
          <a href={endpoint} className="mono" style={{ color: "var(--accent-fg)", textDecoration: "none" }}>
            {endpoint}
          </a>
        </span>
      </div>
    </div>
  );
}
