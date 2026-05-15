/**
 * Browser-safe path utilities (no Node.js `path` module).
 */

/**
 * Return the basename of a file path (cross-platform).
 * Handles both forward slash and backslash separators.
 */
export function basename(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).at(-1) ?? path;
}
