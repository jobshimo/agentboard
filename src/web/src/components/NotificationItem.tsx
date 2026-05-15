// Bell-popover row. Mirrors components.jsx NotificationItem.
// Tone and icon are derived from urgency.

import type { Notification } from "../lib/store";
import { Pause, Alert, Info } from "../icons";

interface NotificationItemProps {
  n: Notification;
}

export function NotificationItem({ n }: NotificationItemProps) {
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
        <div className="notif-meta">
          {n.body} · {n.at}
        </div>
      </div>
    </div>
  );
}
