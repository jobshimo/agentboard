/**
 * TUI banner + menu — render tests using ink-testing-library.
 *
 * RED: write tests first. The banner component is created in tui.tsx.
 */
import React from "react";
import { render } from "ink-testing-library";
import { describe, it, expect } from "vitest";
import { Banner } from "../tui.js";

describe("Banner component", () => {
  it("renders the box-drawing top border", () => {
    const { lastFrame } = render(
      <Banner version="0.1.0" repoLabel="jobshimo/agentboard" />
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("╭");
    expect(frame).toContain("╮");
    expect(frame).toContain("╰");
    expect(frame).toContain("╯");
    expect(frame).toContain("│");
  });

  it("renders the diamond and agentboard name", () => {
    const { lastFrame } = render(
      <Banner version="0.1.0" repoLabel="jobshimo/agentboard" />
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("◆");
    expect(frame).toContain("agentboard");
  });

  it("renders the version", () => {
    const { lastFrame } = render(
      <Banner version="0.1.0" repoLabel="test-repo" />
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("v0.1.0");
  });

  it("renders the repo label", () => {
    const { lastFrame } = render(
      <Banner version="0.1.0" repoLabel="some-org/some-repo" />
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("some-org/some-repo");
  });

  it("renders the store path", () => {
    const { lastFrame } = render(
      <Banner version="0.1.0" repoLabel="test-repo" />
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain(".agentboard/db.sqlite");
  });

  it("renders the horizontal separator", () => {
    const { lastFrame } = render(
      <Banner version="0.1.0" repoLabel="test-repo" />
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("─");
  });

  it("renders daemon stopped status when daemonStatus is stopped", () => {
    const { lastFrame } = render(
      <Banner version="0.1.0" repoLabel="test-repo" daemonStatus="stopped" />
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("daemon");
    expect(frame).toContain("stopped");
  });

  it("renders daemon running status when daemonStatus is running", () => {
    const { lastFrame } = render(
      <Banner version="0.1.0" repoLabel="test-repo" daemonStatus="running" daemonPort={7733} />
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("daemon");
    expect(frame).toContain("7733");
  });
});
