/**
 * TopBar DOM render tests using @testing-library/react.
 * WARN-1: validates the dropdown trigger, repo list, and onSwitchRepo callback.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import { expect as vitestExpect } from "vitest";
import { TopBar } from "../src/chrome/TopBar";

vitestExpect.extend(matchers);

// The TopBar uses ConnectionIndicator and NotificationBadge which read from the store.
// Mock them to avoid pulling in the full store context for unit tests.
vi.mock("../src/chrome/ConnectionIndicator", () => ({
  ConnectionIndicator: () => null,
}));
vi.mock("../src/chrome/NotificationBadge", () => ({
  NotificationBadge: () => null,
}));

afterEach(() => {
  cleanup();
});

function makeProps(overrides: Partial<Parameters<typeof TopBar>[0]> = {}) {
  return {
    view: "board" as const,
    onSetView: vi.fn(),
    theme: "dark" as const,
    onToggleTheme: vi.fn(),
    availableRepos: ["C:/A", "C:/B"],
    activeRepo: "C:/A",
    onSwitchRepo: vi.fn(),
    ...overrides,
  };
}

describe("TopBar dropdown — DOM render", () => {
  it("renders the active repo basename in the dropdown trigger button", () => {
    const { container } = render(<TopBar {...makeProps()} />);
    // The repo selector button contains the basename "A"
    const repoSelector = container.querySelector(".ab-repo-selector");
    expect(repoSelector).not.toBeNull();
    // basename of "C:/A" via path-utils should yield "A"
    const repoSpan = repoSelector?.querySelector(".repo");
    expect(repoSpan?.textContent).toBe("A");
  });

  it("dropdown is closed initially (listbox not in DOM)", () => {
    render(<TopBar {...makeProps()} />);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("clicking the trigger opens the dropdown and shows both repo paths", () => {
    const { container } = render(<TopBar {...makeProps()} />);
    const selectorBtn = container.querySelector(".ab-repo-selector")!;
    fireEvent.click(selectorBtn);

    const listbox = screen.getByRole("listbox");
    expect(listbox).not.toBeNull();
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
  });

  it("clicking a repo option calls onSwitchRepo with the full path", () => {
    const onSwitchRepo = vi.fn();
    const { container } = render(<TopBar {...makeProps({ onSwitchRepo })} />);

    // Open dropdown
    const selectorBtn = container.querySelector(".ab-repo-selector")!;
    fireEvent.click(selectorBtn);

    // Click the second repo option
    const options = screen.getAllByRole("option");
    fireEvent.click(options[1]!);

    expect(onSwitchRepo).toHaveBeenCalledWith("C:/B");
  });
});
