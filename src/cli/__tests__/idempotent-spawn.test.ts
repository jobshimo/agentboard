/**
 * S9 RED tests: probeForExistingDaemon — the public probe face wired into
 * index.ts for the idempotent start/daemon invocation (CRIT-1 fix).
 *
 * REQ-L-01: second invocation must reuse the running daemon.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  probeForExistingDaemon,
  writePidFile,
} from "../spawn-daemon.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempHome(): string {
  return mkdtempSync(join(tmpdir(), "agb-probe-test-"));
}

function cleanupHome(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// probeForExistingDaemon
// ---------------------------------------------------------------------------

describe("probeForExistingDaemon — alreadyRunning", () => {
  let agbHome: string;

  beforeEach(() => { agbHome = makeTempHome(); });
  afterEach(() => { cleanupHome(agbHome); vi.restoreAllMocks(); });

  it("returns alreadyRunning when /api/health returns 200 + ok:true", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, pid: 1234, port: 7733 }),
    });

    const result = await probeForExistingDaemon(7733, agbHome, mockFetch);

    expect(result).toMatchObject({ alreadyRunning: true, pid: 1234, port: 7733 });
  });
});

describe("probeForExistingDaemon — foreignProcess", () => {
  let agbHome: string;

  beforeEach(() => { agbHome = makeTempHome(); });
  afterEach(() => { cleanupHome(agbHome); vi.restoreAllMocks(); });

  it("returns foreignProcess when /api/health returns 200 but body lacks ok:true", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, service: "something-else" }),
    });

    const result = await probeForExistingDaemon(7733, agbHome, mockFetch);

    expect(result).toMatchObject({ foreignProcess: true, port: 7733 });
  });

  it("returns foreignProcess when /api/health returns non-200", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ ok: false }),
    });

    const result = await probeForExistingDaemon(7733, agbHome, mockFetch);

    expect(result).toMatchObject({ foreignProcess: true, port: 7733 });
  });
});

describe("probeForExistingDaemon — free", () => {
  let agbHome: string;

  beforeEach(() => { agbHome = makeTempHome(); });
  afterEach(() => { cleanupHome(agbHome); vi.restoreAllMocks(); });

  it("returns free when fetch rejects (ECONNREFUSED)", async () => {
    const mockFetch = vi.fn().mockRejectedValue(
      Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:7733"), { code: "ECONNREFUSED" }),
    );

    const result = await probeForExistingDaemon(7733, agbHome, mockFetch);

    expect(result).toMatchObject({ free: true });
  });
});

describe("probeForExistingDaemon — stale PID cleanup", () => {
  let agbHome: string;

  beforeEach(() => { agbHome = makeTempHome(); });
  afterEach(() => { cleanupHome(agbHome); vi.restoreAllMocks(); });

  it("unlinks stale PID file when process.kill(pid, 0) throws ESRCH", async () => {
    // Write a PID that does not correspond to a live process
    writePidFile(999999999, agbHome);

    const mockFetch = vi.fn().mockRejectedValue(
      Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
    );

    const result = await probeForExistingDaemon(7733, agbHome, mockFetch);

    // Port is free after stale PID cleanup
    expect(result).toMatchObject({ free: true });
    // The PID file should be gone
    const { readPidFile } = await import("../spawn-daemon.js");
    expect(readPidFile(agbHome)).toBeNull();
  });
});
