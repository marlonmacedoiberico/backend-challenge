import assert from 'node:assert/strict';
import test from 'node:test';
import { Usecases } from '../../src/usecases/usecases.js';
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
  const app = new Usecases(
    context.repository,
    context.clock,
    scheduler,
    () => `generated-${++id}`,
  );
  return { ...context, app, scheduler };
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

  const created = await app.clinics.createClinic('  New clinic  ', 'America/Lima');

  assert.equal(created.id, 'generated-1');
  assert.equal(created.name, 'New clinic');
  assert.equal(created.timezone, 'America/Lima');
  assert.equal((await app.clinics.getClinic(clinic.id)).id, clinic.id);
  assert.deepEqual(
    (await app.clinics.listClinics()).map(({ id }) => id).sort(),
    [created.id, clinic.id].sort(),
  );
});

test('usecases composition supplies a UUID generator when none is passed', async () => {
  const { repository, clock, scheduler } = setup();
  const usecases = new Usecases(repository, clock, scheduler);

  const clinic = await usecases.clinics.createClinic('Generated ID', 'UTC');

  assert.match(clinic.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
});

test('clinic creation and lookup reject invalid input and missing records', async () => {
  const { app } = setup();
  await rejectsWith(app.clinics.createClinic('  ', 'UTC'), 'validation');
  await rejectsWith(app.clinics.createClinic('Clinic', 'Mars/Olympus'), 'validation');
  await rejectsWith(app.clinics.getClinic('missing'), 'not_found');
});

test('clinic update supports partial input and rejects invalid or conflicting changes', async () => {
  const { app, clinic } = setup();

  const renamed = await app.clinics.updateClinic(clinic.id, { name: '  Renamed  ' });
  assert.equal(renamed.name, 'Renamed');
  assert.equal(renamed.timezone, clinic.timezone);
  assert.deepEqual(await app.clinics.updateClinic(clinic.id, {}), renamed);

  await rejectsWith(app.clinics.updateClinic(clinic.id, { name: ' ' }), 'validation');
  await rejectsWith(app.clinics.updateClinic(clinic.id, { timezone: 'Not/AZone' }), 'validation');
  await rejectsWith(
    app.clinics.updateClinic(clinic.id, { timezone: 'America/Lima' }),
    'conflict',
  );
  await rejectsWith(app.clinics.updateClinic('missing', { name: 'X' }), 'not_found');
});

test('clinic deletion requires no patients or appointments', async () => {
  const { app, clinic, repository } = setup();
  await rejectsWith(app.clinics.deleteClinic(clinic.id), 'conflict');

  repository.patients.clear();
  await rejectsWith(app.clinics.deleteClinic(clinic.id), 'conflict');

  repository.appointments.clear();
  await app.clinics.deleteClinic(clinic.id);
  assert.equal(repository.clinics.has(clinic.id), false);
  await rejectsWith(app.clinics.deleteClinic('missing'), 'not_found');
});

test('clinic timezone can change after appointments are removed', async () => {
  const { app, clinic, repository } = setup();
  repository.appointments.clear();

  const updated = await app.clinics.updateClinic(clinic.id, {
    timezone: 'America/Lima',
  });

  assert.equal(updated.timezone, 'America/Lima');
});

test('clinic update and delete report records lost during their transactions', async () => {
  const updateCase = setup();
  const updateTransaction = updateCase.repository.transaction.bind(updateCase.repository);
  updateCase.repository.transaction = <T>(operation: (transaction: DataTransaction) => Promise<T>) =>
    updateTransaction((transaction) => operation(new Proxy(transaction, {
      get(target, property, receiver) {
        if (property === 'updateClinic') return async () => null;
        return Reflect.get(target, property, receiver);
      },
    })));
  await rejectsWith(
    updateCase.app.clinics.updateClinic(updateCase.clinic.id, { name: 'Changed' }),
    'not_found',
  );

  const deleteCase = setup();
  deleteCase.repository.patients.clear();
  deleteCase.repository.appointments.clear();
  const deleteTransaction = deleteCase.repository.transaction.bind(deleteCase.repository);
  deleteCase.repository.transaction = <T>(operation: (transaction: DataTransaction) => Promise<T>) =>
    deleteTransaction((transaction) => operation(new Proxy(transaction, {
      get(target, property, receiver) {
        if (property === 'deleteClinic') return async () => false;
        return Reflect.get(target, property, receiver);
      },
    })));
  await rejectsWith(deleteCase.app.clinics.deleteClinic(deleteCase.clinic.id), 'not_found');
});

test('patient create, list and get cover optional filtering and null phone', async () => {
  const { app, clinic } = setup();
  const created = await app.patients.createPatient({
    clinicId: clinic.id,
    name: '  Bea  ',
    phone: null,
    acceptsReminders: false,
  });

  assert.equal(created.id, 'generated-1');
  assert.equal(created.name, 'Bea');
  assert.equal(created.phone, null);
  assert.deepEqual(
    (await app.patients.listPatients(clinic.id)).map(({ id }) => id).sort(),
    [created.id, 'patient-1'].sort(),
  );
  assert.deepEqual(
    (await app.patients.listPatients()).map(({ id }) => id).sort(),
    [created.id, 'patient-1'].sort(),
  );
  assert.equal((await app.patients.getPatient(created.id)).id, created.id);
  await rejectsWith(app.patients.listPatients('missing'), 'not_found');
  await rejectsWith(app.patients.getPatient('missing'), 'not_found');
});

test('patient creation validates name, phone and clinic', async () => {
  const { app, clinic } = setup();
  const input = {
    clinicId: clinic.id,
    name: 'Bea',
    phone: '+34600111223',
    acceptsReminders: true,
  };

  await rejectsWith(app.patients.createPatient({ ...input, name: ' ' }), 'validation');
  await rejectsWith(app.patients.createPatient({ ...input, phone: '1234' }), 'validation');
  await rejectsWith(app.patients.createPatient({ ...input, clinicId: 'missing' }), 'not_found');
});

test('patient update supports partial changes and validates supplied fields', async () => {
  const { app, patient } = setup();
  const updated = await app.patients.updatePatient(patient.id, {
    name: '  Ana María  ',
    phone: null,
    acceptsReminders: false,
  });

  assert.equal(updated.name, 'Ana María');
  assert.equal(updated.phone, null);
  assert.equal(updated.acceptsReminders, false);
  assert.deepEqual(await app.patients.updatePatient(patient.id, {}), updated);
  await rejectsWith(app.patients.updatePatient(patient.id, { name: ' ' }), 'validation');
  await rejectsWith(app.patients.updatePatient(patient.id, { phone: 'bad' }), 'validation');
  await rejectsWith(app.patients.updatePatient('missing', {}), 'not_found');
});

test('patient deletion requires no appointments', async () => {
  const { app, patient, repository } = setup();
  await rejectsWith(app.patients.deletePatient(patient.id), 'conflict');
  repository.appointments.clear();
  await app.patients.deletePatient(patient.id);
  assert.equal(repository.patients.has(patient.id), false);
  await rejectsWith(app.patients.deletePatient('missing'), 'not_found');
});

test('patient creation accepts an E.164 phone number', async () => {
  const { app, clinic } = setup();

  const patient = await app.patients.createPatient({
    clinicId: clinic.id,
    name: 'Bea',
    phone: '+34600111223',
    acceptsReminders: true,
  });

  assert.equal(patient.phone, '+34600111223');
});

test('patient update and delete report records lost during their transactions', async () => {
  const updateCase = setup();
  const updateTransaction = updateCase.repository.transaction.bind(updateCase.repository);
  updateCase.repository.transaction = <T>(operation: (transaction: DataTransaction) => Promise<T>) =>
    updateTransaction((transaction) => operation(new Proxy(transaction, {
      get(target, property, receiver) {
        if (property === 'updatePatient') return async () => null;
        return Reflect.get(target, property, receiver);
      },
    })));
  await rejectsWith(
    updateCase.app.patients.updatePatient(updateCase.patient.id, { name: 'Changed' }),
    'not_found',
  );

  const deleteCase = setup();
  deleteCase.repository.appointments.clear();
  const deleteTransaction = deleteCase.repository.transaction.bind(deleteCase.repository);
  deleteCase.repository.transaction = <T>(operation: (transaction: DataTransaction) => Promise<T>) =>
    deleteTransaction((transaction) => operation(new Proxy(transaction, {
      get(target, property, receiver) {
        if (property === 'deletePatient') return async () => false;
        return Reflect.get(target, property, receiver);
      },
    })));
  await rejectsWith(deleteCase.app.patients.deletePatient(deleteCase.patient.id), 'not_found');
});

test('appointment and reminder listing validates statuses and forwards filters', async () => {
  const { app, clinic, patient } = setup();
  await app.appointments.listAppointmentContexts();
  const appointments = await app.appointments.listAppointmentContexts({
    clinicId: clinic.id,
    patientId: patient.id,
    status: 'scheduled',
  });
  assert.equal(appointments.length, 1);
  await rejectsWith(app.appointments.listAppointmentContexts({ status: 'unknown' }), 'validation');

  await app.reminders.listReminderContexts();
  const reminders = await app.reminders.listReminderContexts({
    clinicId: clinic.id,
    appointmentId: 'appointment-1',
    status: 'pending',
  });
  assert.deepEqual(reminders, []);
  await rejectsWith(app.reminders.listReminderContexts({ status: 'unknown' }), 'validation');
});

test('appointment creation schedules reminders and returns its context', async () => {
  const { app, clinic, patient, repository } = setup();
  const context = await app.appointments.createAppointment({
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
  await rejectsWith(app.appointments.createAppointment({
    clinicId: clinic.id,
    patientId: patient.id,
    startsAt: new Date('2027-03-01T08:00:00.000Z'),
  }), 'validation');
  await rejectsWith(app.appointments.createAppointment({
    clinicId: 'missing', patientId: patient.id, startsAt: future,
  }), 'not_found');
  await rejectsWith(app.appointments.createAppointment({
    clinicId: clinic.id, patientId: 'missing', startsAt: future,
  }), 'not_found');

  const otherClinic = await app.clinics.createClinic('Other', 'UTC');
  await rejectsWith(app.appointments.createAppointment({
    clinicId: otherClinic.id, patientId: patient.id, startsAt: future,
  }), 'validation');
});

test('appointment lookup returns a context and rejects a missing appointment', async () => {
  const { app } = setup();
  assert.equal((await app.appointments.getAppointment('appointment-1')).appointment.id, 'appointment-1');
  await rejectsWith(app.appointments.getAppointment('missing'), 'not_found');
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

  await rejectsWith(app.appointments.deleteAppointment('appointment-1'), 'not_found');
});

test('appointment deletion rejects an ID that is missing before deletion', async () => {
  const { app } = setup();
  await rejectsWith(app.appointments.deleteAppointment('missing'), 'not_found');
});

test('appointment creation rejects a context that disappears after scheduling', async () => {
  const { app, clinic, patient, repository } = setup();
  const transaction = repository.transaction.bind(repository);
  repository.transaction = <T>(operation: (transaction: DataTransaction) => Promise<T>) =>
    transaction((current) => operation(new Proxy(current, {
      get(target, property, receiver) {
        if (property === 'findAppointmentContext') return async () => null;
        return Reflect.get(target, property, receiver);
      },
    })));

  await rejectsWith(app.appointments.createAppointment({
    clinicId: clinic.id,
    patientId: patient.id,
    startsAt: new Date('2027-04-01T12:00:00.000Z'),
  }), 'not_found');
});

test('service-backed usecases delegate cancellation, rescheduling, and reminder runs', async () => {
  const { app } = setup();

  const rescheduled = await app.rescheduler.reschedule(
    'appointment-1',
    new Date('2027-04-01T12:00:00.000Z'),
  );
  assert.equal(rescheduled.appointment.startsAt.toISOString(), '2027-04-01T12:00:00.000Z');

  const cancelled = await app.cancellation.cancel('appointment-1');
  assert.equal(cancelled.appointment.status, 'cancelled');
  assert.equal(await app.scheduler.runDueReminders(), 0);
});

test('inbound reply usecase processes received messages', async () => {
  const { app, repository } = setup();
  await app.inboundReplies.process({
    messageId: 'inbound-1',
    from: '+34600111222',
    text: 'maybe',
    receivedAt: new Date('2027-03-01T08:00:00.000Z'),
  });
  assert.equal(repository.inbound.has('inbound-1'), true);
});
