import type { AppConfig } from "./schema.js";

export const CONFIG_DEFAULTS: AppConfig = {
  mcp: { activation: "lazy" },
  attention: { agentSeesHumanEvents: true, notifyHumanOnBlock: true },
  gc: { zombieSessionDays: 30, maxEventsPerTask: 10000 },
  server: { port: 7733, openBrowser: true },
};
