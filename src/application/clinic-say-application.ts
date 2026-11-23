import { randomUUID } from 'node:crypto';
import type { Clock, ClinicSayRepository } from './ports.js';
import { notFound, validation } from '../domain/errors.js';
import type {
  Appointment,
  AppointmentContext,
  Clinic,
  InboundMessage,
  Patient,
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

  async receiveInboundMessage(message: InboundMessage): Promise<void> {
    await this.inboundReplyUseCase.process(message);
  }
}
