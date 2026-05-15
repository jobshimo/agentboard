/**
 * Update check against the npm registry.
 * Fetches https://registry.npmjs.org/-/package/@jobshimo/agentboard/dist-tags
 * with a 2-second timeout. On any error, degrades gracefully to "up-to-date"
 * so the UX is never blocked.
 */

const DIST_TAGS_URL =
  "https://registry.npmjs.org/-/package/@jobshimo/agentboard/dist-tags";

export interface UpdateCheckResult {
  status: "up-to-date" | "newer";
  /** Only set when status === "newer". */
  latest?: string;
}

/**
 * Parse a semver string into a comparable integer tuple.
 * Returns [0,0,0] for invalid input — callers degrade gracefully.
 */
function parseSemver(v: string): [number, number, number] {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1]!, 10), parseInt(m[2]!, 10), parseInt(m[3]!, 10)];
}

function isNewer(latest: string, current: string): boolean {
  const [la, lb, lc] = parseSemver(latest);
  const [ca, cb, cc] = parseSemver(current);
  if (la !== ca) return la > ca;
  if (lb !== cb) return lb > cb;
  return lc > cc;
}

/**
 * Check the npm registry for a newer version.
 *
 * @param currentVersion - the version string from package.json
 */
export async function checkForUpdate(
  currentVersion: string,
): Promise<UpdateCheckResult> {
  try {
    const response = await fetch(DIST_TAGS_URL, {
      signal: AbortSignal.timeout(2000),
    });

    if (!response.ok) {
      return { status: "up-to-date" };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const latest = data["latest"];

    if (typeof latest !== "string") {
      return { status: "up-to-date" };
    }

    if (isNewer(latest, currentVersion)) {
      return { status: "newer", latest };
    }

    return { status: "up-to-date" };
  } catch {
    // Network error, timeout, parse error — do not block UX.
    return { status: "up-to-date" };
  }
}
