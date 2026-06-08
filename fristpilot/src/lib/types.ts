// Gemeinsame Typen für FristPilot.

export type RiskLevel = "low" | "medium" | "high";

export interface Deadline {
  /** Datum im Format YYYY-MM-DD, falls erkannt. */
  date: string | null;
  /** Was passiert an diesem Datum? */
  description: string;
  /** Was muss der Nutzer tun? */
  required_action: string;
}

export interface DocumentAnalysis {
  document_type: string;
  sender: string;
  summary_simple: string;
  deadlines: Deadline[];
  recommended_actions: string[];
  risk_level: RiskLevel;
  /** 0.0 – 1.0 */
  confidence: number;
  /** Best-effort Transkription des Dokuments. */
  extracted_text?: string;
}

export interface DocumentRow {
  id: string;
  user_id: string;
  file_name: string;
  file_url: string | null;
  file_type: string | null;
  extracted_text: string | null;
  analysis_json: DocumentAnalysis | null;
  created_at: string;
}

export type ReminderStatus = "open" | "done";

export interface ReminderRow {
  id: string;
  user_id: string;
  document_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  status: ReminderStatus;
  created_at: string;
  completed_at: string | null;
}
