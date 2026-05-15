import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ActivationState, buildMcpServer } from "../activation.js";
import { runMigrations } from "../../db/migrate.js";

type Db = InstanceType<typeof Database>;

function makeDb(): Db {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

function enabledNames(activeTools: ReadonlyMap<string, RegisteredTool>): string[] {
  return [...activeTools.entries()]
    .filter(([, t]) => t.enabled)
    .map(([name]) => name);
}

describe("ActivationState — lazy mode (default)", () => {
  let db: Db;
  let state: ActivationState;
  let activeTools: ReadonlyMap<string, RegisteredTool>;

  beforeEach(() => {
    db = makeDb();
    state = new ActivationState("lazy");
    ({ activeTools } = buildMcpServer(state, db));
  });

  afterEach(() => {
    db.close();
  });

  it("starts dormant — no active tools enabled", () => {
    expect(enabledNames(activeTools)).toHaveLength(0);
  });

  it("activate() inserts an agent_sessions row with active=1", () => {
    const { session_id } = state.activate(db);
    const row = db
      .prepare("SELECT active FROM agent_sessions WHERE id = ?")
      .get(session_id) as { active: number } | undefined;
    expect(row?.active).toBe(1);
  });

  it("activate() returns a non-empty session_id string", () => {
    const { session_id } = state.activate(db);
    expect(typeof session_id).toBe("string");
    expect(session_id.length).toBeGreaterThan(0);
  });

  it("activate() returns the list of 14 active tool names", () => {
    const { tools } = state.activate(db);
    expect(tools).toHaveLength(14);
    expect(tools).toContain("task.list");
    expect(tools).toContain("agentboard.deactivate");
  });

  it("activate() enables all 14 active tools on the McpServer", () => {
    state.activate(db);
    const enabled = enabledNames(activeTools);
    expect(enabled).toHaveLength(14);
    expect(enabled).toContain("task.list");
    expect(enabled).toContain("agentboard.deactivate");
  });

  it("deactivate() disables all active tools — none remain enabled", () => {
    const { session_id } = state.activate(db);
    expect(enabledNames(activeTools)).toHaveLength(14);

    state.deactivate(session_id, db);
    expect(enabledNames(activeTools)).toHaveLength(0);
  });

  it("deactivate() marks the session row active=0 in DB", () => {
    const { session_id } = state.activate(db);
    state.deactivate(session_id, db);
    const row = db
      .prepare("SELECT active FROM agent_sessions WHERE id = ?")
      .get(session_id) as { active: number } | undefined;
    expect(row?.active).toBe(0);
  });
});

describe("ActivationState — always-on mode", () => {
  it("enables all active tools immediately on buildMcpServer (no activate() needed)", () => {
    const db = makeDb();
    try {
      const state = new ActivationState("always-on");
      const { activeTools } = buildMcpServer(state, db);

      const enabled = enabledNames(activeTools);
      expect(enabled).toHaveLength(14);
      expect(enabled).toContain("task.list");
      expect(enabled).toContain("agentboard.deactivate");
    } finally {
      db.close();
    }
  });
});
