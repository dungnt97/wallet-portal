// Notification domain types — shared between admin-api and UI consumers

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface NotificationEventPrefs {
  withdrawal: boolean;
  sweep: boolean;
  deposit: boolean;
  killSwitch: boolean;
  reorg: boolean;
  health: boolean;
  coldTimelock: boolean;
}

export interface NotificationPrefs {
  inApp: boolean;
  email: boolean;
  slack: boolean;
  /** SMS via Twilio — dry-run when TWILIO_* env vars absent */
  sms: boolean;
  eventTypes: NotificationEventPrefs;
}

/** Wire payload emitted via Socket.io `notif.created` and returned by REST GET /notifications */
export interface NotificationPayload {
  id: string;
  staffId: string;
  eventType: string;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  payload: Record<string, unknown> | null;
  dedupeKey: string | null;
  readAt: string | null;
  createdAt: string;
}
