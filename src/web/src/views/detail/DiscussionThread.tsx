// Discussion thread — renders all messages. Mirrors the .thread div in detail.jsx.
// Shows pinned header with count and Summarize button (button is decorative per deliverable).

import { Sparkle } from "../../icons";
import { Message } from "./Message";
import type { DiscussionEntry } from "../../lib/api";

interface DiscussionThreadProps {
  entries: DiscussionEntry[];
}

export function DiscussionThread({ entries }: DiscussionThreadProps) {
  return (
    <div className="thread">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 13 }}>Discussion</h3>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 11 }}>{entries.length} messages</span>
          <button className="btn small ghost">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Sparkle sz={11} /> Summarize
            </span>
          </button>
        </div>
      </div>
      {entries.map(entry => (
        <Message key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
