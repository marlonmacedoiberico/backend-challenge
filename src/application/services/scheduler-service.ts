import { randomUUID } from 'node:crypto';
import type {
  Clock,
  ClaimedReminder,
  ClinicSayRepository,
  DataTransaction,
} from '../ports.js';
import type {
  AppointmentContext,
  Reminder,
} from '../../domain/model.js';
import {
  applyInitialQuietHours,
  reminderTimeBefore,
} from '../../domain/time.js';
import { DeliveryService } from './delivery-service.js';

export class SchedulerService {
  constructor(
    private readonly repository: ClinicSayRepository,
    private readonly clock: Clock,
    private readonly delivery: DeliveryService,
    private readonly newId: () => string = randomUUID,
  ) {}

  async schedule(
    context: AppointmentContext,
    transaction: DataTransaction,
  ): Promise<Reminder> {
    const now = this.clock.now();
    const normalTime = reminderTimeBefore(
      context.appointment.startsAt,
      context.clinic.timezone,
    );
    const initialTime =
      normalTime.getTime() <= now.getTime() ? now : normalTime;
    const scheduledFor = applyInitialQuietHours(
      initialTime,
      context.clinic.timezone,
    );
    const isTooLate =
      scheduledFor.getTime() >= context.appointment.startsAt.getTime();

    return transaction.createReminder({
      id: this.newId(),
      appointmentId: context.appointment.id,
      appointmentVersion: context.appointment.version,
      scheduledFor,
      status: isTooLate ? 'skipped' : 'pending',
      attempts: 0,
      sentAt: null,
      skipReason: isTooLate ? 'too_late' : null,
      createdAt: now,
    });
  }

  async runDueReminders(): Promise<number> {
    const claimed = await this.repository.claimDueReminders(this.clock.now());
    for (const claim of claimed) await this.delivery.deliverClaimed(claim);
    return claimed.length;
  }

  async runClaimed(claim: ClaimedReminder): Promise<void> {
    await this.delivery.deliverClaimed(claim);
  }
}
