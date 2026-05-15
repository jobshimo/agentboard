// Pure route-matching logic — no DOM, no React. Fully testable.
// Hash-based routing: #/board, #/tasks/:id, #/settings

export type ViewName = "board" | "detail" | "settings";

export interface RouteMatch {
  view: ViewName;
  taskId?: string;
}

// Parses the hash fragment (without the leading #) into a RouteMatch.
// Unrecognised paths fall back to board.
export function matchRoute(hash: string): RouteMatch {
  // Strip leading # and / for normalisation
  const path = hash.replace(/^#?\/?/, "");

  if (path === "settings") {
    return { view: "settings" };
  }

  const detailMatch = path.match(/^tasks\/([^/]+)$/);
  if (detailMatch) {
    const taskId = detailMatch[1];
    if (taskId) return { view: "detail", taskId };
  }

  // "board" or "" or anything unrecognised → board
  return { view: "board" };
}

// Builds the canonical hash string for a given route.
export function buildHash(route: RouteMatch): string {
  if (route.view === "settings") return "#/settings";
  if (route.view === "detail" && route.taskId) return `#/tasks/${route.taskId}`;
  return "#/board";
}
