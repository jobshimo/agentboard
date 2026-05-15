// Inline form to add a custom subtask. Appears below the custom subtask list.
// Mirrors the add-custom button + inline expand pattern from detail.jsx.

import { useState } from "react";
import { Plus } from "../../icons";
import { postCustomSubtask } from "../../lib/api";
import { dispatch } from "../../lib/store";
import { en } from "../../i18n/en";

interface AddCustomSubtaskFormProps {
  taskId: string;
}

export function AddCustomSubtaskForm({ taskId }: AddCustomSubtaskFormProps) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);

  async function submit() {
    const l = label.trim();
    if (!l || adding) return;
    setAdding(true);
    try {
      const subtask = await postCustomSubtask(taskId, l);
      dispatch({ type: "UPSERT_SUBTASK", taskId, subtask });
      setLabel("");
      setOpen(false);
    } catch {
      // Silent fail.
    } finally {
      setAdding(false);
    }
  }

  if (!open) {
    return (
      <button className="add-custom" onClick={() => setOpen(true)}>
        <Plus sz={11} /> {en.custom_subtask_add_btn}
      </button>
    );
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 0" }}>
      <input
        className="composer-input"
        autoFocus
        placeholder={en.custom_subtask_placeholder}
        style={{ flex: 1, minHeight: "unset", padding: "5px 8px" }}
        value={label}
        onChange={e => setLabel(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") setOpen(false);
        }}
        disabled={adding}
      />
      <button className="btn small primary" onClick={() => void submit()} disabled={adding || !label.trim()}>{en.custom_subtask_confirm}</button>
      <button className="btn ghost small" onClick={() => setOpen(false)}>{en.custom_subtask_cancel}</button>
    </div>
  );
}
