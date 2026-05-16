/**
 * agentboard TUI — Ink + React.
 * Launched when `agentboard` is invoked from a TTY with no arguments.
 *
 * This module is the screen-routing hub. Each sub-screen lives in
 * src/cli/tui/screens/. The shared Frame component wraps every screen
 * with a round border, StatusBar, and FooterKeys strip.
 *
 * The old box-drawing Banner (╭─ agentboard ─╮) is removed. Status
 * information lives in the global StatusBar inside Frame.
 */
import React, { useState, useCallback, useEffect } from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import { spawn, exec } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readLanguage, writeLanguage } from "../i18n/lang-config.js";
import { t } from "../i18n/strings.js";
import { palette } from "./palette.js";
import { MenuScreen } from "./tui/screens/MenuScreen.js";
import type { MenuAction } from "./tui/screens/MenuScreen.js";
import { InstallScreen } from "./tui/screens/InstallScreen.js";
import { ProjectsScreen } from "./tui/screens/ProjectsScreen.js";
import { DoctorScreen } from "./tui/screens/DoctorScreen.js";
import { UpdateScreen } from "./tui/screens/UpdateScreen.js";

// ─── Banner (kept for backwards-compatibility with existing tests) ─────────────

const BOX_WIDTH = 60;
const SEPARATOR = "─".repeat(BOX_WIDTH);

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

export interface BannerProps {
  version: string;
  repoLabel: string;
  daemonStatus?: "running" | "stopped" | "checking";
  daemonPort?: number;
}

/**
 * Box-drawing header banner — kept so existing tests in tui-banner.test.tsx
 * continue to pass. The new TUI does NOT render this directly; use Frame
 * with StatusBar instead. This export remains for test compatibility.
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
      <Ct color={palette.muted}>{topBorder}</Ct>
      <Text>
        <Ct color={palette.muted}>{"│  "}</Ct>
        <Ct color={palette.accent}>{"◆ "}</Ct>
        <Ct color={palette.highlight} bold>{"agentboard "}</Ct>
        <Ct color={palette.muted}>{pad(`v${version}`, BOX_WIDTH - 12)}</Ct>
        <Ct color={palette.muted}>{"│"}</Ct>
      </Text>
      <Text>
        <Ct color={palette.muted}>{"│  "}</Ct>
        <Ct color={palette.muted}>{"repo  "}</Ct>
        <Ct color={palette.default}>{pad(repoLabel, BOX_WIDTH - 8)}</Ct>
        <Ct color={palette.muted}>{"│"}</Ct>
      </Text>
      <Text>
        <Ct color={palette.muted}>{"│  "}</Ct>
        <Ct color={palette.muted}>{"store "}</Ct>
        <Ct color={palette.default}>{pad(".agentboard/db.sqlite", BOX_WIDTH - 8)}</Ct>
        <Ct color={palette.muted}>{"│"}</Ct>
      </Text>
      {daemonRow}
      <Ct color={palette.muted}>{bottomBorder}</Ct>
    </Box>
  );
}

// ─── Daemon spawn helpers (kept for re-use in App) ────────────────────────────

/** Build the args needed to spawn the daemon as a detached child. Exported for testing. */
export function buildDaemonSpawnArgs(agbHome: string): { execPath: string; args: string[] } {
  const entryPath = join(dirname(fileURLToPath(import.meta.url)), "index.js");
  return {
    execPath: process.execPath,
    args: [entryPath, "daemon", "--no-open"],
  };
}

function daemonEnv(agbHome: string): NodeJS.ProcessEnv {
  return { ...process.env, AGB_HOME: agbHome };
}

// ─── Screen type ──────────────────────────────────────────────────────────────

type Screen =
  | { kind: 'menu'; statusMessage?: string }
  | { kind: 'install' }
  | { kind: 'uninstall' }
  | { kind: 'projects' }
  | { kind: 'doctor' }
  | { kind: 'update' };

// ─── App ──────────────────────────────────────────────────────────────────────

interface AppProps {
  agbHome: string;
  initialLang: "en" | "es";
}

export interface TuiOptions {
  agbHome: string;
}

function App({ agbHome, initialLang }: AppProps): React.ReactElement {
  const { exit } = useApp();
  const [lang, setLang] = useState<'en' | 'es'>(initialLang);
  const [screen, setScreen] = useState<Screen>({ kind: 'menu' });

  // Global Ctrl+C
  useInput((_input, key) => {
    if (key.ctrl && _input === 'c') exit();
  });

  const goMenu = useCallback((statusMessage?: string) => {
    if (statusMessage !== undefined) {
      setScreen({ kind: 'menu', statusMessage });
    } else {
      setScreen({ kind: 'menu' });
    }
  }, []);

  const swapLang = useCallback(() => {
    setLang((l) => {
      const next = l === 'en' ? 'es' : 'en';
      writeLanguage(agbHome, next);
      return next;
    });
  }, [agbHome]);

  const handleMenuSelect = useCallback(
    async (action: MenuAction): Promise<void> => {
      switch (action) {
        case 'start-daemon': {
          try {
            const { execPath, args } = buildDaemonSpawnArgs(agbHome);
            const child = spawn(execPath, args, {
              detached: true,
              stdio: 'ignore',
              env: daemonEnv(agbHome),
            });
            child.unref();
            const pid = String(child.pid ?? '?');
            goMenu(t('tui.action.daemon_started', lang).replace('{pid}', pid));
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            goMenu(t('tui.action.daemon_spawn_error', lang).replace('{error}', msg));
          }
          break;
        }

        case 'open-web-ui': {
          const url = 'http://localhost:7733';
          const cmd =
            process.platform === 'win32'
              ? `start "" "${url}"`
              : process.platform === 'darwin'
                ? `open "${url}"`
                : `xdg-open "${url}"`;
          exec(cmd, () => { /* non-fatal */ });
          goMenu(t('tui.action.browser_opening', lang));
          break;
        }

        case 'list-projects':
          setScreen({ kind: 'projects' });
          break;

        case 'install-mcp':
          setScreen({ kind: 'install' });
          break;

        case 'uninstall':
          setScreen({ kind: 'uninstall' });
          break;

        case 'doctor':
          setScreen({ kind: 'doctor' });
          break;

        case 'update-check':
          setScreen({ kind: 'update' });
          break;

        // language-toggle and quit are handled by MenuScreen directly
        default:
          break;
      }
    },
    [lang, agbHome, goMenu],
  );

  switch (screen.kind) {
    case 'menu':
      return (
        <MenuScreen
          lang={lang}
          agbHome={agbHome}
          onSelect={(action) => { void handleMenuSelect(action); }}
          onSwapLang={swapLang}
          onQuit={exit}
          {...(screen.statusMessage !== undefined ? { statusMessage: screen.statusMessage } : {})}
        />
      );

    case 'install':
      return (
        <InstallScreen
          lang={lang}
          agbHome={agbHome}
          mode="install"
          onBack={() => goMenu()}
        />
      );

    case 'uninstall':
      return (
        <InstallScreen
          lang={lang}
          agbHome={agbHome}
          mode="uninstall"
          onBack={() => goMenu()}
        />
      );

    case 'projects':
      return (
        <ProjectsScreen
          lang={lang}
          agbHome={agbHome}
          onBack={() => goMenu()}
        />
      );

    case 'doctor':
      return (
        <DoctorScreen
          lang={lang}
          agbHome={agbHome}
          onBack={() => goMenu()}
        />
      );

    case 'update':
      return (
        <UpdateScreen
          lang={lang}
          agbHome={agbHome}
          onBack={() => goMenu()}
        />
      );
  }
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
