export const SEVERITY_VALUES = ["info", "correction", "failed_in_practice"] as const;
export type Severity = (typeof SEVERITY_VALUES)[number];

export interface FeedbackPayload {
  target: string;
  text: string;
  severity: Severity;
  workflow_at_capture: string;
  target_task_type: string;
  file_paths: string[];
}

export interface FeedbackEntry {
  id: number;
  task_id: string;
  payload: FeedbackPayload;
  created_at: string;
}

export interface SearchContext {
  task_id?: string;
  workflow_id?: string;
  task_type?: string;
  terms?: string[];
  file_paths?: string[];
  include_same_task?: boolean;
}
