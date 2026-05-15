// Author avatar — H/A/S initial letter. Mirrors components.jsx AuthorAvatar.
// Color is driven by CSS data-author selector on the parent .msg element.

type Author = "human" | "agent" | "system";

interface AuthorAvatarProps {
  author: Author;
}

export function AuthorAvatar({ author }: AuthorAvatarProps) {
  const letter = author === "human" ? "H" : author === "agent" ? "A" : "S";
  return <div className="msg-avatar">{letter}</div>;
}
