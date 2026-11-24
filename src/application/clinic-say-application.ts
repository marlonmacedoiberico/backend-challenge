import { randomUUID } from 'node:crypto';
import type {
  AppointmentFilters,
  Clock,
  ClinicSayRepository,
  ReminderFilters,
} from './ports.js';
import { conflict, notFound, validation } from '../domain/errors.js';
import type {
  Appointment,
  AppointmentContext,
  AppointmentStatus,
  Clinic,
  InboundMessage,
  Patient,
  Reminder,
  ReminderStatus,
} from '../domain/model.js';
import { assertTimeZone } from '../domain/time.js';
import { CancellationService } from './services/cancellation-service.js';
import { InboundReplyUseCase } from './services/inbound-reply-use-case.js';
import { ReschedulerService } from './services/rescheduler-service.js';
import { SchedulerService } from './services/scheduler-service.js';

const e164 = /^\+[1-9]\d{7,14}$/;

export class ClinicSayApplication {
  readonly cancellationService: CancellationService;
  readonly inboundReplyUseCase: InboundReplyUseCase;
  readonly reschedulerService: ReschedulerService;

  constructor(
    private readonly repository: ClinicSayRepository,
    private readonly clock: Clock,
    readonly schedulerService: SchedulerService,
    newId: () => string = randomUUID,
  ) {
    this.cancellationService = new CancellationService(repository, clock);
    this.inboundReplyUseCase = new InboundReplyUseCase(repository, clock);
    this.reschedulerService = new ReschedulerService(
      repository,
      clock,
      schedulerService,
    );
    this.newId = newId;
  }

  private readonly newId: () => string;

  async createClinic(name: string, timezone: string): Promise<Clinic> {
    if (!name.trim()) validation('name must not be empty');
    try {
      assertTimeZone(timezone);
    } catch {
      validation('timezone must be a valid IANA time zone');
    }
    const now = this.clock.now();
    return this.repository.transaction((transaction) =>
      transaction.createClinic({
        id: this.newId(),
        name: name.trim(),
        timezone,
        createdAt: now,
      }),
    );
  }

  async listClinics(): Promise<Clinic[]> {
    return this.repository.listClinics();
  }

  async getClinic(id: string): Promise<Clinic> {
    const clinic = await this.repository.getClinic(id);
    if (!clinic) notFound('clinic not found');
    return clinic;
  }

  async updateClinic(
    id: string,
    input: { name?: string; timezone?: string },
  ): Promise<Clinic> {
    const current = await this.getClinic(id);
    const name = input.name === undefined ? current.name : input.name.trim();
    const timezone = input.timezone ?? current.timezone;
    if (!name) validation('name must not be empty');
    try {
      assertTimeZone(timezone);
    } catch {
      validation('timezone must be a valid IANA time zone');
    }
    if (
      timezone !== current.timezone &&
      await this.repository.transaction((transaction) =>
        transaction.hasAppointmentsForClinic(id),
      )
    ) {
      conflict('clinic timezone cannot change while appointments exist');
    }
    const updated = await this.repository.transaction((transaction) =>
      transaction.updateClinic({ ...current, name, timezone }),
    );
    if (!updated) notFound('clinic not found');
    return updated;
  }

  async deleteClinic(id: string): Promise<void> {
    await this.getClinic(id);
    await this.repository.transaction(async (transaction) => {
      if (
        await transaction.hasPatientsForClinic(id) ||
        await transaction.hasAppointmentsForClinic(id)
      ) {
        conflict('clinic cannot be deleted while patients or appointments exist');
      }
      if (!await transaction.deleteClinic(id)) notFound('clinic not found');
    });
  }

  async createPatient(input: {
    clinicId: string;
    name: string;
    phone: string | null;
    acceptsReminders: boolean;
  }): Promise<Patient> {
    if (!input.name.trim()) validation('name must not be empty');
    if (input.phone !== null && !e164.test(input.phone)) {
      validation('phone must be an E.164 number or null');
    }
    const now = this.clock.now();
    return this.repository.transaction(async (transaction) => {
      if (!await transaction.findClinic(input.clinicId)) {
        notFound('clinic not found');
      }
      return transaction.createPatient({
        id: this.newId(),
        clinicId: input.clinicId,
        name: input.name.trim(),
        phone: input.phone,
        acceptsReminders: input.acceptsReminders,
        createdAt: now,
      });
    });
  }

  async listPatients(clinicId?: string): Promise<Patient[]> {
    if (clinicId) await this.getClinic(clinicId);
    return this.repository.listPatients(clinicId);
  }

