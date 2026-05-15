/**
 * Daemon registry: ~/.agentboard/daemon.json
 *
 * Schema v1: { version: 1, repos: [{ path, lastSeenAt }] }
 *
 * Single writer (daemon). STDIO process never writes registry.
 * Atomic write (tmp + rename). Debounced upsert.
 *
 * REQ-S-03, REQ-D-04, REQ-R-05, REQ-D-07
 */
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { normalizeRepoPath } from "../db/connection.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export interface RepoEntry {
  /** Normalized absolute path to the repo root. */
  path: string;
  /** ISO 8601 timestamp of when this repo was last seen by the daemon. */
  lastSeenAt: string;
  /**
   * Original path as typed/passed by the user — preserves casing on Win32.
   * Falls back to `path` when not available (older entries).
   */
  displayPath?: string;
}

export interface Registry {
  version: 1;
  repos: RepoEntry[];
}

const REGISTRY_FILE = "daemon.json";

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/** Return an empty registry with the correct shape. */
function emptyRegistry(): Registry {
  return { version: 1, repos: [] };
}

function isValidRegistry(data: unknown): data is Registry {
  if (typeof data !== "object" || data === null) return false;
  const r = data as Record<string, unknown>;
  return r["version"] === 1 && Array.isArray(r["repos"]);
}

/**
 * Load the registry from ~/.agentboard/daemon.json.
 * Missing → empty. Malformed → rename to .bak.<ts> and return empty.
 *
 * REQ-S-03, REQ-D-07
 */
export function loadRegistry(agbHome: string): Registry {
  const path = join(agbHome, REGISTRY_FILE);
  if (!existsSync(path)) return emptyRegistry();

  try {
    const raw = readFileSync(path, "utf8");
    const data: unknown = JSON.parse(raw);
    if (!isValidRegistry(data)) throw new Error("schema mismatch");
    return data;
  } catch {
    // Corrupt — rename to backup and start fresh
    const backupPath = join(agbHome, `daemon.bak.${Date.now()}.json`);
    try {
      renameSync(path, backupPath);
    } catch {
      // If rename fails, just return empty
    }
    return emptyRegistry();
  }
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

/**
 * Save registry to ~/.agentboard/daemon.json atomically via tmp + rename.
 *
 * REQ-S-03
 */
export function saveRegistry(agbHome: string, registry: Registry): void {
  mkdirSync(agbHome, { recursive: true });
  const finalPath = join(agbHome, REGISTRY_FILE);
  const tmpPath = join(agbHome, `daemon.tmp.${Date.now()}.json`);
  writeFileSync(tmpPath, JSON.stringify(registry, null, 2), "utf8");
  renameSync(tmpPath, finalPath);
}

// ---------------------------------------------------------------------------
// Upsert
// ---------------------------------------------------------------------------

/**
 * Return a new Registry with the given repoPath upserted.
 * - If path already exists: update lastSeenAt.
 * - If new: append.
 * - Always sorted by lastSeenAt descending.
 *
 * Does NOT mutate the input registry.
 *
 * REQ-S-03
 */
export function upsertRepo(registry: Registry, repoPath: string, displayPath?: string): Registry {
  const normalizedPath = normalizeRepoPath(repoPath);
  const now = new Date().toISOString();

  const existing = registry.repos.find((r) => normalizeRepoPath(r.path) === normalizedPath);
  let newRepos: RepoEntry[];

  if (existing) {
    newRepos = registry.repos.map((r) =>
      normalizeRepoPath(r.path) === normalizedPath
        ? { ...r, lastSeenAt: now, ...(displayPath ? { displayPath } : {}) }
        : r,
    );
  } else {
    newRepos = [...registry.repos, { path: normalizedPath, lastSeenAt: now, ...(displayPath ? { displayPath } : {}) }];
  }

  // Sort descending by lastSeenAt (most recent first)
  newRepos.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));

  return { version: 1, repos: newRepos };
}

// ---------------------------------------------------------------------------
// Debounced upsert
// ---------------------------------------------------------------------------

/**
 * Module-level debounce state. Single daemon process only.
 * Cancel-on-reassign pattern: storing the timer handle.
 */
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _cachedRegistry: Registry | null = null;

const DEBOUNCE_MS = 500;

/**
 * Debounced registry upsert called from the onRequest hook on cache miss.
 * Batches rapid writes (e.g. many parallel requests for a new repo) into
 * a single disk write 500ms after the last call.
 *
 * REQ-S-03
 */
export function debouncedUpsert(agbHome: string, repoPath: string, displayPath?: string): void {
  // Load once (or use cached state)
  if (_cachedRegistry === null) {
    _cachedRegistry = loadRegistry(agbHome);
  }

  _cachedRegistry = upsertRepo(_cachedRegistry, repoPath, displayPath);

  if (_debounceTimer !== null) {
    clearTimeout(_debounceTimer);
  }

  const snapshot = _cachedRegistry;
  _debounceTimer = setTimeout(() => {
    saveRegistry(agbHome, snapshot);
    _debounceTimer = null;
  }, DEBOUNCE_MS);
}

/** Reset module-level state — for testing only. */
export function _resetRegistryState(): void {
  if (_debounceTimer !== null) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }
  _cachedRegistry = null;
}
