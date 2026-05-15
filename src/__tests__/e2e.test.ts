/**
 * Board flow integration test: exercises create/subtask/close via REST API.
 *
 * Note: Full STDIO MCP end-to-end (stdin/stdout simulation) is out of scope
 * for this run — requires real stdin/stdout transport plumbing. This test
 * covers the same surface via Fastify inject + REST, which exercises the same
 * domain layer and event pipeline.
 *
 * W5: cross-cutting integration tests — board flow
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildApp } from "../server/app.js";
import { getDbForRepo, closeAllDbs } from "../db/connection.js";

// Mock workflow discovery for deterministic test behavior
vi.mock("../workflows/discovery.js", () => ({
  resolveWorkflowPaths: () => ["/stub/feature.yaml"],
}));

vi.mock("../workflows/load.js", () => ({
  loadWorkflowFile: () => ({
    id: "feature",
    label: "Feature Development",
    steps: [
      { id: "implement", label: "Implement", canAgentCompleteAlone: true },
      { id: "tests", label: "Write Tests", canAgentCompleteAlone: true },
    ],
  }),
}));

function makeTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "agb-e2e-test-"));
  getDbForRepo(dir);
  closeAllDbs();
  return dir;
}

function repoUrl(repoDir: string, path: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}repo=${encodeURIComponent(repoDir)}`;
}

describe("board flow integration — create / subtask / complete", () => {
  let repoDir: string;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    repoDir = makeTempRepo();
    app = buildApp({});
  });

  afterEach(async () => {
    await app.close();
    closeAllDbs();
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("full task lifecycle: create → start → update subtask → complete", async () => {
    // Step 1: Create a task
    const createRes = await app.inject({
      method: "POST",
      url: repoUrl(repoDir, "/api/tasks"),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Implement login feature", workflow_id: "feature" }),
    });
    expect(createRes.statusCode).toBe(201);
    const task = createRes.json<{ id: string; title: string; subtasks: { id: string; status: string }[] }>();
    expect(task.id).toMatch(/^T-\d+$/);
    expect(task.title).toBe("Implement login feature");
    expect(task.subtasks).toHaveLength(2); // 2 steps in stub workflow

    const taskId = task.id;
    const firstSubtask = task.subtasks[0]!;
    expect(firstSubtask.status).toBe("pending");

    // Step 2: GET /api/tasks confirms task appears in compact list with subtasks
    const listRes = await app.inject({
      method: "GET",
      url: repoUrl(repoDir, "/api/tasks"),
    });
    expect(listRes.statusCode).toBe(200);
    const compactList = listRes.json<{ id: string; subtasks: { type: string; status: string }[] }[]>();
    expect(compactList).toHaveLength(1);
    expect(compactList[0]?.subtasks).toHaveLength(2);

    // Step 3: PATCH subtask to in-progress
    const patchRes = await app.inject({
      method: "PATCH",
      url: repoUrl(repoDir, `/api/subtasks/${encodeURIComponent(firstSubtask.id)}`),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "in-progress" }),
    });
    expect(patchRes.statusCode).toBe(200);
    const patched = patchRes.json<{ id: string; status: string }>();
    expect(patched.status).toBe("in-progress");

    // Step 4: Move all subtasks to terminal state so we can complete the task
    // Must go pending → in-progress → done (valid transitions)
    const taskDetailRes = await app.inject({
      method: "GET",
      url: repoUrl(repoDir, `/api/tasks/${encodeURIComponent(taskId)}`),
    });
    const taskDetail = taskDetailRes.json<{ subtasks: { id: string; status: string }[] }>();

    for (const subtask of taskDetail.subtasks) {
      if (subtask.status === "pending") {
        // pending → in-progress
        await app.inject({
          method: "PATCH",
          url: repoUrl(repoDir, `/api/subtasks/${encodeURIComponent(subtask.id)}`),
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "in-progress" }),
        });
        // in-progress → done
        await app.inject({
          method: "PATCH",
          url: repoUrl(repoDir, `/api/subtasks/${encodeURIComponent(subtask.id)}`),
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "done" }),
        });
      } else if (subtask.status === "in-progress") {
        await app.inject({
          method: "PATCH",
          url: repoUrl(repoDir, `/api/subtasks/${encodeURIComponent(subtask.id)}`),
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "done" }),
        });
      }
    }

    // Step 5: Add a comment
    const commentRes = await app.inject({
      method: "POST",
      url: repoUrl(repoDir, `/api/tasks/${encodeURIComponent(taskId)}/comments`),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "Implementation complete. Tests pass." }),
    });
    expect(commentRes.statusCode).toBe(201);

    // Step 6: Verify task derived_status updated to done
    const finalRes = await app.inject({
      method: "GET",
      url: repoUrl(repoDir, `/api/tasks/${encodeURIComponent(taskId)}`),
    });

    const finalTask = finalRes.json<{ id: string; derived_status: string }>();
    expect(finalTask.id).toBe(taskId);
    // After all subtasks are done, derived_status should be "done"
    expect(finalTask.derived_status).toBe("done");
  });

  it("GET /api/tasks returns compact shape with subtasks field", async () => {
    await app.inject({
      method: "POST",
      url: repoUrl(repoDir, "/api/tasks"),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Test task", workflow_id: "feature" }),
    });

    const res = await app.inject({
      method: "GET",
      url: repoUrl(repoDir, "/api/tasks"),
    });

    expect(res.statusCode).toBe(200);
    const tasks = res.json<{ id: string; derived_status: string; subtasks: { type: string; status: string }[] }[]>();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.subtasks).toHaveLength(2);
    expect(tasks[0]?.subtasks[0]).toHaveProperty("type");
    expect(tasks[0]?.subtasks[0]).toHaveProperty("status");
  });
});
