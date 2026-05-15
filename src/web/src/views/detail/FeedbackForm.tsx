// Feedback form — visible when user clicks the Feedback button in detail sub-bar.
// target + severity + text → POST /api/tasks/:id/feedback.
// YAGNI: no threading, no file upload, no emoji reactions.

import { useState } from "react";
import { postFeedback } from "../../lib/api";
import type { FeedbackPayload } from "../../lib/api";
import { Info } from "../../icons";

interface FeedbackFormProps {
  taskId: string;
  onClose: () => void;
}

type Severity = NonNullable<FeedbackPayload["severity"]>;

const SEVERITIES: Severity[] = ["info", "correction", "failed_in_practice"];

export function FeedbackForm({ taskId, onClose }: FeedbackFormProps) {
  const [target, setTarget] = useState("");
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState<Severity>("info");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    const t = target.trim();
    const b = text.trim();
    if (!t || !b || sending) return;
    setSending(true);
    try {
      await postFeedback(taskId, { target: t, text: b, severity });
      setSent(true);
    } catch {
      // Silent fail — retry by closing/reopening the form.
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="banner" data-tone="success" style={{ marginTop: 12 }}>
        <Info sz={13} className="icon" />
        <span>Feedback submitted. The agent will see it on the next relevant task.</span>
        <button className="btn ghost small" onClick={onClose} style={{ marginLeft: "auto" }}>Close</button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="h-row">
        <h3>Submit feedback</h3>
        <button className="btn ghost small" onClick={onClose}>Cancel</button>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        Help the agent improve. Stored and surfaced on matching future tasks.
      </p>
      <input
        className="composer-input"
        placeholder="Target (e.g. subtask type, step id, workflow)"
        style={{ minHeight: "unset", padding: "6px 10px" }}
        value={target}
        onChange={e => setTarget(e.target.value)}
      />
      <textarea
        className="composer-input"
        placeholder="Describe what could be improved or what went wrong…"
        value={text}
        onChange={e => setText(e.target.value)}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span className="muted" style={{ fontSize: 12 }}>Severity</span>
        {SEVERITIES.map(s => (
          <button
            key={s}
            className={`btn small${severity === s ? "" : " ghost"}`}
            onClick={() => setSeverity(s)}
          >
            {s === "failed_in_practice" ? "failed" : s}
          </button>
        ))}
        <button
          className="btn primary small"
          style={{ marginLeft: "auto" }}
          onClick={() => void submit()}
          disabled={sending || !target.trim() || !text.trim()}
        >
          Submit
        </button>
      </div>
    </div>
  );
}
