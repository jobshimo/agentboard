import { describe, it, expect } from "vitest";
import { matchRoute, buildHash } from "../src/router/route";

describe("matchRoute", () => {
  it("returns board for empty hash", () => {
    expect(matchRoute("")).toEqual({ view: "board" });
  });

  it("returns board for #/board", () => {
    expect(matchRoute("#/board")).toEqual({ view: "board" });
  });

  it("returns board for unrecognised path", () => {
    expect(matchRoute("#/unknown/path")).toEqual({ view: "board" });
  });

  it("returns settings for #/settings", () => {
    expect(matchRoute("#/settings")).toEqual({ view: "settings" });
  });

  it("returns settings for /settings (no hash prefix)", () => {
    expect(matchRoute("/settings")).toEqual({ view: "settings" });
  });

  it("returns settings for settings (bare)", () => {
    expect(matchRoute("settings")).toEqual({ view: "settings" });
  });

  it("returns detail with taskId for #/tasks/T-12", () => {
    expect(matchRoute("#/tasks/T-12")).toEqual({ view: "detail", taskId: "T-12" });
  });

  it("returns detail with taskId containing special chars", () => {
    expect(matchRoute("#/tasks/JIRA-218")).toEqual({ view: "detail", taskId: "JIRA-218" });
  });

  it("does not match tasks/ with a trailing slash as detail", () => {
    // "tasks/" → path after strip is "tasks/" → detailMatch needs at least one char
    const result = matchRoute("#/tasks/");
    // empty capture group → falls through to board
    expect(result.view).toBe("board");
  });
});

describe("buildHash", () => {
  it("builds board hash", () => {
    expect(buildHash({ view: "board" })).toBe("#/board");
  });

  it("builds settings hash", () => {
    expect(buildHash({ view: "settings" })).toBe("#/settings");
  });

  it("builds detail hash with taskId", () => {
    expect(buildHash({ view: "detail", taskId: "T-12" })).toBe("#/tasks/T-12");
  });

  it("builds board hash when detail has no taskId", () => {
    expect(buildHash({ view: "detail" })).toBe("#/board");
  });
});
