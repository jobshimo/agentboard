import { z } from "zod";

const McpActivation = z.enum(["lazy", "always-on", "prompt"]);

export const ConfigSchema = z.object({
  mcp: z
    .object({
      activation: McpActivation.optional(),
    })
    .optional(),
  attention: z
    .object({
      agent_sees_human_events: z.boolean().optional(),
      notify_human_on_block: z.boolean().optional(),
    })
    .optional(),
  gc: z
    .object({
      zombie_session_days: z.number().int().positive().optional(),
      max_events_per_task: z.number().int().positive().optional(),
    })
    .optional(),
  server: z
    .object({
      port: z.number().int().min(1).max(65535).optional(),
      open_browser: z.boolean().optional(),
    })
    .optional(),
});

export type RawConfig = z.infer<typeof ConfigSchema>;

export type McpActivationMode = z.infer<typeof McpActivation>;

export interface AppConfig {
  mcp: { activation: McpActivationMode };
  attention: { agentSeesHumanEvents: boolean; notifyHumanOnBlock: boolean };
  gc: { zombieSessionDays: number; maxEventsPerTask: number };
  server: { port: number; openBrowser: boolean };
}
