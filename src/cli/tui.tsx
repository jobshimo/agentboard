/**
 * agentboard TUI — Ink + React.
 * Launched when `agentboard` is invoked from a TTY with no arguments.
 *
 * Visual language matches cli.jsx design mocks:
 *   - box-drawing frames: ╭─╮│╰╯
 *   - palette from src/cli/palette.ts (sourced from styles.css .theme-dark)
 *   - cursor: › for selected menu item
 *   - symbols: ◆ ✓ · for status indicators
 */
import React, { useState, useCallback, useEffect } from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import type { TextProps } from "ink";
import { spawn, exec } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMenuItems, toggleLanguage, type TuiState } from "./tui-helpers.js";
import { readLanguage, writeLanguage } from "../i18n/lang-config.js";
import { t } from "../i18n/strings.js";
import { runInstall, runUninstall } from "./install-cmd.js";
import { buildDoctorReport, formatDoctorReport } from "./doctor-report.js";
import { checkForUpdate } from "./update-check.js";
import { getVersion } from "./version.js";
import { palette } from "./palette.js";
import { probeForExistingDaemon } from "./spawn-daemon.js";

// ─── constants ────────────────────────────────────────────────────────────────

/** Fixed inner width of box frames (the content area between │ and │). */
const BOX_WIDTH = 60;

/** Full separator line (─ repeated BOX_WIDTH times). */
const SEPARATOR = "─".repeat(BOX_WIDTH);

// ─── Ct — colored Text wrapper ────────────────────────────────────────────────

/**
 * Thin wrapper around Ink's <Text> that only passes the `color` prop when
 * it is non-empty. This satisfies exactOptionalPropertyTypes: palette values
 * are empty strings under NO_COLOR, which we map to "no color prop passed".
 */
function Ct({ color, children, bold }: { color?: string; children: React.ReactNode; bold?: boolean }): React.ReactElement {
  return (
    <Text
      {...(color ? { color } : {})}
      {...(bold ? { bold } : {})}
    >
      {children}
    </Text>
  );
}

/** Build the args needed to spawn the daemon as a detached child. Exported for testing. */
export function buildDaemonSpawnArgs(agbHome: string): { execPath: string; args: string[] } {
  const entryPath = join(dirname(fileURLToPath(import.meta.url)), "index.js");
  return {
    execPath: process.execPath,
    args: [entryPath, "daemon", "--no-open"],
  };
}

/** Returns env overrides needed by the daemon child process. */
function daemonEnv(agbHome: string): NodeJS.ProcessEnv {
  return { ...process.env, AGB_HOME: agbHome };
}

export interface TuiOptions {
  agbHome: string;
}

type Screen =
  | "menu"
  | "projects"
  | "install"
  | "uninstall"
  | "doctor"
  | "update-check"
  | "message";

interface AppProps {
  agbHome: string;
  initialLang: "en" | "es";
}

// ─── Banner ───────────────────────────────────────────────────────────────────

export interface BannerProps {
  version: string;
  /** Short repo identifier, e.g. "jobshimo/agentboard" or "—". */
  repoLabel: string;
  /** Daemon status for the indicator line. */
  daemonStatus?: "running" | "stopped" | "checking";
  /** Port number shown when daemonStatus === "running". */
  daemonPort?: number;
}

/**
 * Box-drawing header banner matching TermLaunch in cli.jsx:
 *
 *   ╭─ agentboard ──────────────────────────────────────────────╮
 *   │  ◆ agentboard v0.1.0                                      │
 *   │  repo  jobshimo/agentboard                                │
 *   │  store .agentboard/db.sqlite                              │
 *   │  ✓ daemon :7733   (or · daemon stopped)                  │
 *   ╰───────────────────────────────────────────────────────────╯
 */
