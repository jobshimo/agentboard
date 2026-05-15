// Feedback form — visible when user clicks the Feedback button in detail sub-bar.
// target + severity + text → POST /api/tasks/:id/feedback.
// YAGNI: no threading, no file upload, no emoji reactions.

import { useState } from "react";
import { postFeedback } from "../../lib/api";
import type { FeedbackPayload } from "../../lib/api";
import { Info } from "../../icons";
import { en } from "../../i18n/en";

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
        <span>{en.feedback_sent}</span>
        <button className="btn ghost small" onClick={onClose} style={{ marginLeft: "auto" }}>{en.feedback_close}</button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="h-row">
        <h3>{en.feedback_title}</h3>
        <button className="btn ghost small" onClick={onClose}>{en.feedback_cancel}</button>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        {en.feedback_help}
      </p>
      <input
        className="composer-input"
        placeholder={en.feedback_target_placeholder}
        style={{ minHeight: "unset", padding: "6px 10px" }}
        value={target}
        onChange={e => setTarget(e.target.value)}
      />
      <textarea
        className="composer-input"
        placeholder={en.feedback_text_placeholder}
        value={text}
        onChange={e => setText(e.target.value)}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span className="muted" style={{ fontSize: 12 }}>{en.feedback_severity_label}</span>
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
          {en.feedback_submit}
        </button>
      </div>
    </div>
  );
}
