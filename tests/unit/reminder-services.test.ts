import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationError } from '../../src/domain/errors.js';
import { DeliveryService } from '../../src/application/services/delivery-service.js';
import { SchedulerService } from '../../src/application/services/scheduler-service.js';
import { ReschedulerService } from '../../src/application/services/rescheduler-service.js';
import { CancellationService } from '../../src/application/services/cancellation-service.js';
import type { MessageProvider } from '../../src/application/ports.js';
import type { OutboundMessage, ProviderResult } from '../../src/domain/model.js';
import { fixture, reminder } from '../helpers/fake-clinic-say.js';

class FakeProvider implements MessageProvider {
  readonly messages: OutboundMessage[] = [];
  outcomes: Array<ProviderResult | Error> = [{ kind: 'accepted' }];

  async send(message: OutboundMessage): Promise<ProviderResult> {
    this.messages.push(message);
    const outcome = this.outcomes.shift() ?? { kind: 'accepted' as const };
    if (outcome instanceof Error) throw outcome;
    return outcome;
  }
}

function services(options: Parameters<typeof fixture>[0] = {}) {
  const context = fixture(options);
  const provider = new FakeProvider();
  const delivery = new DeliveryService(context.repository, context.clock, provider);
  const scheduler = new SchedulerService(context.repository, context.clock, delivery, () => `reminder-${context.repository.reminders.size + 1}`);
  return { ...context, provider, delivery, scheduler };
}

test('SchedulerService schedules the reminder at the same clinic-local time across a DST change', async () => {
  const { scheduler, appointment, clinic, repository } = services({
    now: '2027-03-26T08:00:00.000Z', startsAt: '2027-03-28T08:00:00.000Z', timezone: 'Europe/Madrid',
  });
  const context = { appointment, clinic, patient: fixture().patient, reminders: [] };
  const scheduled = await repository.transaction((tx) => scheduler.schedule(context, tx));
  assert.equal(scheduled.scheduledFor.toISOString(), '2027-03-27T09:00:00.000Z');
});

test('SchedulerService defers an initial send during clinic quiet hours', async () => {
  const { scheduler, appointment, clinic, patient, repository } = services({
    now: '2027-04-01T08:00:00.000Z', startsAt: '2027-04-03T00:00:00.000Z', timezone: 'Europe/Madrid',
  });
  const scheduled = await repository.transaction((tx) => scheduler.schedule({ appointment, clinic, patient, reminders: [] }, tx));
  assert.equal(scheduled.scheduledFor.toISOString(), '2027-04-02T07:00:00.000Z');
});

test('SchedulerService uses the current backend time when the normal reminder time has passed', async () => {
  const { scheduler, appointment, clinic, patient, repository } = services({
    now: '2027-03-28T21:00:00.000Z', startsAt: '2027-03-29T10:00:00.000Z', timezone: 'Europe/Madrid',
  });
  const scheduled = await repository.transaction((tx) => scheduler.schedule({ appointment, clinic, patient, reminders: [] }, tx));
  assert.equal(scheduled.scheduledFor.toISOString(), '2027-03-29T07:00:00.000Z');
});

test('SchedulerService skips a reminder when quiet-hour deferral reaches appointment start', async () => {
  const { scheduler, appointment, clinic, patient, repository } = services({
    now: '2027-03-27T21:30:00.000Z', startsAt: '2027-03-28T07:00:00.000Z', timezone: 'Europe/Madrid',
  });
  const scheduled = await repository.transaction((tx) => scheduler.schedule({ appointment, clinic, patient, reminders: [] }, tx));
  assert.equal(scheduled.status, 'skipped');
  assert.equal(scheduled.skipReason, 'too_late');
});

test('SchedulerService claims a due reminder once when runs overlap', async () => {
  const { scheduler, provider, repository, appointment } = services();
  repository.reminders.set('reminder-1', reminder());
  const processed = await Promise.all([scheduler.runDueReminders(), scheduler.runDueReminders()]);
  assert.deepEqual(processed.sort(), [0, 1]);
  assert.equal(provider.messages.length, 1);
  assert.equal(repository.reminders.get('reminder-1')?.status, 'sent');
  assert.ok(appointment);
});

test('DeliveryService records provider acceptance as sent, including a duplicate 200 response', async () => {
  for (const status of ['202 accepted', '200 already accepted']) {
    const { delivery, provider, repository } = services();
    provider.outcomes = [{ kind: 'accepted' }];
    repository.reminders.set('reminder-1', reminder());
    const [claim] = await repository.claimDueReminders(new Date('2027-03-01T08:00:00.000Z'));
    await delivery.deliverClaimed(claim!);
    assert.equal(repository.reminders.get('reminder-1')?.status, 'sent', status);
  }
});