export function Banner({ version, repoLabel, daemonStatus, daemonPort }: BannerProps): React.ReactElement {
  const titleSegment = " agentboard ";
  const totalDashes = BOX_WIDTH - titleSegment.length;
  const leftDashes = 1;
  const rightDashes = totalDashes - leftDashes;

  const topBorder = `╭${"─".repeat(leftDashes)}${titleSegment}${"─".repeat(rightDashes)}╮`;
  const bottomBorder = `╰${"─".repeat(BOX_WIDTH)}╯`;

  function pad(content: string, width: number): string {
    const visible = [...content].length;
    return content + " ".repeat(Math.max(0, width - visible));
  }

  // Daemon status row
  let daemonRow: React.ReactElement;
  if (daemonStatus === "running" && daemonPort !== undefined) {
    daemonRow = (
      <Text>
        <Ct color={palette.muted}>{"│  "}</Ct>
        <Ct color={palette.ok}>{"✓"}</Ct>
        <Ct color={palette.muted}>{pad(` daemon :${daemonPort}`, BOX_WIDTH - 2)}</Ct>
        <Ct color={palette.muted}>{"│"}</Ct>
      </Text>
    );
  } else if (daemonStatus === "stopped") {
    daemonRow = (
      <Text>
        <Ct color={palette.muted}>{"│  "}</Ct>
        <Ct color={palette.muted}>{"·"}</Ct>
        <Ct color={palette.muted}>{pad(" daemon stopped", BOX_WIDTH - 2)}</Ct>
        <Ct color={palette.muted}>{"│"}</Ct>
      </Text>
    );
  } else {
    daemonRow = (
      <Text>
        <Ct color={palette.muted}>{"│  "}</Ct>
        <Ct color={palette.muted}>{pad("· daemon checking", BOX_WIDTH - 2)}</Ct>
        <Ct color={palette.muted}>{"│"}</Ct>
      </Text>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Top border */}
      <Ct color={palette.muted}>{topBorder}</Ct>

      {/* ◆ agentboard v0.1.0 */}
      <Text>
        <Ct color={palette.muted}>{"│  "}</Ct>
        <Ct color={palette.accent}>{"◆ "}</Ct>
        <Ct color={palette.highlight} bold>{"agentboard "}</Ct>
        <Ct color={palette.muted}>{pad(`v${version}`, BOX_WIDTH - 12)}</Ct>
        <Ct color={palette.muted}>{"│"}</Ct>
      </Text>

      {/* repo  <label> */}
      <Text>
        <Ct color={palette.muted}>{"│  "}</Ct>
        <Ct color={palette.muted}>{"repo  "}</Ct>
        <Ct color={palette.default}>{pad(repoLabel, BOX_WIDTH - 8)}</Ct>
        <Ct color={palette.muted}>{"│"}</Ct>
      </Text>

      {/* store .agentboard/db.sqlite */}
      <Text>
        <Ct color={palette.muted}>{"│  "}</Ct>
        <Ct color={palette.muted}>{"store "}</Ct>
        <Ct color={palette.default}>{pad(".agentboard/db.sqlite", BOX_WIDTH - 8)}</Ct>
        <Ct color={palette.muted}>{"│"}</Ct>
      </Text>

      {/* daemon status row */}
      {daemonRow}

      {/* Bottom border */}
      <Ct color={palette.muted}>{bottomBorder}</Ct>
    </Box>
  );
}

// ─── StyledMenu ───────────────────────────────────────────────────────────────

interface StyledMenuProps {
  items: Array<{ label: string; value: string }>;
  selectedIndex: number;
}

/**
 * Custom menu that renders each item with a `›` cursor on the selected line
 * and muted text for non-selected items — matching cli.jsx TermInit style.
 */
function StyledMenu({ items, selectedIndex }: StyledMenuProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {items.map((item, idx) => {
        const isSelected = idx === selectedIndex;
        return (
          <Text key={item.value}>
            {isSelected
              ? <Ct color={palette.accent}>{"  › "}</Ct>
              : <Ct color={palette.muted}>{"    "}</Ct>
            }
            {isSelected
              ? <Ct color={palette.highlight} bold>{item.label}</Ct>
              : <Ct color={palette.muted}>{item.label}</Ct>
            }
          </Text>
        );
      })}
    </Box>
  );
}

// ─── StatusBar ────────────────────────────────────────────────────────────────

interface StatusBarProps {
  lang: "en" | "es";
}

function StatusBar({ lang }: StatusBarProps): React.ReactElement {
  const hint = t("tui.hotkeys", lang);
  return (
    <Box flexDirection="column" marginTop={1}>
      <Ct color={palette.muted}>{SEPARATOR}</Ct>
      <Ct color={palette.muted}>{hint}</Ct>
    </Box>
  );
}

