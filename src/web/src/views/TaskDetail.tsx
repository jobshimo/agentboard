// TaskDetail placeholder — S10c implements the full detail view.
import { en } from "../i18n/en";

interface TaskDetailProps {
  taskId: string;
  onBack: () => void;
}

export function TaskDetail({ taskId, onBack }: TaskDetailProps) {
  return (
    <div className="ab-detail">
      <div className="ab-detail-head">
        <button className="ab-back" onClick={onBack}>{en.back}</button>
        <span className="muted mono" style={{ fontSize: 12 }}>{taskId}</span>
      </div>
      <div className="empty">
        <div className="empty-inner">
          <p className="muted">{en.placeholder_detail}</p>
        </div>
      </div>
    </div>
  );
}
