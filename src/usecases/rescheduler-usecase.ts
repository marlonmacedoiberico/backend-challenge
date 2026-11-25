import type { AppointmentContext } from '../domain/model.js';
import { ReschedulerService } from './service/rescheduler-service.js';

export class ReschedulerUsecase {
  constructor(private readonly service: ReschedulerService) {}

  reschedule(appointmentId: string, startsAt: Date): Promise<AppointmentContext> {
    return this.service.reschedule(appointmentId, startsAt);
  }
}
