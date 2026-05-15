// App root — wires chrome + router + store. Mirrors agentboard/prototype.jsx.
// Theme is local state because it controls a CSS class on the root element — not shared via store.

import { useState, useEffect, useMemo } from "react";
import { TopBar } from "./chrome/TopBar";
import { Sidebar } from "./chrome/Sidebar";
import type { WorkflowSummary, TaskCounts } from "./chrome/Sidebar";
import { Router, navigate } from "./router/Router";
import { useTasks, useWorkflowFilter } from "./lib/store";
import type { ViewName } from "./lib/store";
import { startWs } from "./lib/ws";
import { getPersistedTheme, persistTheme, toggleTheme, applyThemeClass } from "./lib/theme";
import type { Theme } from "./lib/theme";
import { fetchTasks } from "./lib/api";
import { dispatch } from "./lib/store";

// Workflows are static metadata — the real list comes from GET /api/workflows in S10d.
// S10a uses an empty placeholder so the sidebar renders without an extra fetch.
const PLACEHOLDER_WORKFLOWS: WorkflowSummary[] = [];

export function App() {
  const [theme, setTheme] = useState<Theme>(getPersistedTheme);
  const [topBarView, setTopBarView] = useState<ViewName>(deriveTopBarView());
  const tasks = useTasks();
  const workflowFilter = useWorkflowFilter();

  // Apply theme class to body whenever theme changes.
  useEffect(() => {
    applyThemeClass(theme);
    persistTheme(theme);
  }, [theme]);

  // Boot: start WS client and initial task fetch.
  useEffect(() => {
    startWs();
    fetchTasks()
      .then(t => dispatch({ type: "SET_TASKS", tasks: t }))
      .catch(() => { /* server may not be running during dev; WS reconnect covers it */ });
  }, []);

  // Keep topBarView in sync with hash changes (e.g. browser back/forward).
  useEffect(() => {
    function onHashChange() {
      setTopBarView(deriveTopBarView());
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const taskCounts = useMemo<TaskCounts>(() => {
    const byWorkflow: Record<string, number> = {};
    const byRef = { github: 0, jira: 0, linear: 0, local: 0 };
    let done = 0;
    for (const t of tasks) {
      byWorkflow[t.workflow_id] = (byWorkflow[t.workflow_id] ?? 0) + 1;
      const src = (t.ref_source ?? "local") as keyof typeof byRef;
      if (src in byRef) byRef[src] += 1;
      else byRef.local += 1;
      if (t.derived_status === "done") done += 1;
    }
    return { all: tasks.length, done, byWorkflow, byRef };
  }, [tasks]);

  function handleSetView(v: ViewName): void {
    setTopBarView(v);
    if (v === "settings") {
      navigate({ view: "settings" });
    } else {
      navigate({ view: "board" });
    }
  }

  function handleToggleTheme(): void {
    setTheme(prev => toggleTheme(prev));
  }

  return (
    <div className={`ab-app theme-${theme}`} style={{ width: "100%", height: "100%" }}>
      <div className="ab-shell">
        <TopBar
          view={topBarView}
          onSetView={handleSetView}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />
        <div className="ab-main">
          <Sidebar
            activeView={topBarView}
            onPickView={handleSetView}
            workflowFilter={workflowFilter}
            onSetWorkflowFilter={(f) => dispatch({ type: "SET_WORKFLOW_FILTER", workflowFilter: f })}
            workflows={PLACEHOLDER_WORKFLOWS}
            taskCounts={taskCounts}
          />
          <div style={{ minWidth: 0, position: "relative", overflow: "hidden" }}>
            <Router />
          </div>
        </div>
      </div>
    </div>
  );
}

// Derives "board" | "settings" from the current hash for tab highlighting.
// Pure function — no side effects, safe to call at render time.
function deriveTopBarView(): ViewName {
  if (typeof window === "undefined") return "board";
  return window.location.hash.startsWith("#/settings") ? "settings" : "board";
}
