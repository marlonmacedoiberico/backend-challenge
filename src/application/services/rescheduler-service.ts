import type { Clock, ClinicSayRepository } from '../ports.js';
import { conflict, notFound, validation } from '../../domain/errors.js';
import type { AppointmentContext } from '../../domain/model.js';
import { SchedulerService } from './scheduler-service.js';

export class ReschedulerService {
  constructor(
    private readonly repository: ClinicSayRepository,
    private readonly clock: Clock,
    private readonly scheduler: SchedulerService,
  ) {}

  async reschedule(appointmentId: string, startsAt: Date): Promise<AppointmentContext> {
    const now = this.clock.now();
    if (startsAt.getTime() <= now.getTime()) validation('startsAt must be in the future');

    return this.repository.transaction(async (transaction) => {
      const context = await transaction.findAppointmentForUpdate(appointmentId);
      if (!context) notFound('appointment not found');
      if (context.appointment.status === 'cancelled' || context.appointment.startsAt.getTime() <= now.getTime()) {
        conflict('appointment is cancelled or has already started');
      }

      const appointment = {
        ...context.appointment,
        startsAt,
        status: context.appointment.status === 'confirmed' ? 'scheduled' as const : context.appointment.status,
        version: context.appointment.version + 1,
        updatedAt: now,
      };
      await transaction.updateAppointment(appointment);
      await transaction.cancelOutstandingReminders(appointmentId);
      const nextContext: AppointmentContext = { ...context, appointment, reminders: [] };
      await this.scheduler.schedule(nextContext, transaction);
      const result = await transaction.findAppointmentContext(appointmentId);
      if (!result) notFound('appointment not found');
      return result;
    });
  }
}
