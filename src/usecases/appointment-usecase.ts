import type { Clock, ClinicSayRepository } from './ports.js';
import { notFound, validation } from '../domain/errors.js';
import type { Appointment, AppointmentContext } from '../domain/model.js';
import { SchedulerService } from './service/scheduler-service.js';

export class AppointmentUsecase {
  constructor(
    private readonly repository: ClinicSayRepository,
    private readonly clock: Clock,
    private readonly scheduler: SchedulerService,
    private readonly newId: () => string,
  ) {}

  async listAppointmentContexts(filters: {
    clinicId?: string; patientId?: string; status?: string;
  } = {}): Promise<AppointmentContext[]> {
    const validated: { clinicId?: string; patientId?: string; status?: Appointment['status'] } = {};
    if (filters.clinicId) validated.clinicId = filters.clinicId;
    if (filters.patientId) validated.patientId = filters.patientId;
    if (filters.status) {
      if (!['scheduled', 'confirmed', 'cancelled'].includes(filters.status)) {
        validation('status must be scheduled, confirmed, or cancelled');
      }
      validated.status = filters.status as Appointment['status'];
    }
    return this.repository.listAppointmentContexts(validated);
  }

  async createAppointment(input: {
    clinicId: string; patientId: string; startsAt: Date;
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
      if (patient.clinicId !== clinic.id) validation('patient must belong to the clinic');
      const appointment = await transaction.createAppointment({
        id: this.newId(), clinicId: clinic.id, patientId: patient.id,
        startsAt: input.startsAt, status: 'scheduled', version: 1,
        createdAt: now, updatedAt: now,
      });
      await this.scheduler.schedule(
        { appointment, clinic, patient, reminders: [] }, transaction,
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
      if (!await transaction.findAppointmentForUpdate(id)) notFound('appointment not found');
      if (!await transaction.deleteAppointment(id)) notFound('appointment not found');
    });
  }
}
