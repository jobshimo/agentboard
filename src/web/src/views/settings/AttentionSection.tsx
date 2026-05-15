// Attention config section — informational display of event routing settings.
// Ported 1:1 from agentboard/settings.jsx "Attention" block.

import { TerminalIcon } from "../../icons";

export function AttentionSection() {
  return (
    <div className="settings-block">
      <h3><TerminalIcon sz={14} /> Attention</h3>
      <p className="desc">
        How the agent learns about events while it's working. See <span className="mono">§9</span> of DESIGN.md.
      </p>
      <div className="kv-grid">
        <span className="k">agent_sees_human_events</span>
        <span className="v" style={{ color: "var(--success-fg)" }}>true · piggy-back on</span>
        <span className="k">notify_human_on_block</span>
        <span className="v" style={{ color: "var(--success-fg)" }}>true</span>
        <span className="k">session abandon</span>
        <span className="v">30 days</span>
        <span className="k">max events / task</span>
        <span className="v">10 000</span>
      </div>
    </div>
  );
}
