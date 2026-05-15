// App root — wires chrome + router + store. Mirrors agentboard/prototype.jsx.
// Theme is local state because it controls a CSS class on the root element — not shared via store.

import { useState, useEffect, useMemo } from "react";
import { TopBar } from "./chrome/TopBar";
import { Sidebar } from "./chrome/Sidebar";
import type { TaskCounts } from "./chrome/Sidebar";
import { Router, navigate } from "./router/Router";
import { useTasks, useWorkflowFilter, useActiveRepo, useAvailableRepos, useWorkflows } from "./lib/store";
import type { ViewName } from "./lib/store";
import { startWs, closeAndReopen } from "./lib/ws";
import { getPersistedTheme, persistTheme, toggleTheme, applyThemeClass } from "./lib/theme";
import type { Theme } from "./lib/theme";
import { fetchTasks, fetchRepos, fetchWorkflows } from "./lib/api";
import { dispatch } from "./lib/store";

export function App() {
  const [theme, setTheme] = useState<Theme>(getPersistedTheme);
  const [topBarView, setTopBarView] = useState<ViewName>(deriveTopBarView());
  const [displayPaths, setDisplayPaths] = useState<Record<string, string>>({});
  const tasks = useTasks();
  const workflowFilter = useWorkflowFilter();
  const activeRepo = useActiveRepo();
  const availableRepos = useAvailableRepos();
  const workflows = useWorkflows();

  // Apply theme class to body whenever theme changes.
  useEffect(() => {
    applyThemeClass(theme);
    persistTheme(theme);
  }, [theme]);

  // Boot: S7 — fetch repos BEFORE tasks; pick activeRepo from localStorage or list[0].
  useEffect(() => {
    fetchRepos()
      .then(({ repos }) => {
        dispatch({ type: "SET_AVAILABLE_REPOS", availableRepos: repos.map((r) => r.path) });
        // Build displayPath map for TopBar (preserves user's original casing on Win32 — #621)
        const dpMap: Record<string, string> = {};
        for (const r of repos) {
          if (r.displayPath) dpMap[r.path] = r.displayPath;
        }
        if (Object.keys(dpMap).length > 0) setDisplayPaths(dpMap);
        // Pick from localStorage (already in state) or default to first repo
        const stored = localStorage.getItem("agentboard.activeRepo");
        const pick = (stored && repos.some((r) => r.path === stored))
          ? stored
          : (repos[0]?.path ?? null);
        if (pick) {
          dispatch({ type: "SET_ACTIVE_REPO", activeRepo: pick });
          startWs(pick);
          fetchTasks()
            .then((t) => dispatch({ type: "SET_TASKS", tasks: t }))
            .catch(() => { /* server may not be running during dev */ });
          fetchWorkflows()
            .then((wfs) => dispatch({ type: "SET_WORKFLOWS", workflows: wfs }))
            .catch(() => { /* non-fatal: sidebar shows empty until reload */ });
        }
        // If no repos: show empty hint (EmptyBoard handles this via activeRepo === null)
      })
      .catch(() => {
        // Daemon may not be running — start WS with whatever repo is set
        startWs();
        fetchTasks()
          .then((t) => dispatch({ type: "SET_TASKS", tasks: t }))
          .catch(() => { /* server may not be running during dev; WS reconnect covers it */ });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount

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

  // S7: switching repo rebinds WS + re-fetches board
  function handleSwitchRepo(repo: string): void {
    closeAndReopen(repo);
    fetchTasks()
      .then((t) => dispatch({ type: "SET_TASKS", tasks: t }))
      .catch(() => { /* server may not be running */ });
  }

  return (
    <div className={`ab-app theme-${theme}`} style={{ width: "100%", height: "100%" }}>
      <div className="ab-shell">
        <TopBar
          view={topBarView}
          onSetView={handleSetView}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          availableRepos={availableRepos}
          activeRepo={activeRepo}
          onSwitchRepo={handleSwitchRepo}
          displayPaths={displayPaths}
        />
        <div className="ab-main">
          <Sidebar
            activeView={topBarView}
            onPickView={handleSetView}
            workflowFilter={workflowFilter}
            onSetWorkflowFilter={(f) => dispatch({ type: "SET_WORKFLOW_FILTER", workflowFilter: f })}
            workflows={workflows}
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
