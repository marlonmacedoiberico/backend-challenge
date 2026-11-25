import { SchedulerService } from './service/scheduler-service.js';

export class SchedulerUsecase {
  constructor(private readonly service: SchedulerService) {}

  runDueReminders(): Promise<number> {
    return this.service.runDueReminders();
  }
}
