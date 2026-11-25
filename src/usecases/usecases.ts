import { randomUUID } from 'node:crypto';
import type { Clock, ClinicSayRepository } from './ports.js';
import { CancellationUsecase } from './cancellation-usecase.js';
import { AppointmentUsecase } from './appointment-usecase.js';
import { ClinicUsecase } from './clinic-usecase.js';
import { InboundReplyUsecase } from './inbound-reply-usecase.js';
import { PatientUsecase } from './patient-usecase.js';
import { ReminderUsecase } from './reminder-usecase.js';
import { ReschedulerUsecase } from './rescheduler-usecase.js';
import { SchedulerUsecase } from './scheduler-usecase.js';
import { CancellationService } from './service/cancellation-service.js';
import { ReschedulerService } from './service/rescheduler-service.js';
import { SchedulerService } from './service/scheduler-service.js';

export class Usecases {
  readonly clinics: ClinicUsecase;
  readonly patients: PatientUsecase;
  readonly appointments: AppointmentUsecase;
  readonly reminders: ReminderUsecase;
  readonly cancellation: CancellationUsecase;
  readonly rescheduler: ReschedulerUsecase;
  readonly scheduler: SchedulerUsecase;
  readonly inboundReplies: InboundReplyUsecase;

  constructor(
    repository: ClinicSayRepository,
    clock: Clock,
    scheduler: SchedulerService,
    newId: () => string = randomUUID,
  ) {
    this.clinics = new ClinicUsecase(repository, clock, newId);
    this.patients = new PatientUsecase(repository, clock, this.clinics, newId);
    this.appointments = new AppointmentUsecase(repository, clock, scheduler, newId);
    this.reminders = new ReminderUsecase(repository);
    this.cancellation = new CancellationUsecase(
      new CancellationService(repository, clock),
    );
    this.rescheduler = new ReschedulerUsecase(
      new ReschedulerService(repository, clock, scheduler),
    );
    this.scheduler = new SchedulerUsecase(scheduler);
    this.inboundReplies = new InboundReplyUsecase(repository, clock);
  }
}
