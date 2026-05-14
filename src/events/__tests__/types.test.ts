import { describe, it, expect } from "vitest";
import {
  EVENT_TYPES,
  type EventType,
  type EventOrigin,
  isValidEventType,
  EVENT_ORIGINS,
} from "../types.js";

describe("EVENT_TYPES", () => {
  it("contains exactly 10 event types", () => {
    expect(EVENT_TYPES).toHaveLength(10);
  });

  it("contains all types specified in event-queue.md", () => {
    const expected: EventType[] = [
      "comment_added",
      "status_change",
      "subtask_added",
      "subtask_updated",
      "custom_subtask_added",
      "feedback_added",
      "task_completed",
      "task_blocked",
      "agent_notification",
      "pr_comment",
    ];
    for (const t of expected) {
      expect(EVENT_TYPES).toContain(t);
    }
  });
});

describe("isValidEventType", () => {
  it("accepts all 10 valid types", () => {
    for (const t of EVENT_TYPES) {
      expect(isValidEventType(t)).toBe(true);
    }
  });

  it("rejects an unknown type", () => {
    expect(isValidEventType("card_archived")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidEventType("")).toBe(false);
  });
});

describe("EVENT_ORIGINS", () => {
  it("covers human, agent, and system", () => {
    const expected: EventOrigin[] = ["human", "agent", "system"];
    for (const o of expected) {
      expect(EVENT_ORIGINS).toContain(o);
    }
  });

  it("contains exactly three origins", () => {
    expect(EVENT_ORIGINS).toHaveLength(3);
  });
});
