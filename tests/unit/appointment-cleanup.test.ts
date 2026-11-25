import assert from 'node:assert/strict';
import test from 'node:test';
import { ClinicSayApplication } from '../../src/usecases/clinic-say-application.js';
import { DeliveryService } from '../../src/usecases/service/delivery-service.js';
import { SchedulerService } from '../../src/usecases/service/scheduler-service.js';
import { ApplicationError } from '../../src/domain/errors.js';
import { fixture, reminder } from '../helpers/fake-clinic-say.js';

function application() {
  const context = fixture();
  const provider = { send: async () => ({ kind: 'accepted' as const }) };
  const delivery = new DeliveryService(context.repository, context.clock, provider);
  const scheduler = new SchedulerService(context.repository, context.clock, delivery);
  return { ...context, app: new ClinicSayApplication(context.repository, context.clock, scheduler) };
}

test('deleting an appointment also removes its reminders and sent history', async () => {
  const { app, repository, patient, clinic } = application();
  const originalAppointment = repository.appointments.get('appointment-1')!;
  repository.appointments.set('appointment-2', {
    ...originalAppointment,
    id: 'appointment-2',
  });
  repository.reminders.set('pending-reminder', reminder({ id: 'pending-reminder' }));
  repository.reminders.set('sent-reminder', reminder({
    id: 'sent-reminder', status: 'sent', attempts: 1,
    sentAt: new Date('2027-02-28T08:00:00.000Z'),
  }));
  repository.reminders.set('other-reminder', reminder({
    id: 'other-reminder', appointmentId: 'appointment-2',
  }));

  await app.deleteAppointment('appointment-1');

  assert.equal(repository.appointments.has('appointment-1'), false);
  assert.equal(repository.appointments.has('appointment-2'), true);
  assert.deepEqual([...repository.reminders.keys()], ['other-reminder']);
  assert.equal(repository.patients.get(patient.id), patient);
  assert.equal(repository.clinics.get(clinic.id), clinic);
});

test('deleting a missing appointment returns not found', async () => {
  const { app } = application();

  await assert.rejects(app.deleteAppointment('missing'), (error: unknown) =>
    error instanceof ApplicationError && error.code === 'not_found',
  );
});

test('clearing reminders removes all reminder history but keeps appointments', async () => {
  const { app, repository } = application();
  const firstAppointment = repository.appointments.get('appointment-1')!;
  repository.appointments.set('appointment-2', {
    ...firstAppointment,
    id: 'appointment-2',
  });
  repository.reminders.set('reminder-1', reminder());
  repository.reminders.set('reminder-2', reminder({
    id: 'reminder-2', appointmentId: 'appointment-2', status: 'sent',
  }));

  await app.clearReminders();
  await app.clearReminders();

  assert.equal(repository.reminders.size, 0);
  assert.equal(repository.appointments.has('appointment-1'), true);
  assert.equal(repository.appointments.has('appointment-2'), true);
});
