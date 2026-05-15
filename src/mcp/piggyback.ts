import type Database from "better-sqlite3";
import { pollEvents } from "../events/poll.js";
import type { InsertedEvent } from "../events/insert.js";

type Db = InstanceType<typeof Database>;

export type WithPiggyback<T> = T & { pending_events: InsertedEvent[] };

// Attaches pending_events to every active-tool response.
// When agentSeesHumanEvents is true (config default), this is the zero-cost
// event delivery path — the agent gets event awareness without an extra poll call.
export async function withPiggyback<T extends Record<string, unknown>>(
  db: Db,
  sessionId: string | undefined,
  result: T,
): Promise<WithPiggyback<T>> {
  if (!sessionId) {
    return { ...result, pending_events: [] };
  }

  const { events } = pollEvents(db, sessionId);
  return { ...result, pending_events: events };
}