test('DeliveryService sends the exact message using the clinic-local appointment time', async () => {
  const { delivery, provider, repository } = services({ startsAt: '2027-03-28T08:00:00.000Z' });
  repository.reminders.set('reminder-1', reminder());
  const [claim] = await repository.claimDueReminders(new Date('2027-03-01T08:00:00.000Z'));
  await delivery.deliverClaimed(claim!);
  assert.equal(provider.messages[0]?.text,
    'Hola Ana, te recordamos tu cita en Clínica Sonrisa el 28/03/2027 a las 10:00. Responde SI para confirmar o NO para cancelar.');
});

test('DeliveryService schedules the second attempt one minute and the third five minutes after failures', async () => {
  const { clock, delivery, provider, repository } = services();
  repository.reminders.set('reminder-1', reminder());
  provider.outcomes = [{ kind: 'retryable' }, { kind: 'retryable' }];

  const [first] = await repository.claimDueReminders(clock.now());
  await delivery.deliverClaimed(first!);
  assert.equal(repository.reminders.get('reminder-1')?.scheduledFor.toISOString(), '2027-03-01T08:01:00.000Z');

  clock.set(new Date('2027-03-01T08:01:00.000Z'));
  const [second] = await repository.claimDueReminders(clock.now());
  await delivery.deliverClaimed(second!);
  assert.equal(repository.reminders.get('reminder-1')?.scheduledFor.toISOString(), '2027-03-01T08:06:00.000Z');
  assert.equal(provider.messages[0]?.idempotencyKey, provider.messages[1]?.idempotencyKey);
});

test('DeliveryService retries an uncertain provider outcome using the same idempotency key', async () => {
  const { clock, delivery, provider, repository } = services();
  repository.reminders.set('reminder-1', reminder());
  provider.outcomes = [new Error('network timeout')];
  const [claim] = await repository.claimDueReminders(clock.now());
  await delivery.deliverClaimed(claim!);
  assert.equal(repository.reminders.get('reminder-1')?.status, 'retry');
  assert.equal(repository.reminders.get('reminder-1')?.scheduledFor.toISOString(), '2027-03-01T08:01:00.000Z');
  assert.equal(provider.messages[0]?.idempotencyKey, 'reminder-1');
});

test('DeliveryService does not retry a permanent 422 rejection', async () => {
  const { clock, delivery, provider, repository } = services();
  repository.reminders.set('reminder-1', reminder());
  provider.outcomes = [{ kind: 'rejected' }];
  const [claim] = await repository.claimDueReminders(clock.now());
  await delivery.deliverClaimed(claim!);
  assert.equal(repository.reminders.get('reminder-1')?.status, 'failed');
  assert.equal(provider.messages.length, 1);
});

test('DeliveryService fails after the third unsuccessful attempt', async () => {
  const { clock, delivery, provider, repository } = services();
  repository.reminders.set('reminder-1', reminder({ attempts: 2, status: 'retry', scheduledFor: clock.now() }));
  provider.outcomes = [{ kind: 'retryable' }];
  const [claim] = await repository.claimDueReminders(clock.now());
  await delivery.deliverClaimed(claim!);
  assert.equal(repository.reminders.get('reminder-1')?.status, 'failed');
});

test('DeliveryService attempts retries during quiet hours without deferring them', async () => {
  const { clock, delivery, provider, repository } = services({ now: '2027-03-01T23:30:00.000Z' });
  repository.reminders.set('reminder-1', reminder({ attempts: 1, status: 'retry', scheduledFor: clock.now() }));
  const [claim] = await repository.claimDueReminders(clock.now());
  await delivery.deliverClaimed(claim!);
  assert.equal(provider.messages.length, 1);
  assert.equal(repository.reminders.get('reminder-1')?.status, 'sent');
});

test('DeliveryService skips patients without a phone or who opted out without calling the provider', async (t) => {
  for (const [phone, acceptsReminders, reason] of [[null, true, 'no_phone'], ['+34600111222', false, 'opted_out']] as const) {
    await t.test(reason, async () => {
      const { clock, delivery, provider, repository } = services({ phone, acceptsReminders });
      repository.reminders.set('reminder-1', reminder());
      const [claim] = await repository.claimDueReminders(clock.now());
      await delivery.deliverClaimed(claim!);
      assert.equal(provider.messages.length, 0);
      assert.equal(repository.reminders.get('reminder-1')?.status, 'skipped');
      assert.equal(repository.reminders.get('reminder-1')?.skipReason, reason);
    });
  }
});

