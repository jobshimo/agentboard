/**
 * agentboard TUI — Ink + React.
 * Launched when `agentboard` is invoked from a TTY with no arguments.
 */
import React, { useState, useCallback } from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import SelectInput from "ink-select-input";
import { exec } from "node:child_process";
import { buildMenuItems, toggleLanguage, type TuiState } from "./tui-helpers.js";
import { readLanguage, writeLanguage } from "../i18n/lang-config.js";
import { t } from "../i18n/strings.js";
import { runInstall, runUninstall } from "./install-cmd.js";
import { runStart } from "./start.js";
import { buildDoctorReport, formatDoctorReport } from "./doctor-report.js";
import { checkForUpdate } from "./update-check.js";
import { getVersion } from "./version.js";

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

function App({ agbHome, initialLang }: AppProps): React.ReactElement {
  const { exit } = useApp();

  const [state, setState] = useState<TuiState>({ lang: initialLang, agbHome });
  const [screen, setScreen] = useState<Screen>("menu");
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const { lang } = state;

  // Global hotkeys
  useInput((_input, key) => {
    if (key.escape || _input === "q") {
      exit();
    }
    if (_input === "l" && screen === "menu") {
      const next = toggleLanguage(state);
      setState(next);
      writeLanguage(agbHome, next.lang);
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
          setLoading(true);
          try {
            await runStart({ port: 0, noOpen: false, verbose: false, cwd: process.cwd() });
            showMessage(t("tui.daemon_started", lang));
          } catch (e) {
            showMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
          } finally {
            setLoading(false);
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
            showMessage(formatDoctorReport(report));
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

  if (loading) {
    return (
      <Box>
        <Text color="cyan">…</Text>
      </Box>
    );
  }

  if (screen === "message") {
    return (
      <Box flexDirection="column">
        <Text>{message}</Text>
        <Text dimColor>Press any key to return to the menu.</Text>
      </Box>
    );
  }

  if (screen === "projects") {
    return (
      <Box flexDirection="column">
        <Text bold>{t("tui.projects_header", lang)}</Text>
        <Text dimColor>{t("tui.no_projects", lang)}</Text>
        <Text dimColor>Press Esc or q to return.</Text>
      </Box>
    );
  }

  if (screen === "install") {
    const items = [
      { label: `${t("install.menu.all_detected", lang)}`, value: "all" },
      { label: "Claude Code", value: "claude-code" },
      { label: "OpenCode", value: "opencode" },
      { label: "GitHub Copilot", value: "copilot" },
      { label: t("install.menu.back", lang), value: "back" },
    ];

    return (
      <Box flexDirection="column">
        <Text bold>{t("install.menu.title", lang)}</Text>
        <SelectInput
          items={items}
          onSelect={async (item) => {
            if (item.value === "back") {
              setScreen("menu");
              return;
            }
            setLoading(true);
            try {
              await runInstall({ clientId: item.value === "all" ? null : item.value as "claude-code" | "opencode" | "copilot", dryRun: false });
              showMessage(t("install.success", lang).replace("{client}", item.label));
            } catch (e) {
              showMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
            } finally {
              setLoading(false);
            }
          }}
        />
      </Box>
    );
  }

  if (screen === "uninstall") {
    const items = [
      { label: t("install.menu.all_detected", lang), value: "all" },
      { label: "Claude Code", value: "claude-code" },
      { label: "OpenCode", value: "opencode" },
      { label: "GitHub Copilot", value: "copilot" },
      { label: t("install.menu.back", lang), value: "back" },
    ];

    return (
      <Box flexDirection="column">
        <Text bold>{t("uninstall.menu.title", lang)}</Text>
        <SelectInput
          items={items}
          onSelect={async (item) => {
            if (item.value === "back") {
              setScreen("menu");
              return;
            }
            setLoading(true);
            try {
              await runUninstall({ clientId: item.value === "all" ? null : item.value as "claude-code" | "opencode" | "copilot", dryRun: false });
              showMessage(t("uninstall.success", lang).replace("{client}", item.label));
            } catch (e) {
              showMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
            } finally {
              setLoading(false);
            }
          }}
        />
      </Box>
    );
  }

  // Default: main menu
  const menuItems = buildMenuItems(lang);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">agentboard</Text>
        <Text dimColor> v{getVersion()}</Text>
      </Box>
      <SelectInput items={menuItems} onSelect={handleMenuSelect} />
      <Box marginTop={1}>
        <Text dimColor>l = toggle language  q = quit</Text>
      </Box>
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
