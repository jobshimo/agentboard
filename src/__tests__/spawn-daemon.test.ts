/**
 * S2 RED tests: ForeignProcessOnPortError + idempotent spawn + stale PID
 * REQ-L-01, REQ-D-01, REQ-D-03
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// These imports will fail until production code exists (RED phase).
import {
  ForeignProcessOnPortError,
  spawnDaemon,
  readPidFile,
  writePidFile,
  unlinkPidFile,
} from "../cli/spawn-daemon.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempHome(): string {
  return mkdtempSync(join(tmpdir(), "agb-home-test-"));
}

function cleanupHome(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// ForeignProcessOnPortError
// ---------------------------------------------------------------------------

describe("ForeignProcessOnPortError", () => {
  it("is an Error subclass with port property", () => {
    const err = new ForeignProcessOnPortError(7733);
    expect(err).toBeInstanceOf(Error);
    expect(err.port).toBe(7733);
    expect(err.message).toContain("7733");
  });
});

// ---------------------------------------------------------------------------
// PID file helpers
// ---------------------------------------------------------------------------

describe("PID file helpers", () => {
  let agbHome: string;

  beforeEach(() => { agbHome = makeTempHome(); });
  afterEach(() => { cleanupHome(agbHome); });

  it("writePidFile + readPidFile round-trips", () => {
    writePidFile(12345, agbHome);
    expect(readPidFile(agbHome)).toBe(12345);
  });

  it("readPidFile returns null when file missing", () => {
    expect(readPidFile(agbHome)).toBeNull();
  });

  it("unlinkPidFile removes the file", () => {
    writePidFile(12345, agbHome);
    unlinkPidFile(agbHome);
    expect(readPidFile(agbHome)).toBeNull();
  });

  it("unlinkPidFile is idempotent (no throw when file missing)", () => {
    expect(() => unlinkPidFile(agbHome)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// spawnDaemon — stale PID detection
// ---------------------------------------------------------------------------

describe("spawnDaemon — stale PID detection", () => {
  let agbHome: string;

  beforeEach(() => { agbHome = makeTempHome(); });
  afterEach(() => { cleanupHome(agbHome); });

  it("removes stale PID and writes new PID after spawn", async () => {
    // Write a PID that doesn't exist (stale)
    writePidFile(999999999, agbHome);

    // Mock fetch: first call (initial probe) fails → spawn path,
    // subsequent calls (poll loop) also fail → timeout
    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const mockSpawn = vi.fn().mockReturnValue({ unref: () => {}, pid: 42 });

    // spawnDaemon will throw because port polling times out (mock fetch always rejects)
    await expect(
      spawnDaemon({ port: 7733, noOpen: true, agbHome, _fetch: mockFetch, _spawn: mockSpawn, _pollTimeoutMs: 50 })
    ).rejects.toThrow();

    // The stale PID (999999999) was cleared; a new PID (42 from mock spawn) was written
    const newPid = readPidFile(agbHome);
    expect(newPid).toBe(42);
    expect(mockSpawn).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// spawnDaemon — foreign process on port
// ---------------------------------------------------------------------------

describe("spawnDaemon — foreign process on port", () => {
  let agbHome: string;

  beforeEach(() => { agbHome = makeTempHome(); });
  afterEach(() => { cleanupHome(agbHome); });

  it("throws ForeignProcessOnPortError when health returns non-200", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ ok: false }),
    });

    await expect(
      spawnDaemon({ port: 7733, noOpen: true, agbHome, _fetch: mockFetch })
    ).rejects.toBeInstanceOf(ForeignProcessOnPortError);
  });
});

// ---------------------------------------------------------------------------
// spawnDaemon — already running
// ---------------------------------------------------------------------------

describe("spawnDaemon — already running", () => {
  let agbHome: string;

  beforeEach(() => { agbHome = makeTempHome(); });
  afterEach(() => { cleanupHome(agbHome); });

  it("returns without spawning when health returns 200+ok=true", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, pid: 1234, port: 7733 }),
    });
    const mockSpawn = vi.fn();

    await spawnDaemon({ port: 7733, noOpen: true, agbHome, _fetch: mockFetch, _spawn: mockSpawn });

    expect(mockSpawn).not.toHaveBeenCalled();
  });
});
