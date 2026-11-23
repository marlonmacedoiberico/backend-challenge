import type { Appointment, AppointmentContext, Clinic, InboundMessage, Patient, Reminder } from '../../src/domain/model.js';
import type {
  ClaimedReminder,
  ClinicSayRepository,
  DataTransaction,
  NewAppointment,
  NewClinic,
  NewPatient,
  NewReminder,
} from '../../src/application/ports.js';

export class FakeClinicSayRepository implements ClinicSayRepository {
  readonly clinics = new Map<string, Clinic>();
  readonly patients = new Map<string, Patient>();
  readonly appointments = new Map<string, Appointment>();
  readonly reminders = new Map<string, Reminder>();
  readonly inbound = new Map<string, InboundMessage>();

  async transaction<T>(operation: (transaction: DataTransaction) => Promise<T>): Promise<T> {
    return operation(this.transactionView());
  }

  async getAppointmentContext(id: string): Promise<AppointmentContext | null> {
    return this.context(id);
  }

  async claimDueReminders(now: Date): Promise<ClaimedReminder[]> {
    const due = [...this.reminders.values()]
      .filter((reminder) => ['pending', 'retry'].includes(reminder.status) && reminder.scheduledFor <= now)
      .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
    return due.flatMap((reminder) => {
      const claimed = { ...reminder, status: 'sending' as const, attempts: reminder.attempts + 1 };
      this.reminders.set(reminder.id, claimed);
      const context = this.context(reminder.appointmentId);
      return context ? [{ reminder: claimed, context }] : [];
    });
  }

  context(appointmentId: string): AppointmentContext | null {
    const appointment = this.appointments.get(appointmentId);
    if (!appointment) return null;
    const clinic = this.clinics.get(appointment.clinicId);
    const patient = this.patients.get(appointment.patientId);
    if (!clinic || !patient) return null;
    const reminders = [...this.reminders.values()].filter((reminder) => reminder.appointmentId === appointmentId);
    return { appointment, clinic, patient, reminders };
  }

  private transactionView(): DataTransaction {
    return {
      claimDueReminderIds: async () => [],
      findClinic: async (id) => this.clinics.get(id) ?? null,
      findPatient: async (id) => this.patients.get(id) ?? null,
      findAppointmentForUpdate: async (id) => this.context(id),
      findAppointmentContext: async (id) => this.context(id),
      findAppointmentContextsByPhone: async (phone) => [...this.appointments.values()]
        .filter((appointment) => this.patients.get(appointment.patientId)?.phone === phone)
        .map((appointment) => this.context(appointment.id))
        .filter((context): context is AppointmentContext => context !== null),
      createClinic: async (input: NewClinic) => {
        const clinic = { ...input };
        this.clinics.set(clinic.id, clinic);
        return clinic;
      },
      createPatient: async (input: NewPatient) => {
        const patient = { ...input };
        this.patients.set(patient.id, patient);
        return patient;
      },
      createAppointment: async (input: NewAppointment) => {
        const appointment: Appointment = { ...input };
        this.appointments.set(appointment.id, appointment);
        return appointment;
      },
      updateAppointment: async (appointment) => { this.appointments.set(appointment.id, appointment); },
      createReminder: async (input: NewReminder) => {
        const reminder: Reminder = { ...input };
        this.reminders.set(reminder.id, reminder);
        return reminder;
      },
      updateReminder: async (reminder) => { this.reminders.set(reminder.id, reminder); },
      cancelOutstandingReminders: async (appointmentId) => {
        for (const reminder of this.reminders.values()) {
          if (reminder.appointmentId === appointmentId && ['pending', 'retry', 'sending'].includes(reminder.status)) {
            this.reminders.set(reminder.id, { ...reminder, status: 'cancelled', skipReason: null });
          }
        }
      },
      recordInboundMessageIfNew: async (message) => {
        if (this.inbound.has(message.messageId)) return false;
        this.inbound.set(message.messageId, message);
        return true;
      },
    };
  }
}

export class FixedClock {
  constructor(private current: Date) {}
  now(): Date { return new Date(this.current); }
  set(value: Date): void { this.current = new Date(value); }
}

export function fixture(options: {
  now?: string;
  startsAt?: string;
  timezone?: string;
  phone?: string | null;
  acceptsReminders?: boolean;
  status?: Appointment['status'];
  version?: number;
} = {}) {
  const now = new Date(options.now ?? '2027-03-01T08:00:00.000Z');
  const clock = new FixedClock(now);
  const repository = new FakeClinicSayRepository();
  const clinic: Clinic = { id: 'clinic-1', name: 'Clínica Sonrisa', timezone: options.timezone ?? 'Europe/Madrid', createdAt: now };
  const patient: Patient = {
    id: 'patient-1', clinicId: clinic.id, name: 'Ana', phone: options.phone === undefined ? '+34600111222' : options.phone,
    acceptsReminders: options.acceptsReminders ?? true, createdAt: now,
  };
  const appointment: Appointment = {
    id: 'appointment-1', clinicId: clinic.id, patientId: patient.id,
    startsAt: new Date(options.startsAt ?? '2027-03-28T08:00:00.000Z'),
    status: options.status ?? 'scheduled', version: options.version ?? 1, createdAt: now, updatedAt: now,
  };
  repository.clinics.set(clinic.id, clinic);
  repository.patients.set(patient.id, patient);
  repository.appointments.set(appointment.id, appointment);
  return { repository, clock, clinic, patient, appointment };
}

export function reminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'reminder-1', appointmentId: 'appointment-1', appointmentVersion: 1,
    scheduledFor: new Date('2027-03-01T07:00:00.000Z'), status: 'pending', attempts: 0,
    sentAt: null, skipReason: null, createdAt: new Date('2027-02-27T08:00:00.000Z'), ...overrides,
  };
}
