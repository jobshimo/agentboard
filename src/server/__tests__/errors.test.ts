import { describe, it, expect } from "vitest";
import {
  NotFoundError,
  ValidationError,
  StateError,
  toHttpError,
} from "../errors.js";

describe("domain error classes", () => {
  it("NotFoundError has correct code and status", () => {
    const err = new NotFoundError("task", "T-1");
    expect(err.code).toBe("not_found/task");
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain("T-1");
  });

  it("ValidationError has correct code and status", () => {
    const err = new ValidationError("body.title is required");
    expect(err.code).toBe("validation/request");
    expect(err.statusCode).toBe(400);
  });

  it("StateError has correct code and status", () => {
    const err = new StateError("invalid transition");
    expect(err.code).toBe("state/invalid_transition");
    expect(err.statusCode).toBe(409);
  });
});

describe("toHttpError", () => {
  it("maps a NotFoundError to {statusCode, error: {code, message}}", () => {
    const err = new NotFoundError("task", "T-1");
    const result = toHttpError(err);
    expect(result.statusCode).toBe(404);
    expect(result.body.error.code).toBe("not_found/task");
    expect(typeof result.body.error.message).toBe("string");
  });

  it("maps an unknown Error to 500", () => {
    const err = new Error("something internal");
    const result = toHttpError(err);
    expect(result.statusCode).toBe(500);
    expect(result.body.error.code).toBe("internal/error");
  });

  it("maps a non-Error to 500 with generic message", () => {
    const result = toHttpError("weird throw");
    expect(result.statusCode).toBe(500);
    expect(result.body.error.code).toBe("internal/error");
  });
});
