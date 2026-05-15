import { describe, it, expect } from "vitest";
import { parseWsPush } from "../src/lib/ws";

describe("parseWsPush", () => {
  it("parses a valid push message", () => {
    const raw = JSON.stringify({
      event: "status_change",
      task_id: "T-12",
      entity_ids: ["s-2"],
    });
    const result = parseWsPush(raw);
    expect(result).toEqual({
      event: "status_change",
      task_id: "T-12",
      entity_ids: ["s-2"],
    });
  });

  it("parses a message with null task_id", () => {
    const raw = JSON.stringify({ event: "agent_notification", task_id: null, entity_ids: [] });
    const result = parseWsPush(raw);
    expect(result?.task_id).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseWsPush("not-json")).toBeNull();
  });

  it("returns null when event field is missing", () => {
    const raw = JSON.stringify({ task_id: "T-1", entity_ids: [] });
    expect(parseWsPush(raw)).toBeNull();
  });

  it("returns null when event field is not a string", () => {
    const raw = JSON.stringify({ event: 42, task_id: "T-1", entity_ids: [] });
    expect(parseWsPush(raw)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseWsPush("")).toBeNull();
  });

  it("filters non-string values out of entity_ids", () => {
    const raw = JSON.stringify({ event: "status_change", task_id: "T-1", entity_ids: ["s-1", 42, null, "s-2"] });
    const result = parseWsPush(raw);
    expect(result?.entity_ids).toEqual(["s-1", "s-2"]);
  });

  it("handles missing entity_ids gracefully", () => {
    const raw = JSON.stringify({ event: "status_change", task_id: "T-1" });
    const result = parseWsPush(raw);
    expect(result?.entity_ids).toEqual([]);
  });

  it("returns null for a JSON array (not an object)", () => {
    expect(parseWsPush("[1,2,3]")).toBeNull();
  });

  it("parses all 10 event types as valid", () => {
    const types = [
      "comment_added", "status_change", "subtask_added", "subtask_updated",
      "custom_subtask_added", "feedback_added", "task_completed",
      "task_blocked", "agent_notification", "pr_comment",
    ];
    for (const event of types) {
      const raw = JSON.stringify({ event, task_id: "T-1", entity_ids: [] });
      expect(parseWsPush(raw)?.event).toBe(event);
    }
  });
});
