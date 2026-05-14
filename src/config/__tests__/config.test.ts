import { describe, it, expect } from "vitest";
import { CONFIG_DEFAULTS } from "../defaults.js";
import { ConfigSchema } from "../schema.js";
import { loadConfig } from "../load.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

describe("CONFIG_DEFAULTS", () => {
  it("has all required keys with correct types", () => {
    expect(CONFIG_DEFAULTS.mcp.activation).toBe("lazy");
    expect(CONFIG_DEFAULTS.attention.agentSeesHumanEvents).toBe(true);
    expect(CONFIG_DEFAULTS.attention.notifyHumanOnBlock).toBe(true);
    expect(CONFIG_DEFAULTS.gc.zombieSessionDays).toBe(30);
    expect(CONFIG_DEFAULTS.gc.maxEventsPerTask).toBe(10000);
    expect(CONFIG_DEFAULTS.server.port).toBe(7733);
    expect(CONFIG_DEFAULTS.server.openBrowser).toBe(true);
  });
});

describe("ConfigSchema", () => {
  it("accepts a valid full config", () => {
    const result = ConfigSchema.safeParse({
      mcp: { activation: "always-on" },
      attention: { agent_sees_human_events: false, notify_human_on_block: true },
      gc: { zombie_session_days: 14, max_events_per_task: 5000 },
      server: { port: 8080, open_browser: false },
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty config (all defaults apply)", () => {
    const result = ConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects an unknown mcp.activation value", () => {
    const result = ConfigSchema.safeParse({
      mcp: { activation: "bogus" },
    });
    expect(result.success).toBe(false);
  });
});

describe("loadConfig", () => {
  it("returns defaults when no config file exists", () => {
    const tmpDir = mkdtempSync(join(os.tmpdir(), "agentboard-cfg-test-"));
    try {
      const cfg = loadConfig(tmpDir);
      expect(cfg.mcp.activation).toBe("lazy");
      expect(cfg.server.port).toBe(7733);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("merges file values over defaults", () => {
    const tmpDir = mkdtempSync(join(os.tmpdir(), "agentboard-cfg-test-"));
    try {
      writeFileSync(
        join(tmpDir, "config.yaml"),
        "mcp:\n  activation: always-on\nserver:\n  port: 9999\n",
      );
      const cfg = loadConfig(tmpDir);
      expect(cfg.mcp.activation).toBe("always-on");
      expect(cfg.server.port).toBe(9999);
      // defaults for untouched keys
      expect(cfg.attention.agentSeesHumanEvents).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });
});
