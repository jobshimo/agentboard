import type Database from "better-sqlite3";
import { pollEvents } from "../events/poll.js";
import type { InsertedEvent } from "../events/insert.js";

type Db = InstanceType<typeof Database>;

export type WithPiggyback<T> = T & { pending_events: InsertedEvent[] };

// Attaches pending_events to every active-tool response.
// When agentSeesHumanEvents is true (config default), all polled events are
// included. When false, events where origin === "human" are filtered out so
// the agent only receives agent/system-authored events.
export async function withPiggyback<T extends Record<string, unknown>>(
  db: Db,
  sessionId: string | undefined,
  result: T,
  agentSeesHumanEvents = true,
): Promise<WithPiggyback<T>> {
  if (!sessionId) {
    return { ...result, pending_events: [] };
  }

  const { events } = pollEvents(db, sessionId);
  const filtered = agentSeesHumanEvents
    ? events
    : events.filter((e) => e.origin !== "human");

  return { ...result, pending_events: filtered };
}
