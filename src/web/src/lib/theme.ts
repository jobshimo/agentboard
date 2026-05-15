// Manages dark/light theme: toggle, persist, and apply to document body class.

export type Theme = "dark" | "light";

const STORAGE_KEY = "agentboard-theme";

export function getPersistedTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // localStorage may be unavailable in tests or restricted contexts
  }
  return "dark";
}

export function persistTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore write failures; theme still applies in memory
  }
}

export function toggleTheme(current: Theme): Theme {
  return current === "dark" ? "light" : "dark";
}

// Applies the theme class to document.body — called from App.
export function applyThemeClass(theme: Theme): void {
  document.body.classList.remove("theme-dark", "theme-light");
  document.body.classList.add(`theme-${theme}`);
}
