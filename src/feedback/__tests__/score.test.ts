import { describe, it, expect } from "vitest";
import { scoreFeedback } from "../score.js";
import type { FeedbackEntry, SearchContext } from "../types.js";

function makeFeedback(overrides: Partial<FeedbackEntry> = {}): FeedbackEntry {
  return {
    id: 1,
    task_id: "T-1",
    payload: {
      target: "T-1",
      text: "default feedback text",
      severity: "info",
      workflow_at_capture: "feature",
      target_task_type: "local",
      file_paths: [],
    },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeContext(overrides: Partial<SearchContext> = {}): SearchContext {
  return {
    task_id: "T-99",
    workflow_id: "other",
    task_type: "local",
    terms: [],
    file_paths: [],
    ...overrides,
  };
}

describe("scoreFeedback", () => {
  it("returns 0 for completely unrelated feedback", () => {
    const entry = makeFeedback({
      payload: {
        target: "T-1",
        text: "some unrelated text",
        severity: "info",
        workflow_at_capture: "feature",
        target_task_type: "referenced",
        file_paths: [],
      },
    });
    const context = makeContext({ workflow_id: "bugfix", task_type: "local", terms: [], file_paths: [] });
    const result = scoreFeedback(entry, context);
    // no workflow match, no file overlap, no task_type match (referenced vs local), no keywords, info has no boost
    // only recency (created now = max ~2)
    expect(result).toBeGreaterThanOrEqual(0);
    // workflow mismatch: +0, file overlap: +0, task_type mismatch (referenced vs local): +0, keyword: +0, info severity: +0
    // only recency decay contributes (recent)
    expect(result).toBeLessThan(3); // no structural matches
  });

  it("adds 3 for workflow_id match", () => {
    const entryWithMatch = makeFeedback({
      payload: {
        target: "T-1",
        text: "text",
        severity: "info",
        workflow_at_capture: "feature",
        target_task_type: "local",
        file_paths: [],
      },
    });
    const entryWithoutMatch = makeFeedback({
      payload: {
        target: "T-1",
        text: "text",
        severity: "info",
        workflow_at_capture: "bugfix",
        target_task_type: "local",
        file_paths: [],
      },
    });
    const context = makeContext({ workflow_id: "feature", task_type: "local", terms: [], file_paths: [] });
    const diff = scoreFeedback(entryWithMatch, context) - scoreFeedback(entryWithoutMatch, context);
    expect(diff).toBe(3);
  });

  it("adds 3 for full file_paths overlap", () => {
    const entryWithFiles = makeFeedback({
      payload: {
        target: "T-1",
        text: "text",
        severity: "info",
        workflow_at_capture: "other",
        target_task_type: "local",
        file_paths: ["src/a.ts", "src/b.ts"],
      },
    });
    const entryNoFiles = makeFeedback({
      payload: {
        target: "T-1",
        text: "text",
        severity: "info",
        workflow_at_capture: "other",
        target_task_type: "local",
        file_paths: [],
      },
    });
    const context = makeContext({ workflow_id: "other", task_type: "local", file_paths: ["src/a.ts", "src/b.ts"] });
    const diff = scoreFeedback(entryWithFiles, context) - scoreFeedback(entryNoFiles, context);
    expect(diff).toBeCloseTo(3, 5);
  });

  it("scales file_paths overlap proportionally (partial overlap)", () => {
    // Old date neutralises recency; mismatched workflow/task_type neutralise those dimensions.
    const ancient = new Date(Date.now() - 140 * 24 * 60 * 60 * 1000).toISOString();
    const entry = makeFeedback({
      created_at: ancient,
      payload: {
        target: "T-1",
        text: "text",
        severity: "info",
        workflow_at_capture: "feedback-wf",
        target_task_type: "feedback-type",
        file_paths: ["src/a.ts", "src/b.ts"],
      },
    });
    const baseCtx = { workflow_id: "context-wf", task_type: "context-type" };
    // full: context matches both feedback files exactly → Jaccard 2/2 = 1.0 → score = 3.0
    const contextFull = makeContext({ ...baseCtx, file_paths: ["src/a.ts", "src/b.ts"] });
    // partial: context=["a"], feedback=["a","b"] → intersection=1, union=2 → Jaccard=0.5 → score=1.5
    const contextPartial = makeContext({ ...baseCtx, file_paths: ["src/a.ts"] });
    expect(scoreFeedback(entry, contextFull)).toBeCloseTo(3.0, 2);
    expect(scoreFeedback(entry, contextPartial)).toBeCloseTo(1.5, 2);
  });

  it("adds 2 for task_type match", () => {
    const entryMatch = makeFeedback({
      payload: {
        target: "T-1",
        text: "text",
        severity: "info",
        workflow_at_capture: "other",
        target_task_type: "referenced",
        file_paths: [],
      },
    });
    const entryNoMatch = makeFeedback({
      payload: {
        target: "T-1",
        text: "text",
        severity: "info",
        workflow_at_capture: "other",
        target_task_type: "local",
        file_paths: [],
      },
    });
    const context = makeContext({ task_type: "referenced" });
    const diff = scoreFeedback(entryMatch, context) - scoreFeedback(entryNoMatch, context);
    expect(diff).toBe(2);
  });

  it("adds 1 for keyword overlap in text", () => {
    // Pin created_at so both feedbacks have identical recency — isolates keyword as the only diff.
    const now = new Date().toISOString();
    const basePayload = {
      target: "T-1",
      severity: "info" as const,
      workflow_at_capture: "other",
      target_task_type: "local",
      file_paths: [],
    };
    const entryWithKeyword = makeFeedback({
      created_at: now,
      payload: { ...basePayload, text: "the cache was stale and broke everything" },
    });
    const entryNoKeyword = makeFeedback({
      created_at: now,
      payload: { ...basePayload, text: "unrelated observation here" },
    });
    const context = makeContext({ terms: ["cache", "stale"] });
    const withKeyword = scoreFeedback(entryWithKeyword, context);
    const noKeyword = scoreFeedback(entryNoKeyword, context);
    expect(withKeyword - noKeyword).toBe(1);
  });

  it("adds severity_boost: failed_in_practice +2, correction +1, info +0", () => {
    const basePayload = {
      target: "T-1",
      text: "text",
      workflow_at_capture: "other",
      target_task_type: "local",
      file_paths: [],
    };
    const context = makeContext();
    const entryFailed = makeFeedback({ payload: { ...basePayload, severity: "failed_in_practice" } });
    const entryCorrection = makeFeedback({ payload: { ...basePayload, severity: "correction" } });
    const entryInfo = makeFeedback({ payload: { ...basePayload, severity: "info" } });

    const scoreFailed = scoreFeedback(entryFailed, context);
    const scoreCorrection = scoreFeedback(entryCorrection, context);
    const scoreInfo = scoreFeedback(entryInfo, context);

    expect(scoreFailed - scoreInfo).toBe(2);
    expect(scoreCorrection - scoreInfo).toBe(1);
  });

  it("recency_decay is near-max (≈2) for very recent feedback", () => {
    const entry = makeFeedback({ created_at: new Date().toISOString() });
    // Override context so no other dimension scores — isolates recency.
    const context = makeContext({ workflow_id: "no-match", task_type: "no-match" });
    const score = scoreFeedback(entry, context);
    expect(score).toBeGreaterThan(1.9);
    expect(score).toBeLessThanOrEqual(2.0);
  });

  it("recency_decay approaches 0 for very old feedback (> 10 half-lives)", () => {
    const oldDate = new Date(Date.now() - 140 * 24 * 60 * 60 * 1000).toISOString();
    const entry = makeFeedback({ created_at: oldDate });
    const context = makeContext({ workflow_id: "no-match", task_type: "no-match" });
    const score = scoreFeedback(entry, context);
    expect(score).toBeLessThan(0.01);
  });
});
