/**
 * Module augmentation: extend FastifyRequest with per-repo fields
 * injected by the onRequest hook in app.ts.
 *
 * REQ-S-02
 */
import type Database from "better-sqlite3";

type Db = InstanceType<typeof Database>;

declare module "fastify" {
  interface FastifyRequest {
    /** Per-request DB instance scoped to the resolved repo root. */
    db: Db;
    /** Normalized absolute path to the repo root (via normalizeRepoPath). */
    repoRoot: string;
  }
}
