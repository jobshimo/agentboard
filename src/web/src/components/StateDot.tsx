// Atom: six-state visual dot. data-state drives CSS. Mirrors components.jsx StateDot.

import { CheckSm, X, Pause } from "../icons";

type SubtaskStatus = "pending" | "in-progress" | "done" | "blocked" | "failed" | "skipped";

interface StateDotProps {
  state?: SubtaskStatus;
  size?: "sm" | "lg" | "xl";
}

export function StateDot({ state = "pending", size = "sm" }: StateDotProps) {
  const sizeCls = size === "lg" ? "lg" : size === "xl" ? "xl" : "";

  const inner =
    state === "done"        ? <CheckSm sz={8} /> :
    state === "failed"      ? <X sz={8} /> :
    state === "blocked"     ? <Pause sz={8} /> :
    state === "in-progress" ? (
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--bg-canvas)" }} />
    ) : null;

  return (
    <span className={`state-dot${sizeCls ? ` ${sizeCls}` : ""}`} data-state={state} title={state}>
      {inner}
    </span>
  );
}
