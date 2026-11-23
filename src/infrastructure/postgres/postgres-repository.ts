import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type {
  Appointment,
  AppointmentContext,
  AppointmentStatus,
  Clinic,
  InboundMessage,
  Patient,
  Reminder,
  ReminderStatus,
  SkipReason,
} from '../../domain/model.js';
import type {
  ClaimedReminder,
  ClinicSayRepository,
  DataTransaction,
  NewAppointment,
  NewClinic,
  NewPatient,
  NewReminder,
} from '../../application/ports.js';

type Row = QueryResultRow & Record<string, unknown>;

function clinicFrom(row: Row): Clinic {
  return {
    id: String(row.id),
    name: String(row.name),
    timezone: String(row.timezone),
    createdAt: new Date(row.created_at as string),
  };
}

function patientFrom(row: Row): Patient {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    name: String(row.name),
    phone: row.phone === null ? null : String(row.phone),
    acceptsReminders: Boolean(row.accepts_reminders),
    createdAt: new Date(row.created_at as string),
  };
}

function appointmentFrom(row: Row): Appointment {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    patientId: String(row.patient_id),
    startsAt: new Date(row.starts_at as string),
    status: String(row.status) as AppointmentStatus,
    version: Number(row.version),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function reminderFrom(row: Row): Reminder {
  return {
    id: String(row.id),
    appointmentId: String(row.appointment_id),
    appointmentVersion: Number(row.appointment_version),
    scheduledFor: new Date(row.scheduled_for as string),
    status: String(row.status) as ReminderStatus,
    attempts: Number(row.attempts),
    sentAt: row.sent_at === null ? null : new Date(row.sent_at as string),
    skipReason:
      row.skip_reason === null
        ? null
        : String(row.skip_reason) as SkipReason,
    createdAt: new Date(row.created_at as string),
  };
}

class PostgresTransaction implements DataTransaction {
  constructor(private readonly client: PoolClient) {}

  async claimDueReminderIds(now: Date): Promise<string[]> {
    const selected = await this.client.query<Row>(`
      SELECT id FROM reminders
      WHERE status IN ('pending', 'retry') AND scheduled_for <= $1
      ORDER BY scheduled_for ASC, created_at ASC, id ASC
      FOR UPDATE SKIP LOCKED
    `, [now]);
    const ids = selected.rows.map((row) => String(row.id));
    if (ids.length) {
      await this.client.query(
        `UPDATE reminders
         SET status = 'sending', attempts = attempts + 1
         WHERE id = ANY($1::uuid[])`,
        [ids],
      );
    }
    return ids;
  }

  async findClinic(id: string): Promise<Clinic | null> {
    const result = await this.client.query<Row>(
      'SELECT * FROM clinics WHERE id = $1',
      [id],
    );
    return result.rows[0] ? clinicFrom(result.rows[0]) : null;
  }

  async findPatient(id: string): Promise<Patient | null> {
    const result = await this.client.query<Row>(
      'SELECT * FROM patients WHERE id = $1',
      [id],
    );
    return result.rows[0] ? patientFrom(result.rows[0]) : null;
  }

  async findAppointmentForUpdate(
    id: string,
  ): Promise<AppointmentContext | null> {
    const result = await this.client.query<Row>(
      'SELECT id FROM appointments WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (!result.rows[0]) return null;
    return this.findAppointmentContext(id);
  }

  async findAppointmentContext(id: string): Promise<AppointmentContext | null> {
    const result = await this.client.query<Row>(`
      SELECT a.*,
             c.name AS clinic_name,
             c.timezone AS clinic_timezone,
             c.created_at AS clinic_created_at,
             p.name AS patient_name,
             p.phone AS patient_phone,
             p.accepts_reminders AS patient_accepts_reminders,
             p.created_at AS patient_created_at
      FROM appointments a
      JOIN clinics c ON c.id = a.clinic_id
      JOIN patients p
        ON p.id = a.patient_id AND p.clinic_id = a.clinic_id
      WHERE a.id = $1
    `, [id]);
    const row = result.rows[0];
    if (!row) return null;
    const reminders = await this.client.query<Row>(
      `SELECT * FROM reminders
       WHERE appointment_id = $1
       ORDER BY created_at ASC, id ASC`,
      [id],
    );
    return {
      appointment: appointmentFrom(row),
      clinic: {
        id: String(row.clinic_id),
        name: String(row.clinic_name),
        timezone: String(row.clinic_timezone),
        createdAt: new Date(row.clinic_created_at as string),
      },
      patient: {
        id: String(row.patient_id),
        clinicId: String(row.clinic_id),
        name: String(row.patient_name),
        phone:
          row.patient_phone === null ? null : String(row.patient_phone),
        acceptsReminders: Boolean(row.patient_accepts_reminders),
        createdAt: new Date(row.patient_created_at as string),
      },
      reminders: reminders.rows.map(reminderFrom),
    };
  }

  async findAppointmentContextsByPhone(
    phone: string,
  ): Promise<AppointmentContext[]> {
    const result = await this.client.query<Row>(`
      SELECT a.id FROM appointments a JOIN patients p ON p.id = a.patient_id
      WHERE p.phone = $1 ORDER BY a.id
    `, [phone]);
    const contexts = await Promise.all(
      result.rows.map((row) =>
        this.findAppointmentContext(String(row.id)),
      ),
    );
    return contexts.filter(
      (context): context is AppointmentContext => context !== null,
    );
  }

  async createClinic(clinic: NewClinic): Promise<Clinic> {
    const result = await this.client.query<Row>(
      `INSERT INTO clinics (id, name, timezone, created_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [clinic.id, clinic.name, clinic.timezone, clinic.createdAt],
    );
    return clinicFrom(result.rows[0]!);
  }

  async createPatient(patient: NewPatient): Promise<Patient> {
    const result = await this.client.query<Row>(
      `INSERT INTO patients (
         id, clinic_id, name, phone, accepts_reminders, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        patient.id,
        patient.clinicId,
        patient.name,
        patient.phone,
        patient.acceptsReminders,
        patient.createdAt,
      ],
    );
    return patientFrom(result.rows[0]!);
  }

  async createAppointment(appointment: NewAppointment): Promise<Appointment> {
    const result = await this.client.query<Row>(
      `INSERT INTO appointments (
         id, clinic_id, patient_id, starts_at, status, version,
         created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        appointment.id,
        appointment.clinicId,
        appointment.patientId,
        appointment.startsAt,
        appointment.status,
        appointment.version,
        appointment.createdAt,
        appointment.updatedAt,
      ],
    );
    return appointmentFrom(result.rows[0]!);
  }

  async updateAppointment(appointment: Appointment): Promise<void> {
    await this.client.query(
      `UPDATE appointments
       SET starts_at = $2, status = $3, version = $4, updated_at = $5
       WHERE id = $1`,
      [
        appointment.id,
        appointment.startsAt,
        appointment.status,
        appointment.version,
        appointment.updatedAt,
      ],
    );
  }

  async createReminder(reminder: NewReminder): Promise<Reminder> {
    const result = await this.client.query<Row>(
      `INSERT INTO reminders (
         id, appointment_id, appointment_version, scheduled_for, status,
         attempts, sent_at, skip_reason, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        reminder.id,
        reminder.appointmentId,
        reminder.appointmentVersion,
        reminder.scheduledFor,
        reminder.status,
        reminder.attempts,
        reminder.sentAt,
        reminder.skipReason,
        reminder.createdAt,
      ],
    );
    return reminderFrom(result.rows[0]!);
  }

  async updateReminder(reminder: Reminder): Promise<void> {
    await this.client.query(
      `UPDATE reminders
       SET appointment_version = $2, scheduled_for = $3, status = $4,
           attempts = $5,
       sent_at = $6, skip_reason = $7 WHERE id = $1`,
      [
        reminder.id,
        reminder.appointmentVersion,
        reminder.scheduledFor,
        reminder.status,
        reminder.attempts,
        reminder.sentAt,
        reminder.skipReason,
      ],
    );
  }

  async cancelOutstandingReminders(appointmentId: string): Promise<void> {
    await this.client.query(
      `UPDATE reminders SET status = 'cancelled', skip_reason = NULL
       WHERE appointment_id = $1
         AND status IN ('pending', 'retry', 'sending')`,
      [appointmentId],
    );
  }

  async recordInboundMessageIfNew(
    message: InboundMessage,
    processedAt: Date,
  ): Promise<boolean> {
    const result = await this.client.query(
      `INSERT INTO inbound_messages (
         message_id, sender_phone, text, received_at, processed_at
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (message_id) DO NOTHING`,
      [
        message.messageId,
        message.from,
        message.text,
        message.receivedAt,
        processedAt,
      ],
    );
    return result.rowCount === 1;
  }
}

export class PostgresClinicSayRepository implements ClinicSayRepository {
  constructor(private readonly pool: Pool) {}

  async transaction<T>(
    operation: (transaction: DataTransaction) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(new PostgresTransaction(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getAppointmentContext(id: string): Promise<AppointmentContext | null> {
    const client = await this.pool.connect();
    try {
      return await new PostgresTransaction(client).findAppointmentContext(id);
    } finally {
      client.release();
    }
  }

  async claimDueReminders(now: Date): Promise<ClaimedReminder[]> {
    const ids = await this.transaction((transaction) =>
      transaction.claimDueReminderIds(now),
    );

    const claimed: ClaimedReminder[] = [];
    for (const id of ids) {
      const rowResult = await this.pool.query<Row>(
        'SELECT * FROM reminders WHERE id = $1',
        [id],
      );
      const reminderRow = rowResult.rows[0];
      if (!reminderRow) continue;
      const reminder = reminderFrom(reminderRow);
      const context = await this.getAppointmentContext(reminder.appointmentId);
      if (context) claimed.push({ reminder, context });
    }
    return claimed;
  }
}
