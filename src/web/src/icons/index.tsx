// Icon library — ported from agentboard/icons.jsx.
// Single style: 1.5px stroke, currentColor, 16-grid. Use sz prop to scale.

import type { CSSProperties, ReactNode } from "react";

interface IconProps {
  sz?: number;
  strokeWidth?: number;
  fill?: string;
  style?: CSSProperties;
}

interface IconBaseProps extends IconProps {
  children: ReactNode;
}

const Icon = ({ children, sz = 14, strokeWidth = 1.6, fill = "none", style }: IconBaseProps) => (
  <svg
    width={sz}
    height={sz}
    viewBox="0 0 16 16"
    fill={fill}
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const LogoMark = ({ sz = 18 }: { sz?: number }) => (
  <svg width={sz} height={sz} viewBox="0 0 20 20" aria-hidden="true">
    <rect x="1.5" y="1.5" width="17" height="17" rx="4.5" fill="none" stroke="currentColor" strokeWidth="1.4"/>
    <circle cx="6.5" cy="7" r="1.6" fill="currentColor"/>
    <circle cx="13.5" cy="7" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.4"/>
    <circle cx="6.5" cy="13" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="1.4 1.4"/>
    <circle cx="13.5" cy="13" r="1.6" fill="currentColor" opacity="0.5"/>
  </svg>
);

export const ChevronRight  = (p: IconProps) => <Icon {...p}><path d="M6 4l4 4-4 4"/></Icon>;
export const ChevronDown   = (p: IconProps) => <Icon {...p}><path d="M4 6l4 4 4-4"/></Icon>;
export const ArrowLeft     = (p: IconProps) => <Icon {...p}><path d="M10 4L6 8l4 4"/><path d="M6 8h6"/></Icon>;
export const ArrowUpRight  = (p: IconProps) => <Icon {...p}><path d="M5 11L11 5"/><path d="M6 5h5v5"/></Icon>;
export const Search        = (p: IconProps) => <Icon {...p}><circle cx="7" cy="7" r="4"/><path d="M10 10l3 3"/></Icon>;
export const Bell          = (p: IconProps) => <Icon {...p}><path d="M4 11h8l-1-2V6.5A3 3 0 0 0 5 6.5V9l-1 2z"/><path d="M6.5 13a1.5 1.5 0 0 0 3 0"/></Icon>;
export const Gear          = (p: IconProps) => <Icon {...p}><circle cx="8" cy="8" r="2"/><path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M3.8 12.2l1-1M11.2 4.8l1-1"/></Icon>;
export const Sun           = (p: IconProps) => <Icon {...p}><circle cx="8" cy="8" r="2.5"/><path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M3.8 12.2l1-1M11.2 4.8l1-1"/></Icon>;
export const Moon          = (p: IconProps) => <Icon {...p}><path d="M13 9.5A5 5 0 1 1 6.5 3a4 4 0 0 0 6.5 6.5z"/></Icon>;
export const Plus          = (p: IconProps) => <Icon {...p}><path d="M8 3.5v9M3.5 8h9"/></Icon>;
export const Check         = (p: IconProps) => <Icon {...p}><path d="M3.5 8.5L6.5 11 12.5 5"/></Icon>;
export const CheckSm       = (p: IconProps) => <Icon {...p} strokeWidth={2}><path d="M3 8.5L6.5 12 13 5"/></Icon>;
export const Pause         = (p: IconProps) => <Icon {...p} strokeWidth={2}><path d="M6 4v8M10 4v8"/></Icon>;
export const X             = (p: IconProps) => <Icon {...p} strokeWidth={2}><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></Icon>;
export const Lock          = (p: IconProps) => <Icon {...p}><rect x="3.5" y="7.5" width="9" height="6" rx="1.5"/><path d="M5.5 7.5V5.5a2.5 2.5 0 1 1 5 0v2"/></Icon>;
export const Bolt          = (p: IconProps) => <Icon {...p} fill="currentColor" stroke="none"><path d="M9 1.5L3.5 9h3l-1 5.5L11 7H8z"/></Icon>;
export const Inbox         = (p: IconProps) => <Icon {...p}><path d="M2 8.5L4 3h8l2 5.5"/><path d="M2 8.5V12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8.5h-4l-1 1.5H7l-1-1.5H2z"/></Icon>;
export const Archive       = (p: IconProps) => <Icon {...p}><rect x="2" y="3" width="12" height="3" rx="1"/><path d="M3 6v6.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6"/><path d="M6.5 9h3"/></Icon>;
export const ListIcon      = (p: IconProps) => <Icon {...p}><path d="M5 4h8M5 8h8M5 12h8"/><circle cx="2.5" cy="4" r=".6" fill="currentColor"/><circle cx="2.5" cy="8" r=".6" fill="currentColor"/><circle cx="2.5" cy="12" r=".6" fill="currentColor"/></Icon>;
export const Folder        = (p: IconProps) => <Icon {...p}><path d="M2 4.5v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1H8L6.5 3H3a1 1 0 0 0-1 1z"/></Icon>;
export const Info          = (p: IconProps) => <Icon {...p}><circle cx="8" cy="8" r="6"/><path d="M8 7v3.5M8 5.2v.1"/></Icon>;
export const Alert         = (p: IconProps) => <Icon {...p}><path d="M8 2l6 11H2z"/><path d="M8 7v3M8 11.5v.1"/></Icon>;
export const TerminalIcon  = (p: IconProps) => <Icon {...p}><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M4.5 6.5L6.5 8 4.5 9.5M8 10h3.5"/></Icon>;
export const Wifi          = (p: IconProps) => <Icon {...p}><path d="M2 6a8 8 0 0 1 12 0M4 8.5a5 5 0 0 1 8 0M6 11a2.5 2.5 0 0 1 4 0"/><circle cx="8" cy="13.5" r=".5" fill="currentColor"/></Icon>;
export const WifiOff       = (p: IconProps) => <Icon {...p}><path d="M2 6a8 8 0 0 1 4-2.5M14 6a8 8 0 0 0-4-2.5M4 8.5a5 5 0 0 1 2-1.5M12 8.5a5 5 0 0 0-2-1.5"/><path d="M2 2l12 12" strokeWidth="1.8"/></Icon>;
export const MoreH         = (p: IconProps) => <Icon {...p}><circle cx="4" cy="8" r=".7" fill="currentColor"/><circle cx="8" cy="8" r=".7" fill="currentColor"/><circle cx="12" cy="8" r=".7" fill="currentColor"/></Icon>;
export const Sparkle       = (p: IconProps) => <Icon {...p}><path d="M8 2.5v3M8 10.5v3M2.5 8h3M10.5 8h3M4.5 4.5l1.5 1.5M10 10l1.5 1.5M4.5 11.5L6 10M10 6l1.5-1.5"/></Icon>;
export const Send          = (p: IconProps) => <Icon {...p}><path d="M13.5 2.5L2 8l5 1.5L8.5 14z"/><path d="M13.5 2.5L7 9.5"/></Icon>;

// Origin glyphs
export const GitHubMark = ({ sz = 12 }: { sz?: number }) => (
  <svg width={sz} height={sz} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.18.55-.39v-1.36c-2.23.48-2.7-1.07-2.7-1.07-.36-.93-.9-1.18-.9-1.18-.73-.5.06-.49.06-.49.81.06 1.24.83 1.24.83.72 1.24 1.9.88 2.36.67.07-.52.28-.88.51-1.08-1.78-.2-3.65-.89-3.65-3.96 0-.87.31-1.59.83-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.52.56.82 1.28.82 2.15 0 3.08-1.87 3.75-3.66 3.95.29.25.55.74.55 1.5v2.22c0 .22.15.47.55.39A8 8 0 0 0 8 0z"/>
  </svg>
);

export const JiraMark = ({ sz = 12 }: { sz?: number }) => (
  <svg width={sz} height={sz} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M14.5 7.5L8.5 1.5a3 3 0 0 0 0 4.24l2.18 2.18-2.18 2.18a3 3 0 0 0 0 4.24l6-6a.5.5 0 0 0 0-.84z"/>
    <path d="M8 8L4 4a3 3 0 0 0 0 4.24l4 4 4-4a3 3 0 0 0 0-4.24L8 8z" opacity="0.6"/>
  </svg>
);

export const LinearMark = ({ sz = 12 }: { sz?: number }) => (
  <svg width={sz} height={sz} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M1.7 9.4l4.9 4.9a7 7 0 0 1-4.9-4.9zm-.3-2.6l7.8 7.8a7 7 0 0 1-1.9.4L1 8.7a7 7 0 0 1 .4-1.9zm.8-2L11.2 14a7 7 0 0 1-1.5.9L1.3 6.4a7 7 0 0 1 .9-1.5zm1.7-2L14.2 12.1a7 7 0 0 1-1.2 1.3L2.6 3a7 7 0 0 1 1.3-1.2zM8 1a7 7 0 0 1 7 7L8 1z"/>
  </svg>
);

export const LocalMark = ({ sz = 12 }: { sz?: number }) => (
  <svg width={sz} height={sz} viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="3" fill="currentColor"/>
  </svg>
);

export const OriginGlyph = ({ source, sz }: { source: string; sz?: number }) => {
  if (source === "github") return <GitHubMark sz={sz} />;
  if (source === "jira") return <JiraMark sz={sz} />;
  if (source === "linear") return <LinearMark sz={sz} />;
  return <LocalMark sz={sz} />;
};
