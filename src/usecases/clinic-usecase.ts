import type { Clock, ClinicSayRepository } from './ports.js';
import { conflict, notFound, validation } from '../domain/errors.js';
import type { Clinic } from '../domain/model.js';
import { assertTimeZone } from '../domain/time.js';

export class ClinicUsecase {
  constructor(
    private readonly repository: ClinicSayRepository,
    private readonly clock: Clock,
    private readonly newId: () => string,
  ) {}

  async createClinic(name: string, timezone: string): Promise<Clinic> {
    if (!name.trim()) validation('name must not be empty');
    try {
      assertTimeZone(timezone);
    } catch {
      validation('timezone must be a valid IANA time zone');
    }
    const now = this.clock.now();
    return this.repository.transaction((transaction) =>
      transaction.createClinic({
        id: this.newId(), name: name.trim(), timezone, createdAt: now,
      }),
    );
  }

  async listClinics(): Promise<Clinic[]> {
    return this.repository.listClinics();
  }

  async getClinic(id: string): Promise<Clinic> {
    const clinic = await this.repository.getClinic(id);
    if (!clinic) notFound('clinic not found');
    return clinic;
  }

  async updateClinic(
    id: string,
    input: { name?: string; timezone?: string },
  ): Promise<Clinic> {
    const current = await this.getClinic(id);
    const name = input.name === undefined ? current.name : input.name.trim();
    const timezone = input.timezone ?? current.timezone;
    if (!name) validation('name must not be empty');
    try {
      assertTimeZone(timezone);
    } catch {
      validation('timezone must be a valid IANA time zone');
    }
    if (
      timezone !== current.timezone &&
      await this.repository.transaction((transaction) =>
        transaction.hasAppointmentsForClinic(id),
      )
    ) {
      conflict('clinic timezone cannot change while appointments exist');
    }
    const updated = await this.repository.transaction((transaction) =>
      transaction.updateClinic({ ...current, name, timezone }),
    );
    if (!updated) notFound('clinic not found');
    return updated;
  }

  async deleteClinic(id: string): Promise<void> {
    await this.getClinic(id);
    await this.repository.transaction(async (transaction) => {
      if (
        await transaction.hasPatientsForClinic(id) ||
        await transaction.hasAppointmentsForClinic(id)
      ) {
        conflict('clinic cannot be deleted while patients or appointments exist');
      }
      if (!await transaction.deleteClinic(id)) notFound('clinic not found');
    });
  }
}
