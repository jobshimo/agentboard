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
}
