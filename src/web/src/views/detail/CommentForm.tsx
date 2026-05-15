// Comment composer — mirrors the .composer div in detail.jsx.
// Textarea + submit. ⌘+Enter sends. Dispatches APPEND_DISCUSSION_ENTRY on success.

import { useState } from "react";
import type { KeyboardEvent } from "react";
import { Plus } from "../../icons";
import { postComment } from "../../lib/api";
import { dispatch } from "../../lib/store";
import { en } from "../../i18n/en";

interface CommentFormProps {
  taskId: string;
  onAddCustomSubtask?: () => void;
}

export function CommentForm({ taskId, onAddCustomSubtask }: CommentFormProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const entry = await postComment(taskId, body);
      dispatch({ type: "APPEND_DISCUSSION_ENTRY", taskId, entry });
      setText("");
    } catch {
      // Error surfacing is out of S10c scope — silent fail, retry manually.
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="composer">
      <textarea
        className="composer-input"
        placeholder={en.comment_placeholder}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={sending}
      />
      <div className="composer-actions">
        <span className="composer-hint">{en.comment_hint}</span>
        {onAddCustomSubtask && (
          <button className="btn ghost small" onClick={onAddCustomSubtask}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Plus sz={11} /> {en.comment_custom_subtask}
            </span>
          </button>
        )}
        <button className="btn primary" onClick={() => void submit()} disabled={sending || !text.trim()}>
          {en.comment_submit}
        </button>
      </div>
    </div>
  );
}
