// Hook that orchestrates fetching workflows + health and dispatching to the store.
// Components consume useWorkflows() and useHealth() — they don't call fetch directly.
// DIP boundary: the only file that knows about both api and dispatch for settings data.

import { useEffect, useRef } from "react";
import { fetchWorkflows, fetchHealth } from "./api";
import { dispatch, useWorkflows, useHealth } from "./store";
import type { WorkflowSummary, HealthInfo } from "./api";

export function useSettingsData(): { workflows: WorkflowSummary[]; health: HealthInfo | null } {
  const workflows = useWorkflows();
  const health = useHealth();
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    void fetchWorkflows()
      .then(wfs => dispatch({ type: "SET_WORKFLOWS", workflows: wfs }))
      .catch(() => { /* degrade silently */ });

    void fetchHealth()
      .then(h => dispatch({ type: "SET_HEALTH", health: h }))
      .catch(() => { /* degrade silently */ });
  }, []);

  return { workflows, health };
}
