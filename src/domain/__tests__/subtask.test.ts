import { describe, it, expect } from "vitest";
import {
  SUBTASK_STATUSES,
  type SubtaskStatus,
  validTransitions,
  advanceState,
  isTerminal,
} from "../subtask.js";

describe("SubtaskStatus", () => {
  it("recognises exactly six allowed states", () => {
    expect(SUBTASK_STATUSES).toHaveLength(6);
    expect(SUBTASK_STATUSES).toContain("pending");
    expect(SUBTASK_STATUSES).toContain("in-progress");
    expect(SUBTASK_STATUSES).toContain("done");
    expect(SUBTASK_STATUSES).toContain("blocked");
    expect(SUBTASK_STATUSES).toContain("failed");
    expect(SUBTASK_STATUSES).toContain("skipped");
  });
});

describe("validTransitions", () => {
  it("allows pending → in-progress", () => {
    expect(validTransitions["pending"]).toContain("in-progress");
  });

  it("allows in-progress → done", () => {
    expect(validTransitions["in-progress"]).toContain("done");
  });

  it("allows in-progress → blocked", () => {
    expect(validTransitions["in-progress"]).toContain("blocked");
  });

  it("allows in-progress → failed", () => {
    expect(validTransitions["in-progress"]).toContain("failed");
  });

  it("allows in-progress → skipped", () => {
    expect(validTransitions["in-progress"]).toContain("skipped");
  });

  it("allows failed → in-progress (agent retry)", () => {
    expect(validTransitions["failed"]).toContain("in-progress");
  });

  it("allows blocked → in-progress (human unblocks)", () => {
    expect(validTransitions["blocked"]).toContain("in-progress");
  });

  it("does not allow pending → done directly", () => {
    expect(validTransitions["pending"]).not.toContain("done");
  });

  it("terminal state done has no outgoing transitions", () => {
    expect(validTransitions["done"]).toHaveLength(0);
  });

  it("terminal state skipped has no outgoing transitions", () => {
    expect(validTransitions["skipped"]).toHaveLength(0);
  });
});

describe("advanceState", () => {
  it("advances pending to in-progress on click-dot", () => {
    expect(advanceState("pending")).toBe("in-progress");
  });

  it("advances in-progress to done on click-dot", () => {
    expect(advanceState("in-progress")).toBe("done");
  });

  it("returns the same state for done (terminal — no advance)", () => {
    expect(advanceState("done")).toBe("done");
  });

  it("returns the same state for skipped (terminal — no advance)", () => {
    expect(advanceState("skipped")).toBe("skipped");
  });

  it("advances failed to in-progress (click-dot retry)", () => {
    expect(advanceState("failed")).toBe("in-progress");
  });

  it("advances blocked to in-progress (click-dot unblock)", () => {
    expect(advanceState("blocked")).toBe("in-progress");
  });
});

describe("isTerminal", () => {
  it("identifies done as terminal", () => {
    expect(isTerminal("done")).toBe(true);
  });

  it("identifies skipped as terminal", () => {
    expect(isTerminal("skipped")).toBe(true);
  });

  it("identifies failed as non-terminal (agent can retry)", () => {
    expect(isTerminal("failed")).toBe(false);
  });

  it("identifies blocked as non-terminal (human can unblock)", () => {
    expect(isTerminal("blocked")).toBe(false);
  });

  it("identifies pending as non-terminal", () => {
    expect(isTerminal("pending")).toBe(false);
  });

  it("identifies in-progress as non-terminal", () => {
    expect(isTerminal("in-progress")).toBe(false);
  });
});
