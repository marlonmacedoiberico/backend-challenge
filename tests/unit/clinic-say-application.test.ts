import assert from 'node:assert/strict';
import test from 'node:test';
import { ClinicSayApplication } from '../../src/usecases/clinic-say-application.js';
import { DeliveryService } from '../../src/usecases/service/delivery-service.js';
import { SchedulerService } from '../../src/usecases/service/scheduler-service.js';
import type { DataTransaction } from '../../src/usecases/ports.js';
import { ApplicationError } from '../../src/domain/errors.js';
import { fixture } from '../helpers/fake-clinic-say.js';

function setup() {
  const context = fixture();
  const delivery = new DeliveryService(
    context.repository,
    context.clock,
    { send: async () => ({ kind: 'accepted' as const }) },
  );
  const scheduler = new SchedulerService(
    context.repository,
    context.clock,
    delivery,
    () => 'generated-reminder',
  );
  let id = 0;
  const app = new ClinicSayApplication(
    context.repository,
    context.clock,
    scheduler,
    () => `generated-${++id}`,
  );
  return { ...context, app };
}

async function rejectsWith(
  operation: Promise<unknown>,
  code: ApplicationError['code'],
) {
  await assert.rejects(operation, (error: unknown) =>
    error instanceof ApplicationError && error.code === code,
  );
}

test('clinic create, list and get use trimmed names and deterministic IDs', async () => {
  const { app, clinic } = setup();

  const created = await app.createClinic('  New clinic  ', 'America/Lima');

  assert.equal(created.id, 'generated-1');
  assert.equal(created.name, 'New clinic');
  assert.equal(created.timezone, 'America/Lima');
  assert.equal((await app.getClinic(clinic.id)).id, clinic.id);
  assert.deepEqual(
    (await app.listClinics()).map(({ id }) => id).sort(),
    [created.id, clinic.id].sort(),
  );
});

test('clinic creation and lookup reject invalid input and missing records', async () => {
  const { app } = setup();
  await rejectsWith(app.createClinic('  ', 'UTC'), 'validation');
  await rejectsWith(app.createClinic('Clinic', 'Mars/Olympus'), 'validation');
  await rejectsWith(app.getClinic('missing'), 'not_found');
});

test('clinic update supports partial input and rejects invalid or conflicting changes', async () => {
  const { app, clinic } = setup();

  const renamed = await app.updateClinic(clinic.id, { name: '  Renamed  ' });
  assert.equal(renamed.name, 'Renamed');
  assert.equal(renamed.timezone, clinic.timezone);
  assert.deepEqual(await app.updateClinic(clinic.id, {}), renamed);

  await rejectsWith(app.updateClinic(clinic.id, { name: ' ' }), 'validation');
  await rejectsWith(app.updateClinic(clinic.id, { timezone: 'Not/AZone' }), 'validation');
  await rejectsWith(
    app.updateClinic(clinic.id, { timezone: 'America/Lima' }),
    'conflict',
  );
  await rejectsWith(app.updateClinic('missing', { name: 'X' }), 'not_found');
});

test('clinic deletion requires no patients or appointments', async () => {
  const { app, clinic, repository } = setup();
  await rejectsWith(app.deleteClinic(clinic.id), 'conflict');

  repository.patients.clear();
  await rejectsWith(app.deleteClinic(clinic.id), 'conflict');

  repository.appointments.clear();
  await app.deleteClinic(clinic.id);
  assert.equal(repository.clinics.has(clinic.id), false);
  await rejectsWith(app.deleteClinic('missing'), 'not_found');
});

test('patient create, list and get cover optional filtering and null phone', async () => {
  const { app, clinic } = setup();
  const created = await app.createPatient({
    clinicId: clinic.id,
    name: '  Bea  ',
    phone: null,
    acceptsReminders: false,
  });

  assert.equal(created.id, 'generated-1');
  assert.equal(created.name, 'Bea');
  assert.equal(created.phone, null);
  assert.deepEqual(
    (await app.listPatients(clinic.id)).map(({ id }) => id).sort(),
    [created.id, 'patient-1'].sort(),
  );
  assert.deepEqual(
    (await app.listPatients()).map(({ id }) => id).sort(),
    [created.id, 'patient-1'].sort(),
  );
  assert.equal((await app.getPatient(created.id)).id, created.id);
  await rejectsWith(app.listPatients('missing'), 'not_found');
  await rejectsWith(app.getPatient('missing'), 'not_found');
});

test('patient creation validates name, phone and clinic', async () => {
  const { app, clinic } = setup();
  const input = {
    clinicId: clinic.id,
    name: 'Bea',
    phone: '+34600111223',
    acceptsReminders: true,
  };

  await rejectsWith(app.createPatient({ ...input, name: ' ' }), 'validation');
  await rejectsWith(app.createPatient({ ...input, phone: '1234' }), 'validation');
  await rejectsWith(app.createPatient({ ...input, clinicId: 'missing' }), 'not_found');
});

