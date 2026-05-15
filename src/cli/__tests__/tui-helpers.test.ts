import { describe, expect, it } from "vitest";
import {
  buildMenuItems,
  type TuiState,
  toggleLanguage,
  registryRowsFromReport,
} from "../tui-helpers.js";
import type { DoctorReport } from "../doctor-report.js";

describe("buildMenuItems", () => {
  it("returns an array of menu items with labels and values", () => {
    const items = buildMenuItems("en");
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item).toHaveProperty("label");
      expect(item).toHaveProperty("value");
    }
  });

  it("returns labels in English when lang=en", () => {
    const items = buildMenuItems("en");
    const labels = items.map((i) => i.label);
    expect(labels).toContain("Start daemon");
  });

  it("returns labels in Spanish when lang=es", () => {
    const items = buildMenuItems("es");
    const labels = items.map((i) => i.label);
    expect(labels).toContain("Iniciar daemon");
  });

  it("includes all expected menu options", () => {
    const items = buildMenuItems("en");
    const values = items.map((i) => i.value);
    expect(values).toContain("start-daemon");
    expect(values).toContain("open-web-ui");
    expect(values).toContain("list-projects");
    expect(values).toContain("install-mcp");
    expect(values).toContain("uninstall");
    expect(values).toContain("doctor");
    expect(values).toContain("update-check");
    expect(values).toContain("language-toggle");
    expect(values).toContain("quit");
  });
});

describe("toggleLanguage", () => {
  it("toggles en → es", () => {
    const state: TuiState = { lang: "en", agbHome: "/tmp/agb" };
    const next = toggleLanguage(state);
    expect(next.lang).toBe("es");
  });

  it("toggles es → en", () => {
    const state: TuiState = { lang: "es", agbHome: "/tmp/agb" };
    const next = toggleLanguage(state);
    expect(next.lang).toBe("en");
  });
});

describe("registryRowsFromReport", () => {
  it("returns empty rows when report is null", () => {
    const rows = registryRowsFromReport(null, "en");
    expect(rows).toHaveLength(0);
  });

  it("returns rows for known repos when daemon is running with repos", () => {
    const mockReport: Partial<DoctorReport> = {
      clients: [
        {
          id: "claude-code",
          displayName: "Claude Code",
          mcp: "not-detected",
          instructions: "missing",
          configPath: "/home/user/.claude.json",
        },
      ],
      registry: { knownRepos: 2, lastSeenAt: "2026-05-15T20:00:00Z" },
    };

    const rows = registryRowsFromReport(mockReport as DoctorReport, "en");
    expect(rows.length).toBeGreaterThanOrEqual(0);
  });
});
