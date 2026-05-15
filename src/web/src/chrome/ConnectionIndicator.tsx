// Ported from agentboard/components.jsx — ConnectionIndicator.
// Shows live/reconnecting/offline state with a colored dot.

import { useConnection } from "../lib/store";
import { en } from "../i18n/en";

export function ConnectionIndicator() {
  const state = useConnection();
  const label =
    state === "connected"    ? en.conn_live :
    state === "reconnecting" ? en.conn_reconnecting :
    en.conn_offline;

  return (
    <span className="conn" data-state={state}>
      <span className="conn-light" />
      <span>{label}</span>
    </span>
  );
}
