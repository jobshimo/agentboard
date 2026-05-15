// Board view placeholder — S10b implements the full Kanban.
import { en } from "../i18n/en";

export function Board() {
  return (
    <div className="empty">
      <div className="empty-inner">
        <p className="muted">{en.placeholder_board}</p>
      </div>
    </div>
  );
}
