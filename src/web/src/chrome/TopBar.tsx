// Ported from agentboard/chrome.jsx — TopBar component.
// Wired to store for connection state and notifications.
// S7: repo dropdown replacing static "agentboard" text.

import { useState } from "react";
import { basename } from "../lib/path-utils";
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
  /** S7: list of known repo paths from GET /api/daemon/repos */
  availableRepos: string[];
  /** S7: currently active repo root (null = none selected) */
  activeRepo: string | null;
  /** S7: called when the user selects a different repo */
  onSwitchRepo: (repo: string) => void;
  /** #621: map from normalized path → original display path (preserves Win32 casing) */
  displayPaths?: Record<string, string>;
}

export function TopBar({ view, onSetView, theme, onToggleTheme, availableRepos, activeRepo, onSwitchRepo, displayPaths }: TopBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const repoLabel = activeRepo != null ? basename(activeRepo) : en.repo_none;

  return (
    <div className="ab-topbar">
      <div className="ab-brand">
        <span className="ab-brand-mark"><LogoMark /></span>
        <span>{en.brand_name}</span>
        <span className="muted mono" style={{ fontSize: 11, marginLeft: 4 }}>{en.brand_version}</span>
      </div>
      <span className="muted">/</span>

      {/* S7: Repo selector dropdown */}
      <div className="ab-breadcrumb" style={{ position: "relative" }}>
        <Folder sz={12} />
        <button
          className="ab-repo-selector"
          onClick={() => setDropdownOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={dropdownOpen}
        >
          <span className="repo">{repoLabel}</span>
          <ChevronDown sz={11} />
        </button>

        {dropdownOpen && availableRepos.length > 0 && (
          <ul
            className="ab-repo-dropdown"
            role="listbox"
            style={{ position: "absolute", top: "100%", left: 0, zIndex: 100 }}
          >
            {availableRepos.map((repo) => (
              <li
                key={repo}
                role="option"
                aria-selected={repo === activeRepo}
                onClick={() => {
                  onSwitchRepo(repo);
                  setDropdownOpen(false);
                }}
              >
                <span className="repo-basename">{basename(repo)}</span>
                <span className="repo-full muted">{(displayPaths && displayPaths[repo]) ?? repo}</span>
              </li>
            ))}
          </ul>
        )}
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
