import type { Clock, ClinicSayRepository } from './ports.js';
import type {
  AppointmentContext,
  InboundMessage,
  Reminder,
} from '../domain/model.js';

function normalizeReply(text: string): 'SI' | 'NO' | null {
  const normalized = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toUpperCase();
  const token = normalized.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  return token === 'SI' || token === 'NO' ? token : null;
}

function compareLatestReminder(left: Reminder, right: Reminder): number {
  const sentDifference =
    (right.sentAt?.getTime() ?? -Infinity) -
    (left.sentAt?.getTime() ?? -Infinity);
  if (sentDifference) return sentDifference;
  const createdDifference =
    right.createdAt.getTime() - left.createdAt.getTime();
  if (createdDifference) return createdDifference;
  return right.id < left.id ? -1 : right.id > left.id ? 1 : 0;
}

function latestSentReminder(context: AppointmentContext): Reminder | null {
  return context.reminders
    .filter(
      (reminder) => reminder.status === 'sent' && reminder.sentAt !== null,
    )
    .sort(compareLatestReminder)[0] ?? null;
}

export class InboundReplyUsecase {
  constructor(
    private readonly repository: ClinicSayRepository,
    private readonly clock: Clock,
  ) {}

  async process(message: InboundMessage): Promise<void> {
    const now = this.clock.now();
    await this.repository.transaction(async (transaction) => {
      const firstDelivery = await transaction.recordInboundMessageIfNew(
        message,
        now,
      );
      if (!firstDelivery) return;

      const reply = normalizeReply(message.text);
      if (!reply) return;

      const eligible = (
        await transaction.findAppointmentContextsByPhone(message.from)
      )
        .filter(
          ({ appointment }) =>
            appointment.status !== 'cancelled' &&
            appointment.startsAt.getTime() > now.getTime(),
        )
        .map((context) => ({ context, reminder: latestSentReminder(context) }))
        .filter(
          (
            candidate,
          ): candidate is {
            context: AppointmentContext;
            reminder: Reminder;
          } => candidate.reminder !== null,
        )
        .sort((left, right) =>
          compareLatestReminder(left.reminder, right.reminder),
        );
      const selected = eligible[0]?.context;
      if (!selected) return;

      if (reply === 'SI') {
        if (selected.appointment.status !== 'confirmed') {
          await transaction.updateAppointment({
            ...selected.appointment,
            status: 'confirmed',
            updatedAt: now,
          });
        }
        return;
      }

      if (selected.appointment.status !== 'cancelled') {
        await transaction.updateAppointment({
          ...selected.appointment,
          status: 'cancelled',
          updatedAt: now,
        });
        await transaction.cancelOutstandingReminders(selected.appointment.id);
      }
    });
  }
}
