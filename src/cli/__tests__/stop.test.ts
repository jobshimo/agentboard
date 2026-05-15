import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runStop } from "../stop.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "agb-stop-test-"));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writePidFile(agbHome: string, pid: number): void {
  writeFileSync(join(agbHome, "daemon.pid"), String(pid));
}

// ---------------------------------------------------------------------------
// Test: no daemon (no PID file)
// ---------------------------------------------------------------------------

describe("runStop — no daemon running (no PID file)", () => {
  let agbHome: string;
  const lines: string[] = [];

  beforeEach(() => {
    agbHome = makeTempHome();
    lines.length = 0;
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      lines.push(String(s));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(agbHome, { recursive: true, force: true });
  });

  it("prints 'daemon not running' when no PID file exists", async () => {
    await runStop({ agbHome });
    expect(lines.some((l) => l.includes("daemon not running"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test: stale PID file (PID is dead)
// ---------------------------------------------------------------------------

describe("runStop — stale PID file", () => {
  let agbHome: string;
  const lines: string[] = [];

  beforeEach(() => {
    agbHome = makeTempHome();
    lines.length = 0;
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      lines.push(String(s));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(agbHome, { recursive: true, force: true });
  });

  it("removes PID file and prints 'daemon not running' when PID is dead", async () => {
    // Use PID 99999999 — almost certainly dead
    writePidFile(agbHome, 99999999);
    await runStop({ agbHome });
    expect(lines.some((l) => l.includes("daemon not running"))).toBe(true);
    // PID file should be unlinked
    const { existsSync } = await import("node:fs");
    expect(existsSync(join(agbHome, "daemon.pid"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test: daemon running — SIGTERM sent, poll until gone
// ---------------------------------------------------------------------------

describe("runStop — daemon running", () => {
  let agbHome: string;
  const lines: string[] = [];

  beforeEach(() => {
    agbHome = makeTempHome();
    lines.length = 0;
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      lines.push(String(s));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(agbHome, { recursive: true, force: true });
  });

  it("sends SIGTERM and prints 'stopped' when daemon shuts down", async () => {
    // Use current process PID (it exists) to simulate a "live" daemon
    const livePid = process.pid;
    writePidFile(agbHome, livePid);

    // Mock kill: first call (signal 0) returns normally (alive), second call (SIGTERM) returns normally
    const killSpy = vi.spyOn(process, "kill").mockImplementation((_pid, _sig) => true);

    // Mock fetch: first call returns health (port 7733), subsequent calls throw (daemon gone)
    let fetchCallCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        // Health probe returns port
        return { ok: true, json: async () => ({ port: 7733 }) };
      }
      // Poll: daemon is gone
      throw new Error("connection refused");
    });

    await runStop({ agbHome, _fetch: mockFetch as unknown as typeof fetch });

    // SIGTERM should have been sent
    expect(killSpy).toHaveBeenCalledWith(livePid, "SIGTERM");
    expect(lines.some((l) => l.includes("stopped"))).toBe(true);
  });
});
