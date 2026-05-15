// Ported from agentboard/chrome.jsx — TopBar component.
// Wired to store for connection state and notifications.

import type { ViewName } from "../lib/store";
import type { Theme } from "../lib/theme";
import { LogoMark, Folder, ChevronDown, Search, Sun, Moon, Gear } from "../icons";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { NotificationBadge } from "./NotificationBadge";
import { en } from "../i18n/en";

interface TopBarProps {
  view: ViewName;
  onSetView: (v: ViewName) => void;
  theme: Theme;
  onToggleTheme: () => void;
}

export function TopBar({ view, onSetView, theme, onToggleTheme }: TopBarProps) {
  return (
    <div className="ab-topbar">
      <div className="ab-brand">
        <span className="ab-brand-mark"><LogoMark /></span>
        <span>{en.brand_name}</span>
        <span className="muted mono" style={{ fontSize: 11, marginLeft: 4 }}>{en.brand_version}</span>
      </div>
      <span className="muted">/</span>
      <div className="ab-breadcrumb">
        <Folder sz={12} />
        <span className="repo">agentboard</span>
        <ChevronDown sz={11} />
      </div>
      <div className="ab-tabs">
        <button
          className="ab-tab"
          data-active={String(view === "board")}
          onClick={() => onSetView("board")}
        >
          {en.tab_board}
        </button>
        <button
          className="ab-tab"
          data-active={String(view === "settings")}
          onClick={() => onSetView("settings")}
        >
          {en.tab_settings}
        </button>
      </div>
      <div className="ab-topbar-right">
        <div className="ab-search" role="search">
          <Search sz={12} />
          <span style={{ flex: 1 }}>{en.search_placeholder}</span>
          <kbd>{en.search_shortcut}</kbd>
        </div>
        <ConnectionIndicator />
        <NotificationBadge />
        <button
          className="ab-iconbtn"
          onClick={onToggleTheme}
          aria-label={en.aria_theme_toggle}
        >
          {theme === "dark" ? <Sun sz={14} /> : <Moon sz={14} />}
        </button>
        <button
          className="ab-iconbtn"
          onClick={() => onSetView("settings")}
          aria-label={en.aria_settings}
        >
          <Gear sz={14} />
        </button>
      </div>
    </div>
  );
}
