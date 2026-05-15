import { describe, it, expect, beforeEach, vi } from "vitest";
import { toggleTheme, getPersistedTheme, persistTheme } from "../src/lib/theme";

// jsdom provides localStorage so no mock needed for read/write.
// We clear it between tests to avoid state leakage.

beforeEach(() => {
  localStorage.clear();
});

describe("toggleTheme", () => {
  it("toggles dark → light", () => {
    expect(toggleTheme("dark")).toBe("light");
  });

  it("toggles light → dark", () => {
    expect(toggleTheme("light")).toBe("dark");
  });

  it("is its own inverse", () => {
    expect(toggleTheme(toggleTheme("dark"))).toBe("dark");
  });
});

describe("getPersistedTheme", () => {
  it("returns dark as default when nothing stored", () => {
    expect(getPersistedTheme()).toBe("dark");
  });

  it("returns stored dark value", () => {
    localStorage.setItem("agentboard-theme", "dark");
    expect(getPersistedTheme()).toBe("dark");
  });

  it("returns stored light value", () => {
    localStorage.setItem("agentboard-theme", "light");
    expect(getPersistedTheme()).toBe("light");
  });

  it("returns dark for an unknown stored value", () => {
    localStorage.setItem("agentboard-theme", "blue");
    expect(getPersistedTheme()).toBe("dark");
  });
});

describe("persistTheme", () => {
  it("persists dark to localStorage", () => {
    persistTheme("dark");
    expect(localStorage.getItem("agentboard-theme")).toBe("dark");
  });

  it("persists light to localStorage", () => {
    persistTheme("light");
    expect(localStorage.getItem("agentboard-theme")).toBe("light");
  });

  it("overrides previous value", () => {
    persistTheme("dark");
    persistTheme("light");
    expect(localStorage.getItem("agentboard-theme")).toBe("light");
  });
});
