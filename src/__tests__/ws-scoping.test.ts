/**
 * S6 tests: WebSocket repo scoping — per-repo subscriber sets
 * REQ-R-02, REQ-R-01 (WS side)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BroadcastManager, type Sendable } from "../server/broadcaster.js";
import type { InsertedEvent } from "../events/insert.js";
import { normalizeRepoPath, getDbForRepo, closeAllDbs } from "../db/connection.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "agb-ws-scope-"));
  getDbForRepo(dir);
  closeAllDbs();
  return dir;
}

function cleanupDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function makeEvent(repoRoot: string, overrides: Partial<InsertedEvent> = {}): InsertedEvent {
  return {
    id: 1,
    taskId: "T-1",
    type: "comment_added",
    payload: { body: "hello" },
    origin: "human",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// BroadcastManager repo-scoped tests (S6)
// ---------------------------------------------------------------------------

describe("BroadcastManager — repo-scoped broadcasting", () => {
  let repoA: string;
  let repoB: string;

  beforeEach(() => {
    repoA = makeTempRepo();
    repoB = makeTempRepo();
  });

  afterEach(() => {
    cleanupDir(repoA);
    cleanupDir(repoB);
  });

  it("event for repo A does NOT reach client subscribed to repo B", () => {
    const manager = new BroadcastManager();
    const wsB = { send: vi.fn(), readyState: 1 };

    manager.attachClient(wsB as Sendable, normalizeRepoPath(repoB));

    const event = makeEvent(repoA);
    manager.listener(event, normalizeRepoPath(repoA));

    expect(wsB.send).not.toHaveBeenCalled();
  });

  it("event for repo A DOES reach client subscribed to repo A", () => {
    const manager = new BroadcastManager();
    const wsA = { send: vi.fn(), readyState: 1 };

    manager.attachClient(wsA as Sendable, normalizeRepoPath(repoA));

    const event = makeEvent(repoA);
    manager.listener(event, normalizeRepoPath(repoA));

    expect(wsA.send).toHaveBeenCalledOnce();
  });

  it("clientCount(repoRoot) returns scoped count", () => {
    const manager = new BroadcastManager();
    const wsA1 = { send: vi.fn(), readyState: 1 };
    const wsA2 = { send: vi.fn(), readyState: 1 };
    const wsB = { send: vi.fn(), readyState: 1 };

    manager.attachClient(wsA1 as Sendable, normalizeRepoPath(repoA));
    manager.attachClient(wsA2 as Sendable, normalizeRepoPath(repoA));
    manager.attachClient(wsB as Sendable, normalizeRepoPath(repoB));

    expect(manager.clientCount(normalizeRepoPath(repoA))).toBe(2);
    expect(manager.clientCount(normalizeRepoPath(repoB))).toBe(1);
    expect(manager.clientCount()).toBe(3); // global count
  });

  it("detachClient removes client from repo-scoped set", () => {
    const manager = new BroadcastManager();
    const wsA = { send: vi.fn(), readyState: 1 };
    const repoNorm = normalizeRepoPath(repoA);

    manager.attachClient(wsA as Sendable, repoNorm);
    expect(manager.clientCount(repoNorm)).toBe(1);

    manager.detachClient(wsA as Sendable, repoNorm);
    expect(manager.clientCount(repoNorm)).toBe(0);
  });
});
