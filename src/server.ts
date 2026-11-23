import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { Pool } from 'pg';
import { ClinicSayApplication } from './application/clinic-say-application.js';
import { DeliveryService } from './application/services/delivery-service.js';
import { SchedulerService } from './application/services/scheduler-service.js';
import { ApplicationError } from './domain/errors.js';
import type { AppointmentContext, ReminderStatus } from './domain/model.js';
import { ControllableClock, SystemClock } from './infrastructure/clock.js';
import {
  HttpMessageProvider,
} from './infrastructure/messaging/http-message-provider.js';
import {
  PostgresClinicSayRepository,
} from './infrastructure/postgres/postgres-repository.js';
import { runMigrations } from './storage/migrate.js';

const uuidPattern = new RegExp(
  '^[0-9a-f]{8}-[0-9a-f]{4}-' +
  '[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  'i',
);
const port = Number(process.env.PORT ?? 3000);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });
const testClock =
  process.env.CLOCK_MODE === 'test' ? new ControllableClock() : null;
const clock = testClock ?? new SystemClock();
const repository = new PostgresClinicSayRepository(pool);
const provider = new HttpMessageProvider(
  process.env.PROVIDER_URL ?? 'http://localhost:4010',
);
const delivery = new DeliveryService(repository, clock, provider);
const scheduler = new SchedulerService(repository, clock, delivery);
const app = new ClinicSayApplication(repository, clock, scheduler);

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

function serializeAppointment(context: AppointmentContext) {
  return {
    id: context.appointment.id,
    clinicId: context.appointment.clinicId,
    patientId: context.appointment.patientId,
    startsAt: context.appointment.startsAt.toISOString(),
    status: context.appointment.status,
    reminders: context.reminders.map((reminder) => ({
      id: reminder.id,
      scheduledFor: reminder.scheduledFor.toISOString(),
      status: apiReminderStatus(reminder.status),
      attempts: reminder.attempts,
      sentAt: reminder.sentAt?.toISOString() ?? null,
      skipReason: reminder.skipReason,
    })),
  };
}

function apiReminderStatus(
  status: ReminderStatus,
): 'pending' | 'sent' | 'failed' | 'skipped' | 'cancelled' {
  return status === 'sending' || status === 'retry' ? 'pending' : status;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) {
      throw new ApplicationError('validation', 'request body is too large');
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new ApplicationError('validation', 'request body must be valid JSON');
  }
}

function objectBody(value: unknown): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new ApplicationError(
      'validation',
      'request body must be a JSON object',
    );
  }
  return value as Record<string, unknown>;
}

function requiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApplicationError(
      'validation',
      `${key} must be a non-empty string`,
    );
  }
  return value;
}

function requiredUuid(body: Record<string, unknown>, key: string): string {
  const value = requiredString(body, key);
  if (!uuidPattern.test(value)) {
    throw new ApplicationError('validation', `${key} must be a UUID`);
  }
  return value;
}

function requiredDate(body: Record<string, unknown>, key: string): Date {
  const value = requiredString(body, key);
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new ApplicationError('validation', `${key} must include a timezone`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new ApplicationError(
      'validation',
      `${key} must be a valid date-time`,
    );
  }
  return date;
}

