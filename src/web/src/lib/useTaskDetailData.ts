// Hook that orchestrates fetching task detail + discussion and dispatching to the store.
// Components consume useTaskDetail(id) and useDiscussion(id) — they don't know about fetch.
// This hook is the DIP boundary: the only place that knows about api + dispatch together.

import { useEffect, useRef } from "react";
import { fetchTask, fetchDiscussion } from "./api";
import { dispatch, useTaskDetail, useDiscussion } from "./store";
import type { TaskFull, DiscussionEntry } from "./api";

// Returns [task, discussion] from the store; triggers fetch on mount and when id changes.
export function useTaskDetailData(id: string): { task: TaskFull | null; discussion: DiscussionEntry[] } {
  const task = useTaskDetail(id);
  const discussion = useDiscussion(id);

  // Track whether we've already fetched for this id so strict-mode double-invocation is safe.
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (fetchedRef.current === id) return;
    fetchedRef.current = id;

    void fetchTask(id)
      .then(t => dispatch({ type: "SET_TASK_DETAIL", task: t }))
      .catch(() => { /* silently degrade — WS reconnect will retry */ });

    void fetchDiscussion(id)
      .then(res => {
        // Both "entries" and "summary" shapes include an entries array.
        dispatch({ type: "SET_DISCUSSION", taskId: id, entries: res.entries });
      })
      .catch(() => { /* silent */ });
  }, [id]);

  return { task, discussion };
}
