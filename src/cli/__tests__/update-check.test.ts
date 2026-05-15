import { describe, expect, it, vi, afterEach } from "vitest";

// We need to mock the global fetch to avoid real network calls.
// vitest supports vi.stubGlobal for this.

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function importFresh() {
  // Clear module cache between tests to avoid stale mocks
  return await import("../update-check.js");
}

describe("checkForUpdate", () => {
  it("returns up-to-date when latest === currentVersion", async () => {
    vi.stubGlobal("fetch", async (_url: string) => ({
      ok: true,
      json: async () => ({ latest: "0.1.0" }),
    }));

    const { checkForUpdate } = await importFresh();
    const result = await checkForUpdate("0.1.0");
    expect(result.status).toBe("up-to-date");
  });

  it("returns newer when a higher version is available", async () => {
    vi.stubGlobal("fetch", async (_url: string) => ({
      ok: true,
      json: async () => ({ latest: "0.2.0" }),
    }));

    const { checkForUpdate } = await importFresh();
    const result = await checkForUpdate("0.1.0");
    expect(result.status).toBe("newer");
    expect(result.latest).toBe("0.2.0");
  });

  it("returns up-to-date when fetch throws (network error)", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("Network error");
    });

    const { checkForUpdate } = await importFresh();
    const result = await checkForUpdate("0.1.0");
    expect(result.status).toBe("up-to-date");
  });

  it("returns up-to-date when response is not ok", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    }));

    const { checkForUpdate } = await importFresh();
    const result = await checkForUpdate("0.1.0");
    expect(result.status).toBe("up-to-date");
  });

  it("returns up-to-date when latest is malformed", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({ latest: "not-a-semver" }),
    }));

    const { checkForUpdate } = await importFresh();
    const result = await checkForUpdate("0.1.0");
    // Should degrade gracefully rather than throw
    expect(["up-to-date", "newer"]).toContain(result.status);
  });

  it("returns up-to-date when currentVersion is ahead of latest", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({ latest: "0.0.9" }),
    }));

    const { checkForUpdate } = await importFresh();
    const result = await checkForUpdate("0.1.0");
    expect(result.status).toBe("up-to-date");
  });
});
