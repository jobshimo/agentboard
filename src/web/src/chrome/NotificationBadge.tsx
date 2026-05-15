// Notification bell with unread dot + popover list.
// Ported from agentboard/chrome.jsx notification block + NotificationItem from components.jsx.

import { useState } from "react";
import { Bell, Info, Alert, Pause } from "../icons";
import { useNotifications, dispatch } from "../lib/store";
import type { Notification } from "../lib/store";
import { en } from "../i18n/en";

function NotificationItem({ n }: { n: Notification }) {
  const dotState =
    n.urgency === "blocked" ? "blocked" :
    n.urgency === "warning" ? "failed" :
    "in-progress";

  const Icon =
    n.urgency === "blocked" ? Pause :
    n.urgency === "warning" ? Alert :
    Info;

  return (
    <div className="notif-item">
      <div className="notif-icon">
        <span className="state-dot lg" data-state={dotState}>
          <Icon sz={8} />
        </span>
      </div>
      <div>
        <div className="notif-title">{n.title}</div>
        <div className="notif-meta">{n.body} · {n.at}</div>
      </div>
    </div>
  );
}

export function NotificationBadge() {
  const [open, setOpen] = useState(false);
  const notifications = useNotifications();
  const unread = notifications.filter(n => n.urgency !== "info").length;

  return (
    <div style={{ position: "relative" }}>
      <button
        className="ab-iconbtn"
        onClick={() => setOpen(o => !o)}
        aria-label={en.aria_notifications}
      >
        <Bell sz={14} />
        {unread > 0 && <span className="badge-dot" />}
      </button>
      {open && (
        <div className="popover" onMouseLeave={() => setOpen(false)}>
          <div className="popover-head">
            <span>{en.notif_title}</span>
            <button
              className="btn ghost small"
              onClick={() => dispatch({ type: "MARK_ALL_READ" })}
            >
              {en.notif_mark_all_read}
            </button>
          </div>
          <div className="popover-body">
            {notifications.map(n => <NotificationItem key={n.id} n={n} />)}
          </div>
        </div>
      )}
    </div>
  );
}