  async getPatient(id: string): Promise<Patient> {
    const patient = await this.repository.getPatient(id);
    if (!patient) notFound('patient not found');
    return patient;
  }

  async updatePatient(
    id: string,
    input: {
      name?: string;
      phone?: string | null;
      acceptsReminders?: boolean;
    },
  ): Promise<Patient> {
    const current = await this.getPatient(id);
    const name = input.name === undefined ? current.name : input.name.trim();
    const phone = input.phone === undefined ? current.phone : input.phone;
    const acceptsReminders =
      input.acceptsReminders ?? current.acceptsReminders;
    if (!name) validation('name must not be empty');
    if (phone !== null && !e164.test(phone)) {
      validation('phone must be an E.164 number or null');
    }
    const updated = await this.repository.transaction((transaction) =>
      transaction.updatePatient({
        ...current,
        name,
        phone,
        acceptsReminders,
      }),
    );
    if (!updated) notFound('patient not found');
    return updated;
  }

  async deletePatient(id: string): Promise<void> {
    await this.getPatient(id);
    await this.repository.transaction(async (transaction) => {
      if (await transaction.hasAppointmentsForPatient(id)) {
        conflict('patient cannot be deleted while appointments exist');
      }
      if (!await transaction.deletePatient(id)) notFound('patient not found');
    });
  }

  async listAppointmentContexts(filters: {
    clinicId?: string;
    patientId?: string;
    status?: string;
  } = {}): Promise<AppointmentContext[]> {
    const validated: AppointmentFilters = {};
    if (filters.clinicId) validated.clinicId = filters.clinicId;
    if (filters.patientId) validated.patientId = filters.patientId;
    if (filters.status) {
      if (!['scheduled', 'confirmed', 'cancelled'].includes(filters.status)) {
        validation('status must be scheduled, confirmed, or cancelled');
      }
      validated.status = filters.status as AppointmentStatus;
    }
    return this.repository.listAppointmentContexts(validated);
  }

  async listReminderContexts(filters: {
    clinicId?: string;
    appointmentId?: string;
    status?: string;
  } = {}): Promise<Array<{ reminder: Reminder; context: AppointmentContext }>> {
    const validated: ReminderFilters = {};
    if (filters.clinicId) validated.clinicId = filters.clinicId;
    if (filters.appointmentId) {
      validated.appointmentId = filters.appointmentId;
    }
    if (filters.status) {
      const statuses: ReminderStatus[] = [
        'pending',
        'sending',
        'retry',
        'sent',
        'failed',
        'skipped',
        'cancelled',
      ];
      if (!statuses.includes(filters.status as ReminderStatus)) {
        validation('invalid reminder status');
      }
      validated.status = filters.status as ReminderStatus;
    }
    return this.repository.listReminderContexts(validated);
  }

  async createAppointment(input: {
    clinicId: string;
    patientId: string;
    startsAt: Date;
  }): Promise<AppointmentContext> {
    const now = this.clock.now();
    if (input.startsAt.getTime() <= now.getTime()) {
      validation('startsAt must be in the future');
    }
    return this.repository.transaction(async (transaction) => {
      const clinic = await transaction.findClinic(input.clinicId);
      if (!clinic) notFound('clinic not found');
      const patient = await transaction.findPatient(input.patientId);
      if (!patient) notFound('patient not found');
      if (patient.clinicId !== clinic.id) {
        validation('patient must belong to the clinic');
      }
      const appointment: Appointment = await transaction.createAppointment({
        id: this.newId(),
        clinicId: clinic.id,
        patientId: patient.id,
        startsAt: input.startsAt,
        status: 'scheduled',
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      await this.schedulerService.schedule(
        { appointment, clinic, patient, reminders: [] },
        transaction,
      );
      const context = await transaction.findAppointmentContext(appointment.id);
      if (!context) notFound('appointment not found');
      return context;
    });
  }

  async getAppointment(id: string): Promise<AppointmentContext> {
    const context = await this.repository.getAppointmentContext(id);
    if (!context) notFound('appointment not found');
    return context;
  }

  async deleteAppointment(id: string): Promise<void> {
    await this.repository.transaction(async (transaction) => {
      if (!await transaction.findAppointmentForUpdate(id)) {
        notFound('appointment not found');
      }
      if (!await transaction.deleteAppointment(id)) {
        notFound('appointment not found');
      }
    });
  }

  async clearReminders(): Promise<void> {
    await this.repository.transaction((transaction) =>
      transaction.deleteAllReminders(),
    );
  }

  async receiveInboundMessage(message: InboundMessage): Promise<void> {
    await this.inboundReplyUseCase.process(message);
  }
}
