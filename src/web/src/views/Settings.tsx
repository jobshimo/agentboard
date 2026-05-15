// Settings view — orchestrates all settings sections.
// Ported 1:1 from agentboard/settings.jsx.
// Depends on: useSettingsData (DIP boundary hook), section components.

import { useSettingsData } from "../lib/useSettingsData";
import { ServerSection } from "./settings/ServerSection";
import { McpSection } from "./settings/McpSection";
import { WorkflowsSection } from "./settings/WorkflowsSection";
import { AttentionSection } from "./settings/AttentionSection";
import { SnapshotsSection } from "./settings/SnapshotsSection";

function resolvePort(): number {
  if (typeof window !== "undefined" && window.location.port) {
    const p = parseInt(window.location.port, 10);
    if (!isNaN(p)) return p;
  }
  return 7733;
}

export function Settings() {
  const { workflows, health } = useSettingsData();
  const port = resolvePort();

  return (
    <div className="settings-page">
      <h2>Settings</h2>
      <p className="lede">
        Local config for <span className="mono">jobshimo/agentboard</span>. Workflows live in{" "}
        <span className="mono">~/.agentboard/workflows/</span> globally; this repo can override via{" "}
        <span className="mono">agentboard init</span>.
      </p>
      <ServerSection port={port} health={health} />
      <McpSection port={port} />
      <WorkflowsSection workflows={workflows} />
      <AttentionSection />
      <SnapshotsSection />
    </div>
  );
}
