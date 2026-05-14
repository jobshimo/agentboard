import { describe, it, expect } from "vitest";
import { renderTaskMarkdown } from "../markdown.js";
import type { TaskFullView } from "../markdown.js";

function makeTask(overrides: Partial<TaskFullView> = {}): TaskFullView {
  return {
    id: "T-1",
    title: "Fix the build",
    type: "local",
    derivedStatus: "active",
    workflowId: "coding-task",
    createdAt: "2026-01-01T00:00:00.000Z",
    subtasks: [],
    discussion: [],
    ...overrides,
  };
}

describe("renderTaskMarkdown", () => {
  it("includes the task title as an H1", () => {
    const md = renderTaskMarkdown(makeTask({ title: "Do the thing" }));
    expect(md).toContain("# Do the thing");
  });

  it("includes id, status, type, and workflow in the header", () => {
    const md = renderTaskMarkdown(makeTask());
    expect(md).toContain("**ID**: T-1");
    expect(md).toContain("**Status**: active");
    expect(md).toContain("**Type**: local");
    expect(md).toContain("**Workflow**: coding-task");
  });

  it("includes closed date when present", () => {
    const md = renderTaskMarkdown(
      makeTask({ closedAt: "2026-02-01T00:00:00.000Z" }),
    );
    expect(md).toContain("**Closed**: 2026-02-01T00:00:00.000Z");
  });

  it("includes a reference link when refSource and refId are set", () => {
    const md = renderTaskMarkdown(
      makeTask({
        refSource: "github",
        refId: "acme/repo#42",
        refUrl: "https://github.com/acme/repo/issues/42",
      }),
    );
    expect(md).toContain("github");
    expect(md).toContain("[acme/repo#42](https://github.com/acme/repo/issues/42)");
  });

  it("renders subtask list with status glyphs", () => {
    const md = renderTaskMarkdown(
      makeTask({
        subtasks: [
          { id: "s-1", label: "Implement", status: "done", note: null, custom: false },
          { id: "s-2", label: "Tests", status: "in-progress", note: null, custom: false },
          { id: "s-3", label: "Review", status: "pending", note: null, custom: false },
        ],
      }),
    );
    expect(md).toContain("## Subtasks");
    expect(md).toContain("● **Implement**");
    expect(md).toContain("◑ **Tests**");
    expect(md).toContain("○ **Review**");
  });

  it("renders subtask note as a blockquote", () => {
    const md = renderTaskMarkdown(
      makeTask({
        subtasks: [
          { id: "s-1", label: "Implement", status: "done", note: "sha:abc", custom: false },
        ],
      }),
    );
    expect(md).toContain("> sha:abc");
  });

  it("marks custom subtasks with an italic qualifier", () => {
    const md = renderTaskMarkdown(
      makeTask({
        subtasks: [
          { id: "s-1", label: "Extra step", status: "pending", note: null, custom: true },
        ],
      }),
    );
    expect(md).toContain("*(custom)*");
  });

  it("renders discussion entries with author and body", () => {
    const md = renderTaskMarkdown(
      makeTask({
        discussion: [
          {
            id: 1,
            taskId: "T-1",
            author: "human",
            body: "Looks good to me.",
            tag: null,
            createdAt: "2026-01-02T00:00:00.000Z",
          },
          {
            id: 2,
            taskId: "T-1",
            author: "agent",
            body: "I'll handle it.",
            tag: null,
            createdAt: "2026-01-03T00:00:00.000Z",
          },
        ],
      }),
    );
    expect(md).toContain("## Discussion");
    expect(md).toContain("**human**");
    expect(md).toContain("Looks good to me.");
    expect(md).toContain("**agent**");
    expect(md).toContain("I'll handle it.");
  });

  it("omits Subtasks section when there are no subtasks", () => {
    const md = renderTaskMarkdown(makeTask({ subtasks: [] }));
    expect(md).not.toContain("## Subtasks");
  });

  it("omits Discussion section when there are no entries", () => {
    const md = renderTaskMarkdown(makeTask({ discussion: [] }));
    expect(md).not.toContain("## Discussion");
  });

  it("ends with a single newline", () => {
    const md = renderTaskMarkdown(makeTask());
    expect(md.endsWith("\n")).toBe(true);
    expect(md.endsWith("\n\n")).toBe(false);
  });

  it("produces stable output for a known fixture", () => {
    const task = makeTask({
      id: "T-7",
      title: "Stable fixture",
      type: "referenced",
      derivedStatus: "done",
      workflowId: "wf-alpha",
      createdAt: "2026-03-01T10:00:00.000Z",
      refSource: "jira",
      refId: "PROJ-99",
      refUrl: "https://jira.example.com/browse/PROJ-99",
      subtasks: [
        { id: "s-1", label: "Implement", status: "done", note: "sha:abc123", custom: false },
        { id: "s-2", label: "Extra", status: "skipped", note: null, custom: true },
      ],
      discussion: [
        {
          id: 1,
          taskId: "T-7",
          author: "human",
          body: "Ship it.",
          tag: null,
          createdAt: "2026-03-02T09:00:00.000Z",
        },
      ],
    });

    const expected = [
      "# Stable fixture",
      "",
      "**ID**: T-7",
      "**Status**: done",
      "**Type**: referenced",
      "**Workflow**: wf-alpha",
      "**Created**: 2026-03-01T10:00:00.000Z",
      "**Reference**: jira [PROJ-99](https://jira.example.com/browse/PROJ-99)",
      "",
      "## Subtasks",
      "",
      "- ● **Implement** `done`",
      "  > sha:abc123",
      "- — **Extra** *(custom)* `skipped`",
      "",
      "## Discussion",
      "",
      "**human** — 2026-03-02T09:00:00.000Z",
      "",
      "Ship it.",
      "",
    ].join("\n");

    expect(renderTaskMarkdown(task)).toBe(expected);
  });
});
