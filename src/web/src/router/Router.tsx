// Hash-based router. Listens to hashchange, dispatches SET_ROUTE to the store.
// Components read route via useRoute() and never touch window.location directly.

import { useEffect } from "react";
import { matchRoute, buildHash } from "./route";
import { dispatch, useRoute } from "../lib/store";
import type { RouteMatch } from "./route";
import { Board } from "../views/Board";
import { TaskDetail } from "../views/TaskDetail";
import { Settings } from "../views/Settings";

function syncRouteFromHash(): void {
  const route = matchRoute(window.location.hash);
  dispatch({ type: "SET_ROUTE", route });
}

// Exported for App to call when it changes route programmatically.
export function navigate(route: RouteMatch): void {
  window.location.hash = buildHash(route);
  // hashchange event fires and syncRouteFromHash updates the store.
}

export function Router() {
  // Sync on mount and on every hash change.
  useEffect(() => {
    syncRouteFromHash();
    window.addEventListener("hashchange", syncRouteFromHash);
    return () => window.removeEventListener("hashchange", syncRouteFromHash);
  }, []);

  const route = useRoute();

  if (route.view === "settings") {
    return <Settings />;
  }

  if (route.view === "detail" && route.taskId) {
    return (
      <TaskDetail
        taskId={route.taskId}
        onBack={() => navigate({ view: "board" })}
      />
    );
  }

  return <Board />;
}
