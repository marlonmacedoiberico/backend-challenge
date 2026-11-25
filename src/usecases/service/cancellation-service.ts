import type { Clock, ClinicSayRepository } from '../ports.js';
import { notFound } from '../../domain/errors.js';
import type { AppointmentContext } from '../../domain/model.js';

export class CancellationService {
  constructor(
    private readonly repository: ClinicSayRepository,
    private readonly clock: Clock,
  ) {}

  async cancel(appointmentId: string): Promise<AppointmentContext> {
    return this.repository.transaction(async (transaction) => {
      const context = await transaction.findAppointmentForUpdate(appointmentId);
      if (!context) notFound('appointment not found');
      if (context.appointment.status !== 'cancelled') {
        await transaction.updateAppointment({
          ...context.appointment,
          status: 'cancelled',
          updatedAt: this.clock.now(),
        });
        await transaction.cancelOutstandingReminders(appointmentId);
      }
      const result = await transaction.findAppointmentContext(appointmentId);
      if (!result) notFound('appointment not found');
      return result;
    });
  }
}
