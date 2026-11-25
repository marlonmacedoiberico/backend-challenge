import type {
  Clock,
  ClaimedReminder,
  ClinicSayRepository,
  MessageProvider,
} from '../ports.js';
import type { Reminder } from '../../domain/model.js';
import { formatAppointmentLocal } from '../../domain/time.js';

export class DeliveryService {
  constructor(
    private readonly repository: ClinicSayRepository,
    private readonly clock: Clock,
    private readonly provider: MessageProvider,
  ) {}

  async deliverClaimed(claim: ClaimedReminder): Promise<void> {
    const { appointment, clinic, patient } = claim.context;
    const reminder = claim.reminder;
    const now = this.clock.now();

    if (
      appointment.status === 'cancelled' ||
      reminder.appointmentVersion !== appointment.version
    ) {
      await this.save({ ...reminder, status: 'cancelled', skipReason: null });
      return;
    }
    if (appointment.startsAt.getTime() <= now.getTime()) {
      await this.save({
        ...reminder,
        status: 'skipped',
        skipReason: 'too_late',
      });
      return;
    }
    if (!patient.phone) {
      await this.save({
        ...reminder,
        status: 'skipped',
        skipReason: 'no_phone',
      });
      return;
    }
    if (!patient.acceptsReminders) {
      await this.save({
        ...reminder,
        status: 'skipped',
        skipReason: 'opted_out',
      });
      return;
    }

    const { date, time } = formatAppointmentLocal(
      appointment.startsAt,
      clinic.timezone,
    );
    const text =
      `Hola ${patient.name}, te recordamos tu cita en ${clinic.name} ` +
      `el ${date} a las ${time}. Responde SI para confirmar o NO para ` +
      'cancelar.';
    let outcome;
    try {
      outcome = await this.provider.send({
        to: patient.phone,
        text,
        idempotencyKey: reminder.id,
      });
    } catch {
      outcome = { kind: 'retryable' as const };
    }

    if (outcome.kind === 'accepted') {
      await this.save({
        ...reminder,
        status: 'sent',
        sentAt: this.clock.now(),
        skipReason: null,
      });
      return;
    }
    if (outcome.kind === 'rejected' || reminder.attempts >= 3) {
      await this.save({ ...reminder, status: 'failed', skipReason: null });
      return;
    }

    const delayMinutes = reminder.attempts === 1 ? 1 : 5;
    await this.save({
      ...reminder,
      status: 'retry',
      scheduledFor: new Date(
        this.clock.now().getTime() + delayMinutes * 60_000,
      ),
      skipReason: null,
    });
  }

  private async save(reminder: Reminder): Promise<void> {
    await this.repository.transaction(async (transaction) =>
      transaction.updateReminder(reminder),
    );
  }
}
