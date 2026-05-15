import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildApp } from "../app.js";
import { getDbForRepo, closeAllDbs } from "../../db/connection.js";

// ---------------------------------------------------------------------------
// Workflow discovery is filesystem-dependent. We stub it for REST tests
// so the suite is hermetic and fast.
// ---------------------------------------------------------------------------

vi.mock("../../workflows/discovery.js", () => ({
  resolveWorkflowPaths: () => ["/stub/coding-task.yaml"],
}));

vi.mock("../../workflows/load.js", () => ({
  loadWorkflowFile: () => ({
    id: "coding-task",
    label: "Coding Task",
    steps: [
      { id: "implement", label: "Implement", canAgentCompleteAlone: true },
      { id: "tests", label: "Tests", canAgentCompleteAlone: true },
    ],
  }),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "agb-rest-test-"));
  // Initialize the DB so .agentboard/db.sqlite exists (required by onRequest hook validation).
  getDbForRepo(dir);
  closeAllDbs();
  return dir;
}

function buildTestApp() {
  return buildApp({});
}

type TestApp = ReturnType<typeof buildTestApp>;

function repoUrl(repoDir: string, path: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}repo=${encodeURIComponent(repoDir)}`;
}

async function createTask(
  app: TestApp,
  repoDir: string,
  body: object = { title: "My task", workflow_id: "coding-task" },
) {
  return app.inject({
    method: "POST",
    url: repoUrl(repoDir, "/api/tasks"),
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// GET /api/tasks
// ---------------------------------------------------------------------------

describe("GET /api/tasks", () => {
  let repoDir: string;
  let app: TestApp;

  beforeEach(() => {
    repoDir = makeTempRepo();
    app = buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    closeAllDbs();
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("returns an empty array when no tasks exist", async () => {
    const res = await app.inject({ method: "GET", url: repoUrl(repoDir, "/api/tasks") });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("returns compact task shape after a task is created", async () => {
    await createTask(app, repoDir);
    const res = await app.inject({ method: "GET", url: repoUrl(repoDir, "/api/tasks") });
    expect(res.statusCode).toBe(200);
    const tasks = res.json<{ id: string; derived_status: string }[]>();
    expect(tasks).toHaveLength(1);
    const first = tasks.at(0);
    expect(first?.id).toMatch(/^T-\d+$/);
    expect(first?.derived_status).toBe("backlog");
  });

  it("includes subtasks array with type and status on each compact task", async () => {
    await createTask(app, repoDir);
    const res = await app.inject({ method: "GET", url: repoUrl(repoDir, "/api/tasks") });
    expect(res.statusCode).toBe(200);
    const tasks = res.json<{ id: string; subtasks: { type: string; status: string }[] }[]>();
    const first = tasks.at(0);
    expect(Array.isArray(first?.subtasks)).toBe(true);
    // stub workflow has 2 steps → 2 subtasks seeded
    expect(first?.subtasks).toHaveLength(2);
    expect(first?.subtasks[0]).toHaveProperty("type");
    expect(first?.subtasks[0]).toHaveProperty("status");
  });
});

// ---------------------------------------------------------------------------
// POST /api/tasks
// ---------------------------------------------------------------------------

describe("POST /api/tasks", () => {
  let repoDir: string;
  let app: TestApp;

  beforeEach(() => {
    repoDir = makeTempRepo();
    app = buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    closeAllDbs();
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("creates a local task and returns 201 with TaskFull shape", async () => {
    const res = await createTask(app, repoDir);
    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; title: string; subtasks: unknown[] }>();
    expect(body.id).toMatch(/^T-\d+$/);
    expect(body.title).toBe("My task");
    expect(Array.isArray(body.subtasks)).toBe(true);
    expect(body.subtasks).toHaveLength(2); // two steps in stub workflow
  });

  it("creates a referenced task when ref is provided", async () => {
    const res = await createTask(app, repoDir, {
      title: "Fix bug",
      workflow_id: "coding-task",
      ref: { source: "github", id: "acme/repo#7" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ type: string; ref_source: string; ref_id: string }>();
    expect(body.type).toBe("referenced");
    expect(body.ref_source).toBe("github");
    expect(body.ref_id).toBe("acme/repo#7");
  });

  it("returns 400 when title is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: repoUrl(repoDir, "/api/tasks"),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workflow_id: "coding-task" }),
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("validation/request");
  });

  it("returns 400 when workflow_id is unknown", async () => {
    const res = await app.inject({
      method: "POST",
      url: repoUrl(repoDir, "/api/tasks"),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "t", workflow_id: "nonexistent-wf" }),
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/tasks/:id
// ---------------------------------------------------------------------------

describe("GET /api/tasks/:id", () => {
  let repoDir: string;
  let app: TestApp;

  beforeEach(() => {
    repoDir = makeTempRepo();
    app = buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    closeAllDbs();
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("returns task detail with subtasks", async () => {
    const created = await createTask(app, repoDir);
    const { id } = created.json<{ id: string }>();

    const res = await app.inject({ method: "GET", url: repoUrl(repoDir, `/api/tasks/${id}`) });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ id: string; subtasks: { label: string }[] }>();
    expect(body.id).toBe(id);
    expect(body.subtasks.at(0)?.label).toBe("Implement");
  });

  it("returns 404 for a missing task", async () => {
    const res = await app.inject({ method: "GET", url: repoUrl(repoDir, "/api/tasks/T-999") });
    expect(res.statusCode).toBe(404);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("not_found/task");
  });
});

// ---------------------------------------------------------------------------
// GET /api/tasks/:id/discussion
// ---------------------------------------------------------------------------

describe("GET /api/tasks/:id/discussion", () => {
  let repoDir: string;
  let app: TestApp;

  beforeEach(() => {
    repoDir = makeTempRepo();
    app = buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    closeAllDbs();
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("returns entries shape when discussion is empty", async () => {
    const created = await createTask(app, repoDir);
    const { id } = created.json<{ id: string }>();

    const res = await app.inject({
      method: "GET",
      url: repoUrl(repoDir, `/api/tasks/${id}/discussion`),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ type: string; entries: unknown[] }>();
    expect(body.type).toBe("entries");
    expect(body.entries).toEqual([]);
  });

  it("returns 404 for unknown task", async () => {
    const res = await app.inject({
      method: "GET",
      url: repoUrl(repoDir, "/api/tasks/T-404/discussion"),
    });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/tasks/:id/comments
// ---------------------------------------------------------------------------

describe("POST /api/tasks/:id/comments", () => {
  let repoDir: string;
  let app: TestApp;

  beforeEach(() => {
    repoDir = makeTempRepo();
    app = buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    closeAllDbs();
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("appends a comment and returns 201 with the entry", async () => {
    const created = await createTask(app, repoDir);
    const { id } = created.json<{ id: string }>();

    const res = await app.inject({
      method: "POST",
      url: repoUrl(repoDir, `/api/tasks/${id}/comments`),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "Looks good!" }),
    });
    expect(res.statusCode).toBe(201);
    const entry = res.json<{ author: string; body: string }>();
    expect(entry.author).toBe("human");
    expect(entry.body).toBe("Looks good!");
  });

  it("returns 400 when body is missing", async () => {
    const created = await createTask(app, repoDir);
    const { id } = created.json<{ id: string }>();

    const res = await app.inject({
      method: "POST",
      url: repoUrl(repoDir, `/api/tasks/${id}/comments`),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for unknown task", async () => {
    const res = await app.inject({
      method: "POST",
      url: repoUrl(repoDir, "/api/tasks/T-999/comments"),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "hi" }),
    });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/tasks/:id/subtasks
// ---------------------------------------------------------------------------

describe("POST /api/tasks/:id/subtasks", () => {
  let repoDir: string;
  let app: TestApp;

  beforeEach(() => {
    repoDir = makeTempRepo();
    app = buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    closeAllDbs();
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("adds a custom subtask and returns 201", async () => {
    const created = await createTask(app, repoDir);
    const { id } = created.json<{ id: string }>();

    const res = await app.inject({
      method: "POST",
      url: repoUrl(repoDir, `/api/tasks/${id}/subtasks`),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "Manual review" }),
    });
    expect(res.statusCode).toBe(201);
    const subtask = res.json<{ label: string; custom: boolean; status: string }>();
    expect(subtask.label).toBe("Manual review");
    expect(subtask.custom).toBe(true);
    expect(subtask.status).toBe("pending");
  });

  it("returns 400 when label is missing", async () => {
    const created = await createTask(app, repoDir);
    const { id } = created.json<{ id: string }>();

    const res = await app.inject({
      method: "POST",
      url: repoUrl(repoDir, `/api/tasks/${id}/subtasks`),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/subtasks/:id
// ---------------------------------------------------------------------------

describe("PATCH /api/subtasks/:id", () => {
  let repoDir: string;
  let app: TestApp;

  beforeEach(() => {
    repoDir = makeTempRepo();
    app = buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    closeAllDbs();
    rmSync(repoDir, { recursive: true, force: true });
  });

  async function getFirstSubtaskId(): Promise<{ taskId: string; subtaskId: string }> {
    const created = await createTask(app, repoDir);
    const body = created.json<{ id: string; subtasks: { id: string }[] }>();
    const firstSubtask = body.subtasks.at(0);
    if (!firstSubtask) throw new Error("Expected at least one subtask");
    return { taskId: body.id, subtaskId: firstSubtask.id };
  }

  it("advances subtask status from pending to in-progress and returns delta", async () => {
    const { subtaskId } = await getFirstSubtaskId();

    const res = await app.inject({
      method: "PATCH",
      url: repoUrl(repoDir, `/api/subtasks/${subtaskId}`),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "in-progress" }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ id: string; status: string }>();
    expect(body.id).toBe(subtaskId);
    expect(body.status).toBe("in-progress");
  });

  it("updates note without changing status", async () => {
    const { subtaskId } = await getFirstSubtaskId();

    const res = await app.inject({
      method: "PATCH",
      url: repoUrl(repoDir, `/api/subtasks/${subtaskId}`),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: "sha:abc123" }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ note: string; status: string }>();
    expect(body.note).toBe("sha:abc123");
    expect(body.status).toBe("pending");
  });

  it("returns 409 on invalid state transition", async () => {
    const { subtaskId } = await getFirstSubtaskId();

    // pending → done is NOT a valid transition; must go pending → in-progress first
    const res = await app.inject({
      method: "PATCH",
      url: repoUrl(repoDir, `/api/subtasks/${subtaskId}`),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    expect(res.statusCode).toBe(409);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("state/invalid_transition");
  });

  it("returns 400 when body has neither status nor note", async () => {
    const { subtaskId } = await getFirstSubtaskId();

    const res = await app.inject({
      method: "PATCH",
      url: repoUrl(repoDir, `/api/subtasks/${subtaskId}`),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for an unknown subtask id", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: repoUrl(repoDir, "/api/subtasks/s-9999"),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "in-progress" }),
    });
    expect(res.statusCode).toBe(404);
  });

  it("recomputes task derived_status to active when subtask goes in-progress", async () => {
    const { taskId, subtaskId } = await getFirstSubtaskId();

    await app.inject({
      method: "PATCH",
      url: repoUrl(repoDir, `/api/subtasks/${subtaskId}`),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "in-progress" }),
    });

    const taskRes = await app.inject({
      method: "GET",
      url: repoUrl(repoDir, `/api/tasks/${taskId}`),
    });
    const task = taskRes.json<{ derived_status: string }>();
    expect(task.derived_status).toBe("active");
  });
});

// ---------------------------------------------------------------------------
// POST /api/tasks/:id/feedback
// ---------------------------------------------------------------------------

describe("POST /api/tasks/:id/feedback", () => {
  let repoDir: string;
  let app: TestApp;

  beforeEach(() => {
    repoDir = makeTempRepo();
    app = buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    closeAllDbs();
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("adds feedback and returns {ok, event_id}", async () => {
    const created = await createTask(app, repoDir);
    const { id } = created.json<{ id: string }>();

    const res = await app.inject({
      method: "POST",
      url: repoUrl(repoDir, `/api/tasks/${id}/feedback`),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target: id,
        text: "This broke in staging.",
        severity: "correction",
      }),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ ok: boolean; event_id: number }>();
    expect(body.ok).toBe(true);
    expect(typeof body.event_id).toBe("number");
  });

  it("returns 400 for invalid severity", async () => {
    const created = await createTask(app, repoDir);
    const { id } = created.json<{ id: string }>();

    const res = await app.inject({
      method: "POST",
      url: repoUrl(repoDir, `/api/tasks/${id}/feedback`),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: id, text: "Bad", severity: "urgent" }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for unknown task", async () => {
    const res = await app.inject({
      method: "POST",
      url: repoUrl(repoDir, "/api/tasks/T-999/feedback"),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "T-999", text: "oops" }),
    });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/tasks/:id/markdown
// ---------------------------------------------------------------------------

describe("GET /api/tasks/:id/markdown", () => {
  let repoDir: string;
  let app: TestApp;

  beforeEach(() => {
    repoDir = makeTempRepo();
    app = buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    closeAllDbs();
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("returns text/markdown content for an existing task", async () => {
    const created = await createTask(app, repoDir, {
      title: "Markdown test task",
      workflow_id: "coding-task",
    });
    const { id } = created.json<{ id: string }>();

    const res = await app.inject({
      method: "GET",
      url: repoUrl(repoDir, `/api/tasks/${id}/markdown`),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/markdown");
    expect(res.body).toContain("# Markdown test task");
    expect(res.body).toContain("## Subtasks");
  });

  it("returns 404 for unknown task", async () => {
    const res = await app.inject({
      method: "GET",
      url: repoUrl(repoDir, "/api/tasks/T-999/markdown"),
    });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/workflows
// ---------------------------------------------------------------------------

describe("GET /api/workflows", () => {
  let repoDir: string;
  let app: TestApp;

  beforeEach(() => {
    repoDir = makeTempRepo();
    app = buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    closeAllDbs();
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("returns list of available workflows", async () => {
    const res = await app.inject({ method: "GET", url: repoUrl(repoDir, "/api/workflows") });
    expect(res.statusCode).toBe(200);
    const workflows = res.json<{ id: string }[]>();
    expect(workflows).toHaveLength(1);
    expect(workflows.at(0)?.id).toBe("coding-task");
  });
});
