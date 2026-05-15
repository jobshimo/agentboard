// Markdown renderer — wraps react-markdown.
// Audit note per design §8 item 5: react-markdown is already in devDependencies.
// The .msg-body wrapper provides all prose styles via CSS (code, a, ul, li, p, strong).
// system prop adds data-system="true" which CSS uses to render as a monospace warning banner.

import ReactMarkdown from "react-markdown";

interface MarkdownProps {
  children: string;
  system?: boolean;
}

export function Markdown({ children, system = false }: MarkdownProps) {
  return (
    <div className="msg-body" data-system={system ? "true" : "false"}>
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
