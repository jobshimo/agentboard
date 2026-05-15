/**
 * Pure functions that power the TUI.
 * No Ink imports here — fully unit-testable without any React/Ink setup.
 */
import { t } from "../i18n/strings.js";
import type { DoctorReport } from "./doctor-report.js";

export interface MenuItem {
  label: string;
  value: string;
}

export interface TuiState {
  lang: "en" | "es";
  agbHome: string;
}

export interface RegistryRow {
  label: string;
}

/** Build the main menu items for the given language. */
export function buildMenuItems(lang: "en" | "es"): MenuItem[] {
  return [
    { label: t("menu.start_daemon", lang),    value: "start-daemon" },
    { label: t("menu.open_web_ui", lang),     value: "open-web-ui" },
    { label: t("menu.list_projects", lang),   value: "list-projects" },
    { label: t("menu.install_mcp", lang),     value: "install-mcp" },
    { label: t("menu.uninstall", lang),       value: "uninstall" },
    { label: t("menu.doctor", lang),          value: "doctor" },
    { label: t("menu.update_check", lang),    value: "update-check" },
    { label: t("menu.language_toggle", lang), value: "language-toggle" },
    { label: t("menu.quit", lang),            value: "quit" },
  ];
}

/** Toggle the language in the given TUI state (pure, no I/O). */
export function toggleLanguage(state: TuiState): TuiState {
  return { ...state, lang: state.lang === "en" ? "es" : "en" };
}

/**
 * Convert a DoctorReport into display rows for the "known projects" list.
 * Returns an empty array when the report is null (daemon not running).
 */
export function registryRowsFromReport(
  report: DoctorReport | null,
  _lang: "en" | "es",
): RegistryRow[] {
  if (!report) return [];
  if (report.registry.knownRepos === 0) return [];
  return [
    { label: `Known repos: ${report.registry.knownRepos}  (last seen: ${report.registry.lastSeenAt ?? "n/a"})` },
  ];
}
