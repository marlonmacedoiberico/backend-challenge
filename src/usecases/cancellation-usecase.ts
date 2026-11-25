import type { AppointmentContext } from '../domain/model.js';
import { CancellationService } from './service/cancellation-service.js';

export class CancellationUsecase {
  constructor(private readonly service: CancellationService) {}

  cancel(appointmentId: string): Promise<AppointmentContext> {
    return this.service.cancel(appointmentId);
  }
}
