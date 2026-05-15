// Single discussion entry. Mirrors components.jsx Message 1:1.
// System messages get data-system="true" (passed to Markdown) for CSS warning banner.

import { AuthorAvatar } from "../../components/AuthorAvatar";
import { Markdown } from "../../components/Markdown";
import type { DiscussionEntry } from "../../lib/api";

interface MessageProps {
  entry: DiscussionEntry;
}

export function Message({ entry }: MessageProps) {
  // Short HH:MM display — full ISO is available via title attr if needed later.
  const time = new Date(entry.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="msg" data-author={entry.author}>
      <AuthorAvatar author={entry.author} />
      <div>
        <div className="msg-head">
          <span className="msg-author">{entry.author}</span>
          <span className="msg-time">{time}</span>
          {entry.tag && <span className="msg-tag">{entry.tag}</span>}
        </div>
        <Markdown system={entry.author === "system"}>{entry.body}</Markdown>
      </div>
    </div>
  );
}
