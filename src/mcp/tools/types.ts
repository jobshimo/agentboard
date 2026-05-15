import type Database from "better-sqlite3";
import type { WaiterRegistry } from "../../events/wait.js";
import type { BroadcastManager } from "../../server/broadcaster.js";
import type { ActivationState } from "../activation.js";
import type { InsertEventHooks } from "../../events/insert.js";

type Db = InstanceType<typeof Database>;

// Services bag passed from buildApp → buildMcpServer → installTools.
// Each tool closes over only what it needs (ISP).
export interface McpServices {
  db: Db;
  waiters: WaiterRegistry;
  broadcaster: BroadcastManager;
  activation: ActivationState;
  // Event hooks wired from the broadcaster/waiters listeners.
  // Tools that insert events must pass these so subscribers are notified.
  eventHooks: InsertEventHooks;
  /**
   * Session ID minted at STDIO process startup (UUID v4).
   * Set only for `agentboard mcp` STDIO sessions. Tools fall back to this
   * when extra.sessionId is undefined (SDK does not synthesize session IDs
   * for STDIO transport).
   * REQ-M-02
   */
  mintedSessionId?: string;
  /**
   * When false, human-origin events are filtered from the piggyback bundle
   * so the agent only sees agent/system events in its pending_events.
   * Defaults to true (pass all events). Wired from config attention.agent_sees_human_events.
   */
  agentSeesHumanEvents: boolean;
}