test('patient update supports partial changes and validates supplied fields', async () => {
  const { app, patient } = setup();
  const updated = await app.updatePatient(patient.id, {
    name: '  Ana María  ',
    phone: null,
    acceptsReminders: false,
  });

  assert.equal(updated.name, 'Ana María');
  assert.equal(updated.phone, null);
  assert.equal(updated.acceptsReminders, false);
  assert.deepEqual(await app.updatePatient(patient.id, {}), updated);
  await rejectsWith(app.updatePatient(patient.id, { name: ' ' }), 'validation');
  await rejectsWith(app.updatePatient(patient.id, { phone: 'bad' }), 'validation');
  await rejectsWith(app.updatePatient('missing', {}), 'not_found');
});

test('patient deletion requires no appointments', async () => {
  const { app, patient, repository } = setup();
  await rejectsWith(app.deletePatient(patient.id), 'conflict');
  repository.appointments.clear();
  await app.deletePatient(patient.id);
  assert.equal(repository.patients.has(patient.id), false);
  await rejectsWith(app.deletePatient('missing'), 'not_found');
});

test('appointment and reminder listing validates statuses and forwards filters', async () => {
  const { app, clinic, patient } = setup();
  const appointments = await app.listAppointmentContexts({
    clinicId: clinic.id,
    patientId: patient.id,
    status: 'scheduled',
  });
  assert.equal(appointments.length, 1);
  await rejectsWith(app.listAppointmentContexts({ status: 'unknown' }), 'validation');

  const reminders = await app.listReminderContexts({
    clinicId: clinic.id,
    appointmentId: 'appointment-1',
    status: 'pending',
  });
  assert.deepEqual(reminders, []);
  await rejectsWith(app.listReminderContexts({ status: 'unknown' }), 'validation');
});

test('appointment creation schedules reminders and returns its context', async () => {
  const { app, clinic, patient, repository } = setup();
  const context = await app.createAppointment({
    clinicId: clinic.id,
    patientId: patient.id,
    startsAt: new Date('2027-04-01T12:00:00.000Z'),
  });

  assert.equal(context.appointment.id, 'generated-1');
  assert.equal(context.appointment.status, 'scheduled');
  assert.equal(context.reminders.length, 1);
  assert.equal(context.reminders[0].id, 'generated-reminder');
  assert.equal(repository.appointments.has(context.appointment.id), true);
});

test('appointment creation rejects past dates and invalid clinic or patient relationships', async () => {
  const { app, clinic, patient } = setup();
  const future = new Date('2027-04-01T12:00:00.000Z');
  await rejectsWith(app.createAppointment({
    clinicId: clinic.id,
    patientId: patient.id,
    startsAt: new Date('2027-03-01T08:00:00.000Z'),
  }), 'validation');
  await rejectsWith(app.createAppointment({
    clinicId: 'missing', patientId: patient.id, startsAt: future,
  }), 'not_found');
  await rejectsWith(app.createAppointment({
    clinicId: clinic.id, patientId: 'missing', startsAt: future,
  }), 'not_found');

  const otherClinic = await app.createClinic('Other', 'UTC');
  await rejectsWith(app.createAppointment({
    clinicId: otherClinic.id, patientId: patient.id, startsAt: future,
  }), 'validation');
});

test('appointment lookup returns a context and rejects a missing appointment', async () => {
  const { app } = setup();
  assert.equal((await app.getAppointment('appointment-1')).appointment.id, 'appointment-1');
  await rejectsWith(app.getAppointment('missing'), 'not_found');
});

test('appointment deletion reports when the record disappears during deletion', async () => {
  const { app, repository } = setup();
  const originalTransaction = repository.transaction.bind(repository);
  repository.transaction = <T>(
    operation: (transaction: DataTransaction) => Promise<T>,
  ) => originalTransaction((transaction) => operation(new Proxy(transaction, {
    get(target, property, receiver) {
      if (property === 'deleteAppointment') return async () => false;
      return Reflect.get(target, property, receiver);
    },
  })));

  await rejectsWith(app.deleteAppointment('appointment-1'), 'not_found');
});

test('application inbound-message entry point processes replies', async () => {
  const { app, repository } = setup();
  await app.receiveInboundMessage({
    messageId: 'inbound-1',
    from: '+34600111222',
    text: 'maybe',
    receivedAt: new Date('2027-03-01T08:00:00.000Z'),
  });
  assert.equal(repository.inbound.has('inbound-1'), true);
});
