import type {
  Appointment,
  AppointmentContext,
  AppointmentStatus,
  Clinic,
  InboundMessage,
  OutboundMessage,
  Patient,
  ProviderResult,
  Reminder,
  ReminderStatus,
} from '../domain/model.js';

export interface AppointmentFilters {
  clinicId?: string;
  patientId?: string;
  status?: AppointmentStatus;
}

export interface ReminderFilters {
  clinicId?: string;
  appointmentId?: string;
  status?: ReminderStatus;
}

export interface Clock {
  now(): Date;
}

export interface NewClinic {
  id: string;
  name: string;
  timezone: string;
  createdAt: Date;
}

export interface NewPatient {
  id: string;
  clinicId: string;
  name: string;
  phone: string | null;
  acceptsReminders: boolean;
  createdAt: Date;
}

export interface NewAppointment {
  id: string;
  clinicId: string;
  patientId: string;
  startsAt: Date;
  status: 'scheduled';
  version: 1;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewReminder {
  id: string;
  appointmentId: string;
  appointmentVersion: number;
  scheduledFor: Date;
  status: Reminder['status'];
  attempts: number;
  sentAt: Date | null;
  skipReason: Reminder['skipReason'];
  createdAt: Date;
}

export interface ClaimedReminder {
  reminder: Reminder;
  context: AppointmentContext;
}

export interface DataTransaction {
  claimDueReminderIds(now: Date): Promise<string[]>;
  findClinic(id: string): Promise<Clinic | null>;
  findPatient(id: string): Promise<Patient | null>;
  hasPatientsForClinic(id: string): Promise<boolean>;
  hasAppointmentsForClinic(id: string): Promise<boolean>;
  hasAppointmentsForPatient(id: string): Promise<boolean>;
  findAppointmentForUpdate(id: string): Promise<AppointmentContext | null>;
  findAppointmentContext(id: string): Promise<AppointmentContext | null>;
  findAppointmentContextsByPhone(phone: string): Promise<AppointmentContext[]>;
  createClinic(clinic: NewClinic): Promise<Clinic>;
  updateClinic(clinic: Clinic): Promise<Clinic | null>;
  deleteClinic(id: string): Promise<boolean>;
  createPatient(patient: NewPatient): Promise<Patient>;
  updatePatient(patient: Patient): Promise<Patient | null>;
  deletePatient(id: string): Promise<boolean>;
  createAppointment(appointment: NewAppointment): Promise<Appointment>;
  updateAppointment(appointment: Appointment): Promise<void>;
  createReminder(reminder: NewReminder): Promise<Reminder>;
  updateReminder(reminder: Reminder): Promise<void>;
  cancelOutstandingReminders(appointmentId: string): Promise<void>;
  recordInboundMessageIfNew(
    message: InboundMessage,
    processedAt: Date,
  ): Promise<boolean>;
}

export interface ClinicSayRepository {
  transaction<T>(
    operation: (transaction: DataTransaction) => Promise<T>,
  ): Promise<T>;
  listClinics(): Promise<Clinic[]>;
  getClinic(id: string): Promise<Clinic | null>;
  listPatients(clinicId?: string): Promise<Patient[]>;
  getPatient(id: string): Promise<Patient | null>;
  listAppointmentContexts(
    filters?: AppointmentFilters,
  ): Promise<AppointmentContext[]>;
  listReminderContexts(
    filters?: ReminderFilters,
  ): Promise<Array<{ reminder: Reminder; context: AppointmentContext }>>;
  getAppointmentContext(id: string): Promise<AppointmentContext | null>;
  claimDueReminders(now: Date): Promise<ClaimedReminder[]>;
}

export interface MessageProvider {
  send(message: OutboundMessage): Promise<ProviderResult>;
}
