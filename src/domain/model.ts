export type AppointmentStatus = 'scheduled' | 'confirmed' | 'cancelled';
export type ReminderStatus = 'pending' | 'sending' | 'retry' | 'sent' | 'failed' | 'skipped' | 'cancelled';
export type SkipReason = 'too_late' | 'no_phone' | 'opted_out';

export interface Clinic {
  id: string;
  name: string;
  timezone: string;
  createdAt: Date;
}

export interface Patient {
  id: string;
  clinicId: string;
  name: string;
  phone: string | null;
  acceptsReminders: boolean;
  createdAt: Date;
}

export interface Appointment {
  id: string;
  clinicId: string;
  patientId: string;
  startsAt: Date;
  status: AppointmentStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Reminder {
  id: string;
  appointmentId: string;
  appointmentVersion: number;
  scheduledFor: Date;
  status: ReminderStatus;
  attempts: number;
  sentAt: Date | null;
  skipReason: SkipReason | null;
  createdAt: Date;
}

export interface AppointmentContext {
  appointment: Appointment;
  clinic: Clinic;
  patient: Patient;
  reminders: Reminder[];
}

export interface InboundMessage {
  messageId: string;
  from: string;
  text: string;
  receivedAt: Date;
}

export interface OutboundMessage {
  to: string;
  text: string;
  idempotencyKey: string;
}

export type ProviderResult =
  | { kind: 'accepted' }
  | { kind: 'rejected' }
  | { kind: 'retryable' };

export function isOpenReminder(status: ReminderStatus): boolean {
  return status === 'pending' || status === 'retry' || status === 'sending';
}