// ─── SubScreen wrapper ────────────────────────────────────────────────────────

interface SubScreenProps {
  children: React.ReactNode;
  onBack: () => void;
  lang: "en" | "es";
}

function SubScreen({ children, onBack, lang }: SubScreenProps): React.ReactElement {
  useInput((_input, key) => {
    if (key.escape || _input === "q") {
      onBack();
    }
  });

  return (
    <Box flexDirection="column">
      <Ct color={palette.muted}>{`← ${t("tui.press_esc", lang)}`}</Ct>
      <Ct color={palette.muted}>{SEPARATOR}</Ct>
      {children}
    </Box>
  );
}

// ─── InstallScreen ────────────────────────────────────────────────────────────

interface InstallScreenProps {
  lang: "en" | "es";
  onBack: () => void;
  onLoading: (v: boolean) => void;
  onMessage: (msg: string) => void;
  mode: "install" | "uninstall";
}

function InstallScreen({ lang, onBack, onLoading, onMessage, mode }: InstallScreenProps): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const items = [
    { label: t("install.menu.all_detected", lang), value: "all" },
    { label: "Claude Code",     value: "claude-code" },
    { label: "OpenCode",        value: "opencode" },
    { label: "GitHub Copilot",  value: "copilot" },
    { label: t("install.menu.back", lang), value: "back" },
  ];

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    }
    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(items.length - 1, i + 1));
    }
    if (key.return) {
      const item = items[selectedIndex];
      if (!item) return;
      if (item.value === "back") { onBack(); return; }
      void (async () => {
        onLoading(true);
        try {
          const clientId = item.value === "all" ? null : item.value as "claude-code" | "opencode" | "copilot";
          if (mode === "install") {
            await runInstall({ clientId, dryRun: false });
            onMessage(t("install.success", lang).replace("{client}", item.label));
          } else {
            await runUninstall({ clientId, dryRun: false });
            onMessage(t("uninstall.success", lang).replace("{client}", item.label));
          }
        } catch (e) {
          onMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
          onLoading(false);
        }
      })();
    }
    if (key.escape || _input === "q") onBack();
  });

  const title = mode === "install" ? t("install.menu.title", lang) : t("uninstall.menu.title", lang);

  return (
    <SubScreen onBack={onBack} lang={lang}>
      <Ct color={palette.highlight} bold>{title}</Ct>
      <Box marginTop={1}>
        <StyledMenu items={items} selectedIndex={selectedIndex} />
      </Box>
    </SubScreen>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App({ agbHome, initialLang }: AppProps): React.ReactElement {
  const { exit } = useApp();

  const [state, setState] = useState<TuiState>({ lang: initialLang, agbHome });
  const [screen, setScreen] = useState<Screen>("menu");
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [daemonStatus, setDaemonStatus] = useState<"checking" | "running" | "stopped">("checking");
  const [daemonPort, setDaemonPort] = useState<number | undefined>(undefined);

  const { lang } = state;

  // Probe daemon on mount
  useEffect(() => {
    let cancelled = false;
    void probeForExistingDaemon(7733, agbHome).then((result) => {
      if (cancelled) return;
      if ("alreadyRunning" in result && result.alreadyRunning) {
        setDaemonStatus("running");
        setDaemonPort(result.port);
      } else {
        setDaemonStatus("stopped");
      }
    }).catch(() => {
      if (!cancelled) setDaemonStatus("stopped");
    });
    return () => { cancelled = true; };
  }, [agbHome]);

  const menuItems = buildMenuItems(lang);

  // Global hotkeys (menu screen only)
  useInput((_input, key) => {
    if (screen !== "menu") return;
    if (key.escape || _input === "q") { exit(); return; }
    if (_input === "l") {
      const next = toggleLanguage(state);
      setState(next);
      writeLanguage(agbHome, next.lang);
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(menuItems.length - 1, i + 1));
      return;
    }
    if (key.return) {
      const item = menuItems[selectedIndex];
      if (item) void handleMenuSelect({ value: item.value });
    }
  });

  const showMessage = useCallback((msg: string) => {
    setMessage(msg);
    setScreen("message");
  }, []);

  const handleMenuSelect = useCallback(
    async (item: { value: string }) => {
      switch (item.value) {
        case "quit":
          exit();
          break;

        case "start-daemon": {
          try {
            const { execPath, args } = buildDaemonSpawnArgs(agbHome);
            const child = spawn(execPath, args, {
              detached: true,
              stdio: "ignore",
              env: daemonEnv(agbHome),
            });
            child.unref();
            showMessage(t("tui.daemon_started_pid", lang).replace("{pid}", String(child.pid ?? "?")));
          } catch (e) {
            showMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
          }
          break;
        }

        case "open-web-ui": {
          showMessage(t("tui.opening_browser", lang));
          const url = "http://localhost:7733";
          const cmd =
            process.platform === "win32"
              ? `start "" "${url}"`
              : process.platform === "darwin"
                ? `open "${url}"`
                : `xdg-open "${url}"`;
          exec(cmd, () => { /* non-fatal */ });
          break;
        }

        case "list-projects":
          setScreen("projects");
          break;

        case "install-mcp":
          setScreen("install");
          break;

        case "uninstall":
          setScreen("uninstall");
          break;

        case "doctor": {
          setLoading(true);
          try {
            const report = await buildDoctorReport({ agbHome });
            showMessage(formatDoctorReport(report, lang));
          } catch (e) {
            showMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
          } finally {
            setLoading(false);
          }
          break;
        }

        case "update-check": {
          setLoading(true);
          try {
            const result = await checkForUpdate(getVersion());
            if (result.status === "newer") {
              showMessage(t("update.newer_available", lang).replace("{latest}", result.latest ?? "?"));
            } else {
              showMessage(t("update.up_to_date", lang));
            }
          } catch {
            showMessage(t("update.error", lang));
          } finally {
            setLoading(false);
          }
          break;
        }

        case "language-toggle": {
          const next = toggleLanguage(state);
          setState(next);
          writeLanguage(agbHome, next.lang);
          break;
        }
      }
    },
    [lang, state, agbHome, exit, showMessage],
  );

  // ─── Loading indicator ────────────────────────────────────────────────────

  if (loading) {
    return (
      <Box>
        <Ct color={palette.accent}>{"…"}</Ct>
      </Box>
    );
  }

  // ─── Message screen ───────────────────────────────────────────────────────

  if (screen === "message") {
    return (
      <Box flexDirection="column">
        <Text>{message}</Text>
        <Box marginTop={1}>
          <Ct color={palette.muted}>{t("tui.press_any_key", lang)}</Ct>
        </Box>
      </Box>
    );
  }

  // ─── Projects screen ──────────────────────────────────────────────────────

  if (screen === "projects") {
    return (
      <SubScreen onBack={() => setScreen("menu")} lang={lang}>
        <Ct color={palette.highlight} bold>{t("tui.projects_header", lang)}</Ct>
        <Ct color={palette.muted}>{t("tui.no_projects", lang)}</Ct>
      </SubScreen>
    );
  }

  // ─── Install / Uninstall screens ──────────────────────────────────────────

  if (screen === "install" || screen === "uninstall") {
    return (
      <InstallScreen
        lang={lang}
        onBack={() => setScreen("menu")}
        onLoading={setLoading}
        onMessage={showMessage}
        mode={screen}
      />
    );
  }

  // ─── Main menu ────────────────────────────────────────────────────────────

  const repoLabel = process.cwd().split(/[\\/]/).at(-1) ?? "—";

  return (
    <Box flexDirection="column">
      <Banner
        version={getVersion()}
        repoLabel={repoLabel}
        daemonStatus={daemonStatus}
        {...(daemonPort !== undefined ? { daemonPort } : {})}
      />
      <Box marginTop={1}>
        <StyledMenu items={menuItems} selectedIndex={selectedIndex} />
      </Box>
      <StatusBar lang={lang} />
    </Box>
  );
}

export async function runTui(opts: TuiOptions): Promise<void> {
  const { agbHome } = opts;
  const lang = readLanguage(agbHome);

  const { waitUntilExit } = render(
    <App agbHome={agbHome} initialLang={lang} />,
    { exitOnCtrlC: true },
  );

  await waitUntilExit();
}