test('DeliveryService skips a retry when the appointment has already started', async () => {
  const { clock, delivery, provider, repository } = services({ startsAt: '2027-03-01T07:59:00.000Z' });
  repository.reminders.set('reminder-1', reminder({ attempts: 1, status: 'retry', scheduledFor: clock.now() }));
  const [claim] = await repository.claimDueReminders(clock.now());
  await delivery.deliverClaimed(claim!);
  assert.equal(repository.reminders.get('reminder-1')?.status, 'skipped');
  assert.equal(repository.reminders.get('reminder-1')?.skipReason, 'too_late');
  assert.equal(provider.messages.length, 0);
});

test('ReschedulerService replaces outstanding reminders and increments appointment version', async () => {
  const { clock, repository, scheduler } = services();
  repository.reminders.set('pending', reminder({ id: 'pending' }));
  repository.reminders.set('sent', reminder({ id: 'sent', status: 'sent', attempts: 1, sentAt: new Date('2027-02-28T08:00:00.000Z') }));
  const service = new ReschedulerService(repository, clock, scheduler);
  const updated = await service.reschedule('appointment-1', new Date('2027-03-30T12:00:00.000Z'));
  assert.equal(updated.appointment.version, 2);
  assert.equal(updated.appointment.status, 'scheduled');
  assert.equal(repository.reminders.get('pending')?.status, 'cancelled');
  assert.equal(repository.reminders.get('sent')?.status, 'sent');
  assert.ok(updated.reminders.some((item) => item.appointmentVersion === 2));
});

test('ReschedulerService resets a confirmed appointment to scheduled', async () => {
  const { clock, repository, scheduler } = services({ status: 'confirmed' });
  const service = new ReschedulerService(repository, clock, scheduler);
  const updated = await service.reschedule('appointment-1', new Date('2027-03-30T12:00:00.000Z'));
  assert.equal(updated.appointment.status, 'scheduled');
});

test('ReschedulerService rejects cancelled, started, and nonfuture appointments without mutation', async (t) => {
  const cases = [
    { title: 'cancelled', options: { status: 'cancelled' as const }, requested: '2027-03-30T12:00:00.000Z', code: 'conflict' },
    { title: 'already started', options: { startsAt: '2027-03-01T07:00:00.000Z' }, requested: '2027-03-30T12:00:00.000Z', code: 'conflict' },
    { title: 'nonfuture request', options: {}, requested: '2027-03-01T08:00:00.000Z', code: 'validation' },
  ];
  for (const item of cases) {
    await t.test(item.title, async () => {
      const { clock, repository, scheduler, appointment } = services(item.options);
      const original = { ...appointment };
      repository.reminders.set('pending', reminder({ id: 'pending' }));
      const service = new ReschedulerService(repository, clock, scheduler);
      await assert.rejects(service.reschedule('appointment-1', new Date(item.requested)), (error: unknown) =>
        error instanceof ApplicationError && error.code === item.code);
      assert.deepEqual(repository.appointments.get(appointment.id), original);
      assert.equal(repository.reminders.get('pending')?.status, 'pending');
    });
  }
});

test('CancellationService cancels outstanding reminders and preserves sent history', async () => {
  const { clock, repository } = services();
  repository.reminders.set('pending', reminder({ id: 'pending' }));
  repository.reminders.set('sent', reminder({ id: 'sent', status: 'sent', attempts: 1, sentAt: clock.now() }));
  const service = new CancellationService(repository, clock);
  const result = await service.cancel('appointment-1');
  assert.equal(result.appointment.status, 'cancelled');
  assert.equal(repository.reminders.get('pending')?.status, 'cancelled');
  assert.equal(repository.reminders.get('sent')?.status, 'sent');
});

test('CancellationService is idempotent when the appointment is already cancelled', async () => {
  const { clock, repository } = services({ status: 'cancelled' });
  const service = new CancellationService(repository, clock);
  const before = { ...repository.appointments.get('appointment-1')! };
  await service.cancel('appointment-1');
  assert.deepEqual(repository.appointments.get('appointment-1'), before);
});

test('Cancellation prevents provider delivery for a cancelled appointment', async () => {
  const { clock, repository, provider, delivery } = services();
  repository.reminders.set('reminder-1', reminder());
  const cancellation = new CancellationService(repository, clock);
  await cancellation.cancel('appointment-1');
  const [claim] = await repository.claimDueReminders(clock.now());
  assert.equal(claim, undefined);
  assert.equal(provider.messages.length, 0);
  assert.equal(repository.reminders.get('reminder-1')?.status, 'cancelled');
  assert.ok(delivery);
});
