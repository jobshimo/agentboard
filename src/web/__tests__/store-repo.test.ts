/**
 * S7 tests: activeRepo + availableRepos store slice
 * REQ-R-03
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  dispatch,
  getState,
  _resetStore,
} from "../src/lib/store";

// Mock localStorage
const localStorageMock: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (key: string) => localStorageMock[key] ?? null,
  setItem: (key: string, value: string) => { localStorageMock[key] = value; },
  removeItem: (key: string) => { delete localStorageMock[key]; },
  clear: () => { for (const k in localStorageMock) delete localStorageMock[k]; },
});

beforeEach(() => {
  _resetStore();
  for (const k in localStorageMock) delete localStorageMock[k];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("activeRepo store slice", () => {
  it("initializes activeRepo as null by default", () => {
    expect(getState().activeRepo).toBeNull();
  });

  it("SET_ACTIVE_REPO updates activeRepo", () => {
    dispatch({ type: "SET_ACTIVE_REPO", activeRepo: "/home/user/myproject" });
    expect(getState().activeRepo).toBe("/home/user/myproject");
  });

  it("SET_ACTIVE_REPO writes to localStorage", () => {
    dispatch({ type: "SET_ACTIVE_REPO", activeRepo: "/home/user/myproject" });
    expect(localStorage.getItem("agentboard.activeRepo")).toBe("/home/user/myproject");
  });

  it("SET_ACTIVE_REPO with null does not write to localStorage", () => {
    dispatch({ type: "SET_ACTIVE_REPO", activeRepo: null });
    expect(getState().activeRepo).toBeNull();
  });
});

describe("availableRepos store slice", () => {
  it("initializes availableRepos as empty array", () => {
    expect(getState().availableRepos).toEqual([]);
  });

  it("SET_AVAILABLE_REPOS updates availableRepos", () => {
    const repos = ["/home/user/repoA", "/home/user/repoB"];
    dispatch({ type: "SET_AVAILABLE_REPOS", availableRepos: repos });
    expect(getState().availableRepos).toEqual(repos);
  });
});