function routeId(pathname: string, pattern: RegExp): string | null {
  return pattern.exec(pathname)?.[1] ?? null;
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const path = url.pathname;
  const method = request.method ?? 'GET';

  if (method === 'GET' && path === '/health') {
    try {
      const readiness = await pool.query(`
        SELECT EXISTS (SELECT 1 FROM schema_migrations)
          AND to_regclass('public.clinics') IS NOT NULL AS ready
      `);
      if (!readiness.rows[0]?.ready) {
        return json(response, 503, {
          error: 'database migrations are not ready',
        });
      }
      return json(response, 200, { ok: true });
    } catch {
      return json(response, 503, { error: 'database is not ready' });
    }
  }

  if (method === 'POST' && path === '/clinics') {
    const body = objectBody(await readJson(request));
    const clinic = await app.createClinic(
      requiredString(body, 'name'),
      requiredString(body, 'timezone'),
    );
    return json(response, 201, {
      id: clinic.id,
      name: clinic.name,
      timezone: clinic.timezone,
    });
  }

  if (method === 'POST' && path === '/patients') {
    const body = objectBody(await readJson(request));
    if (typeof body.acceptsReminders !== 'boolean') {
      throw new ApplicationError(
        'validation',
        'acceptsReminders must be a boolean',
      );
    }
    const patient = await app.createPatient({
      clinicId: requiredUuid(body, 'clinicId'),
      name: requiredString(body, 'name'),
      phone:
        body.phone === undefined || body.phone === null
          ? null
          : requiredString(body, 'phone'),
      acceptsReminders: body.acceptsReminders,
    });
    return json(response, 201, {
      id: patient.id, clinicId: patient.clinicId, name: patient.name,
      phone: patient.phone, acceptsReminders: patient.acceptsReminders,
    });
  }

  if (method === 'POST' && path === '/appointments') {
    const body = objectBody(await readJson(request));
    const context = await app.createAppointment({
      clinicId: requiredUuid(body, 'clinicId'),
      patientId: requiredUuid(body, 'patientId'),
      startsAt: requiredDate(body, 'startsAt'),
    });
    return json(response, 201, serializeAppointment(context));
  }

  const appointmentId = routeId(path, /^\/appointments\/([^/]+)$/);
  if (appointmentId && !uuidPattern.test(appointmentId)) {
    return json(response, 404, { error: 'not found' });
  }
  if (appointmentId && method === 'GET') {
    const context = await app.getAppointment(appointmentId);
    return json(response, 200, serializeAppointment(context));
  }
  if (appointmentId && method === 'PATCH') {
    const body = objectBody(await readJson(request));
    const context = await app.reschedulerService.reschedule(
      appointmentId,
      requiredDate(body, 'startsAt'),
    );
    return json(response, 200, serializeAppointment(context));
  }

  const cancelId = routeId(path, /^\/appointments\/([^/]+)\/cancel$/);
  if (cancelId && !uuidPattern.test(cancelId)) {
    return json(response, 404, { error: 'not found' });
  }
  if (cancelId && method === 'POST') {
    const context = await app.cancellationService.cancel(cancelId);
    return json(response, 200, serializeAppointment(context));
  }

  if (method === 'POST' && path === '/jobs/reminders/run') {
    const processed = await scheduler.runDueReminders();
    return json(response, 200, { processed });
  }

  if (method === 'POST' && path === '/webhooks/inbound-messages') {
    const body = objectBody(await readJson(request));
    const receivedAt = requiredDate(body, 'receivedAt');
    const senderPhone = requiredString(body, 'from');
    if (!/^\+[1-9]\d{7,14}$/.test(senderPhone)) {
      throw new ApplicationError('validation', 'from must be an E.164 number');
    }
    if (typeof body.text !== 'string') {
      throw new ApplicationError('validation', 'text must be a string');
    }
    await app.receiveInboundMessage({
      messageId: requiredString(body, 'messageId'),
      from: senderPhone,
      text: body.text,
      receivedAt,
    });
    return json(response, 200, { ok: true });
  }

  if (method === 'PUT' && path === '/test/clock') {
    if (!testClock) {
      return json(response, 404, { error: 'not found' });
    }
    const body = objectBody(await readJson(request));
    testClock.set(requiredDate(body, 'now'));
    response.writeHead(204);
    response.end();
    return;
  }

  return json(response, 404, { error: 'not found' });
}

const server = createServer((request, response) => {
  void handle(request, response).catch((error: unknown) => {
    if (error instanceof ApplicationError) {
      const status =
        error.code === 'validation'
          ? 400
          : error.code === 'not_found'
            ? 404
            : 409;
      return json(response, status, { error: error.message });
    }
    console.error('Request failed:', error);
    return json(response, 500, { error: 'internal server error' });
  });
});

async function start(): Promise<void> {
  await runMigrations(pool);
  server.listen(port, '0.0.0.0', () => {
    console.log(`ClinicSay API listening on :${port}`);
  });
}

async function shutdown(): Promise<void> {
  server.close();
  await pool.end();
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

start().catch(async (error: unknown) => {
  console.error('Failed to start ClinicSay API:', error);
  await pool.end();
  process.exitCode = 1;
});
