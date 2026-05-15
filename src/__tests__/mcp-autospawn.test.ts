/**
 * Tests for auto-spawn of HTTP daemon when STDIO MCP starts and no daemon is running.
 * Commit 8: feat(mcp): auto-spawn HTTP daemon on STDIO startup if down
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { probeAndMaybeSpawnDaemon } from "../mcp/auto-spawn.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("probeAndMaybeSpawnDaemon", () => {
  it("calls probe fetch at startup with the configured port", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const mockSpawn = vi.fn();
    await probeAndMaybeSpawnDaemon({
      port: 7733,
      agbHome: "/fake/agbhome",
      _fetch: mockFetch as unknown as typeof fetch,
      _spawn: mockSpawn,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("7733"),
      expect.any(Object),
    );
  });

  it("does NOT spawn daemon when probe succeeds (daemon already running)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const mockSpawn = vi.fn();
    await probeAndMaybeSpawnDaemon({
      port: 7733,
      agbHome: "/fake/agbhome",
      _fetch: mockFetch as unknown as typeof fetch,
      _spawn: mockSpawn,
    });
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("spawns daemon with noOpen when probe fails (connection refused)", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const mockChildProcess = { unref: vi.fn(), pid: 12345 };
    const mockSpawn = vi.fn().mockReturnValue(mockChildProcess);

    const stderrLines: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((s) => {
      stderrLines.push(String(s));
      return true;
    });

    await probeAndMaybeSpawnDaemon({
      port: 7733,
      agbHome: "/fake/agbhome",
      _fetch: mockFetch as unknown as typeof fetch,
      _spawn: mockSpawn,
    });

    expect(mockSpawn).toHaveBeenCalled();
    // Should unref the child process (non-blocking)
    expect(mockChildProcess.unref).toHaveBeenCalled();
    // Should log to stderr
    expect(stderrLines.some((l) => l.includes("7733"))).toBe(true);
  });

  it("logs to stderr and does NOT spawn when a foreign process holds the port", async () => {
    // Probe returns 200 but ok=false → foreign process
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false }),
    });
    const mockSpawn = vi.fn();

    const stderrLines: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((s) => {
      stderrLines.push(String(s));
      return true;
    });

    await probeAndMaybeSpawnDaemon({
      port: 7733,
      agbHome: "/fake/agbhome",
      _fetch: mockFetch as unknown as typeof fetch,
      _spawn: mockSpawn,
    });

    expect(mockSpawn).not.toHaveBeenCalled();
    // Should log a warning about foreign process
    expect(stderrLines.some((l) => l.includes("7733"))).toBe(true);
  });
});
