import type { ClinicSayRepository, ReminderFilters } from './ports.js';
import { validation } from '../domain/errors.js';
import type { AppointmentContext, Reminder, ReminderStatus } from '../domain/model.js';

export class ReminderUsecase {
  constructor(private readonly repository: ClinicSayRepository) {}

  async listReminderContexts(filters: {
    clinicId?: string; appointmentId?: string; status?: string;
  } = {}): Promise<Array<{ reminder: Reminder; context: AppointmentContext }>> {
    const validated: ReminderFilters = {};
    if (filters.clinicId) validated.clinicId = filters.clinicId;
    if (filters.appointmentId) validated.appointmentId = filters.appointmentId;
    if (filters.status) {
      const statuses: ReminderStatus[] = [
        'pending', 'sending', 'retry', 'sent', 'failed', 'skipped', 'cancelled',
      ];
      if (!statuses.includes(filters.status as ReminderStatus)) {
        validation('invalid reminder status');
      }
      validated.status = filters.status as ReminderStatus;
    }
    return this.repository.listReminderContexts(validated);
  }

  async clearReminders(): Promise<void> {
    await this.repository.transaction((transaction) => transaction.deleteAllReminders());
  }
}
