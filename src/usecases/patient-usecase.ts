import type { Clock, ClinicSayRepository } from './ports.js';
import { conflict, notFound, validation } from '../domain/errors.js';
import type { Patient } from '../domain/model.js';
import { ClinicUsecase } from './clinic-usecase.js';

const e164 = /^\+[1-9]\d{7,14}$/;

export class PatientUsecase {
  constructor(
    private readonly repository: ClinicSayRepository,
    private readonly clock: Clock,
    private readonly clinics: ClinicUsecase,
    private readonly newId: () => string,
  ) {}

  async createPatient(input: {
    clinicId: string;
    name: string;
    phone: string | null;
    acceptsReminders: boolean;
  }): Promise<Patient> {
    if (!input.name.trim()) validation('name must not be empty');
    if (input.phone !== null && !e164.test(input.phone)) {
      validation('phone must be an E.164 number or null');
    }
    const now = this.clock.now();
    return this.repository.transaction(async (transaction) => {
      if (!await transaction.findClinic(input.clinicId)) notFound('clinic not found');
      return transaction.createPatient({
        id: this.newId(), clinicId: input.clinicId, name: input.name.trim(),
        phone: input.phone, acceptsReminders: input.acceptsReminders,
        createdAt: now,
      });
    });
  }

  async listPatients(clinicId?: string): Promise<Patient[]> {
    if (clinicId) await this.clinics.getClinic(clinicId);
    return this.repository.listPatients(clinicId);
  }

  async getPatient(id: string): Promise<Patient> {
    const patient = await this.repository.getPatient(id);
    if (!patient) notFound('patient not found');
    return patient;
  }

  async updatePatient(
    id: string,
    input: { name?: string; phone?: string | null; acceptsReminders?: boolean },
  ): Promise<Patient> {
    const current = await this.getPatient(id);
    const name = input.name === undefined ? current.name : input.name.trim();
    const phone = input.phone === undefined ? current.phone : input.phone;
    const acceptsReminders = input.acceptsReminders ?? current.acceptsReminders;
    if (!name) validation('name must not be empty');
    if (phone !== null && !e164.test(phone)) {
      validation('phone must be an E.164 number or null');
    }
    const updated = await this.repository.transaction((transaction) =>
      transaction.updatePatient({ ...current, name, phone, acceptsReminders }),
    );
    if (!updated) notFound('patient not found');
    return updated;
  }

  async deletePatient(id: string): Promise<void> {
    await this.getPatient(id);
    await this.repository.transaction(async (transaction) => {
      if (await transaction.hasAppointmentsForPatient(id)) {
        conflict('patient cannot be deleted while appointments exist');
      }
      if (!await transaction.deletePatient(id)) notFound('patient not found');
    });
  }
}
