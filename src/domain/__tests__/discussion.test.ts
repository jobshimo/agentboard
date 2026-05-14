import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../db/migrate.js";
import { appendEntry, getEntries } from "../discussion.js";

type Db = InstanceType<typeof Database>;

function freshDb(): Db {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

function insertTask(db: Db, id = "T-1"): void {
  db.prepare(`
    INSERT INTO tasks (id, type, title, workflow_id, workflow_snapshot)
    VALUES (?, 'local', 'Test Task', 'wf1', '{}')
  `).run(id);
}

describe("appendEntry", () => {
  let db: Db;

  beforeEach(() => { db = freshDb(); });
  afterEach(() => db.close());

  it("inserts a discussion entry on an existing task", () => {
    insertTask(db);
    appendEntry(db, "T-1", "human", "Hello!");
    const rows = db.prepare("SELECT * FROM discussion_entries WHERE task_id = 'T-1'").all();
    expect(rows).toHaveLength(1);
  });

  it("stores author and body correctly", () => {
    insertTask(db);
    appendEntry(db, "T-1", "agent", "Analysis done.");

    const row = db.prepare("SELECT * FROM discussion_entries LIMIT 1").get() as Record<string, unknown>;
    expect(row["author"]).toBe("agent");
    expect(row["body"]).toBe("Analysis done.");
  });

  it("stores an optional tag when provided", () => {
    insertTask(db);
    appendEntry(db, "T-1", "system", "Subtask created", "subtask");

    const row = db.prepare("SELECT tag FROM discussion_entries LIMIT 1").get() as { tag: string };
    expect(row.tag).toBe("subtask");
  });

  it("stores null tag when tag is omitted", () => {
    insertTask(db);
    appendEntry(db, "T-1", "human", "No tag here");

    const row = db.prepare("SELECT tag FROM discussion_entries LIMIT 1").get() as { tag: string | null };
    expect(row.tag).toBeNull();
  });

  it("throws when the task does not exist", () => {
    expect(() => appendEntry(db, "T-999", "human", "Orphan")).toThrow(/task not found/i);
  });

  it("appends multiple entries without modifying existing ones", () => {
    insertTask(db);
    appendEntry(db, "T-1", "human", "First");
    appendEntry(db, "T-1", "agent", "Second");

    const rows = db.prepare("SELECT body FROM discussion_entries ORDER BY id ASC").all() as { body: string }[];
    expect(rows[0].body).toBe("First");
    expect(rows[1].body).toBe("Second");
  });
});

describe("getEntries", () => {
  let db: Db;

  beforeEach(() => { db = freshDb(); });
  afterEach(() => db.close());

  it("returns entries in ascending id order", () => {
    insertTask(db);
    appendEntry(db, "T-1", "human", "A");
    appendEntry(db, "T-1", "agent", "B");
    appendEntry(db, "T-1", "system", "C");

    const result = getEntries(db, "T-1");
    expect(result.type).toBe("entries");
    if (result.type !== "entries") return;
    expect(result.entries.map((e) => e.body)).toEqual(["A", "B", "C"]);
  });

  it("returns a summary block when there are more than 50 entries", () => {
    insertTask(db);
    for (let i = 0; i < 51; i++) {
      appendEntry(db, "T-1", "human", `Entry ${i}`);
    }

    const result = getEntries(db, "T-1");
    expect(result.type).toBe("summary");
    if (result.type !== "summary") return;
    expect(result.total).toBe(51);
    expect(typeof result.summary).toBe("string");
  });

  it("respects the optional limit parameter", () => {
    insertTask(db);
    for (let i = 0; i < 5; i++) {
      appendEntry(db, "T-1", "human", `Entry ${i}`);
    }

    const result = getEntries(db, "T-1", 3);
    expect(result.type).toBe("entries");
    if (result.type !== "entries") return;
    expect(result.entries).toHaveLength(3);
  });

  it("returns an empty entries list for a task with no discussion", () => {
    insertTask(db);
    const result = getEntries(db, "T-1");
    expect(result.type).toBe("entries");
    if (result.type !== "entries") return;
    expect(result.entries).toHaveLength(0);
  });
});
