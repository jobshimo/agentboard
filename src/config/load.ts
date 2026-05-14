import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { ConfigSchema } from "./schema.js";
import type { AppConfig, RawConfig } from "./schema.js";
import { CONFIG_DEFAULTS } from "./defaults.js";

function mergeConfig(raw: RawConfig): AppConfig {
  return {
    mcp: {
      activation: raw.mcp?.activation ?? CONFIG_DEFAULTS.mcp.activation,
    },
    attention: {
      agentSeesHumanEvents:
        raw.attention?.agent_sees_human_events ??
        CONFIG_DEFAULTS.attention.agentSeesHumanEvents,
      notifyHumanOnBlock:
        raw.attention?.notify_human_on_block ??
        CONFIG_DEFAULTS.attention.notifyHumanOnBlock,
    },
    gc: {
      zombieSessionDays:
        raw.gc?.zombie_session_days ?? CONFIG_DEFAULTS.gc.zombieSessionDays,
      maxEventsPerTask:
        raw.gc?.max_events_per_task ?? CONFIG_DEFAULTS.gc.maxEventsPerTask,
    },
    server: {
      port: raw.server?.port ?? CONFIG_DEFAULTS.server.port,
      openBrowser: raw.server?.open_browser ?? CONFIG_DEFAULTS.server.openBrowser,
    },
  };
}

export function loadConfig(configDir: string): AppConfig {
  const configPath = join(configDir, "config.yaml");

  if (!existsSync(configPath)) {
    return { ...CONFIG_DEFAULTS };
  }

  const raw = yaml.load(readFileSync(configPath, "utf8"));
  const result = ConfigSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid config at ${configPath}:\n${issues}`);
  }

  return mergeConfig(result.data);
}
