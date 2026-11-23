# Reminder Implementation Tasks

## Goal and scope

Implement the first backend increment around the reminder lifecycle, using the four application services below. Keep the evaluated HTTP API aligned with [`openapi.yaml`](../../openapi.yaml); do not add GUI work or clinic and patient endpoints beyond creation. Follow the Clean Architecture boundaries in [`design.md`](design.md).

Use the [reminder rules](reminder-rules.md), [requirements](../steering/requirements.md), [product overview](../steering/product.md), and [challenge statement](../../enunciado.md) as the behavioral references. All test scenarios below are descriptions for unit tests; they do not prescribe implementation code.

Task IDs (`T-001` onward) are stable traceability identifiers. The service sections below identify the functional requirements each group implements; the inbound-reply requirements are outside this first implementation increment.

## 1. Clean Architecture foundation

- [ ] **T-066** Use [`candidate-layout.md`](candidate-layout.md) as an illustrative guide to separating domain, application/use cases, infrastructure, presentation, and tests. Translate its Python-specific examples into the repository's Node.js/TypeScript stack; follow the Clean Architecture dependency boundaries in [`design.md`](design.md), not a literal directory or language structure.
- [ ] **T-001** Define domain entities and invariants for `Clinic`, `Patient`, `Appointment`, and `Reminder`. Include clinic time zone, patient reminder eligibility, appointment status/version, and reminder schedule/status/attempt data needed by the use cases.
- [ ] **T-002** Define application ports for appointment and reminder persistence, the backend clock, and the messaging provider. Keep domain and application code independent of PostgreSQL, HTTP, and provider-specific types.
- [ ] **T-003** Define transaction or atomic-claim behavior needed to ensure concurrent reminder runs do not deliver the same due reminder twice.
- [ ] **T-004** Add infrastructure adapters for PostgreSQL persistence, the real UTC clock and controllable `CLOCK_MODE=test` clock, and the supplied messaging provider.
- [ ] **T-067** Create PostgreSQL migrations for clinics, patients, appointments, and reminders, including the relationships and persisted fields required for appointment versioning, reminder attempts, retry scheduling, and reminder history.
- [ ] **T-005** Keep HTTP handlers as thin adapters that validate/map the contract and call application services. Do not put reminder rules in route handlers.
- [ ] **T-006** Add unit-test doubles for repositories, clock, transaction/claim behavior, and provider. Keep provider contract and `provider/server.mjs` unchanged.
- [ ] **T-007** Configure a TypeScript-compatible test runner and coverage reporting, exposing `npm test` and `npm run test:coverage` scripts.
- [ ] **T-008** Generate a terminal coverage summary, an HTML report at `coverage/index.html`, and an LCOV report at `coverage/lcov.info`. Report statement, branch, function, and line coverage; do not introduce a coverage threshold until one is agreed.

## 2. OpenAPI implementation

Implement the operations already defined in [`openapi.yaml`](../../openapi.yaml). Treat the contract as authoritative for paths, payloads, response schemas, validation, and status codes; do not add routes.

**Requirements:** [FR-001](../steering/requirements.md#api-contract), [FR-013–FR-015](../steering/requirements.md#inbound-replies), and [FR-016](../steering/requirements.md#backend-clock)

- [ ] **T-057** Implement `GET /health` so it reports readiness only after the database is connected and migrations have completed, using the documented response.
- [ ] **T-058** Implement `POST /clinics` and `POST /patients`, including request validation, persistence, clinic relationship checks, and the documented success and error responses.
- [ ] **T-059** Implement `POST /appointments`, including request validation, clinic/patient relationship checks, persistence, reminder scheduling through `SchedulerService`, and the documented response mapping.
- [ ] **T-060** Implement `GET /appointments/{id}` to return the appointment with its reminder history ordered from oldest to newest, or the documented not-found response.
- [ ] **T-061** Implement `PATCH /appointments/{id}` and `POST /appointments/{id}/cancel` as thin adapters over `ReschedulerService` and `CancellationService`, mapping service outcomes to the contract's response codes and bodies.
- [ ] **T-062** Implement `POST /jobs/reminders/run` as an adapter over reminder processing; wait for the run to finish and return the documented `processed` count.
- [ ] **T-063** Implement `POST /webhooks/inbound-messages` with the contract's request validation, duplicate-message handling, reply interpretation, appointment matching, and always-`200` handling for valid messages, including ignored messages. This endpoint depends on inbound-reply application logic beyond the four services in the initial reminder increment.
- [ ] **T-064** Implement `PUT /test/clock` only when `CLOCK_MODE=test` is enabled, map its request to the controllable backend clock, and return the documented `204` response.
- [ ] **T-065** Add API contract tests for every OpenAPI operation and its documented success, validation, not-found, and conflict responses. Verify response bodies and status codes against the schemas, and verify no undocumented routes are exposed.

## 3. SchedulerService

**Requirements:** [FR-002–FR-006 and FR-011](../steering/requirements.md#reminder-scheduling-and-eligibility)

Implement reminder scheduling and due-reminder coordination. Use the clinic's IANA time zone for local reminder time and quiet-hour calculations. Quiet hours defer an initial send to 09:00; retries are handled by `DeliveryService` and do not wait for quiet hours.

- [ ] **T-009** Schedule a reminder for each appointment's current version.
- [ ] **T-010** When an appointment is created or rescheduled after its normal reminder time, schedule from the current backend time and apply initial-send quiet hours.
- [ ] **T-011** Mark a reminder `skipped` with `too_late` when its final scheduled time is not before the appointment start.
- [ ] **T-012** Select and claim due reminders safely when multiple scheduler runs overlap.
- [ ] **T-068** Coordinate due-reminder processing by passing each successfully claimed reminder to `DeliveryService` and ensuring one run records the correct processed count.
- [ ] **T-013** Connect the existing reminder-run endpoint to this application service without adding a new API route.

### Unit-test scenarios

- [ ] **T-014** **SCH-01 — The reminder follows the clinic's local time across a daylight-saving change.** Given a Madrid appointment at 10:00 on March 28, 2027, when its reminder is scheduled, then it is due at 10:00 Madrid time on March 27 (09:00 UTC), even though the interval is 23 hours.
- [ ] **T-015** **SCH-02 — An initial reminder is deferred during quiet hours.** Given a calculated initial send time between 21:00 and 09:00 in the clinic's time zone, when the reminder is scheduled, then its send time moves to 09:00.
- [ ] **T-016** **SCH-03 — A late-created or rescheduled appointment uses the current backend time.** Given that the normal reminder time has passed, when the appointment is created or rescheduled, then the reminder is scheduled from the current time, with quiet hours applied.
- [ ] **T-017** **SCH-04 — A reminder too close to the appointment is skipped.** Given that the final send time is at or after the appointment start, when the reminder is scheduled, then it is marked `skipped` with reason `too_late`.
- [ ] **T-018** **SCH-05 — Overlapping scheduler runs claim a due reminder only once.** Given two runs encounter the same due reminder, when both process it, then only one obtains it for delivery.

## 4. DeliveryService

**Requirements:** [FR-006–FR-008, FR-011, and FR-012](../steering/requirements.md#reminder-scheduling-and-eligibility)

Implement provider delivery, eligibility checks, retries, and final reminder outcomes. Use the same idempotency key for retries of the same reminder. Use the controllable backend clock for retry timing and for checking whether the appointment has started.

- [ ] **T-019** Send only reminders that are due, eligible, current for the appointment version, and not too late.
- [ ] **T-020** Map provider outcomes to reminder state and retry scheduling according to the challenge rules.
- [ ] **T-021** Persist attempt count, next retry time, sent time, failure state, and skip reason through the repository port.
- [ ] **T-022** Ensure provider calls are made through an adapter and are not duplicated by concurrent work.

### Unit-test scenarios

- [ ] **T-023** **DEL-01 — A provider-accepted reminder becomes sent.** Given a due reminder and a `202` provider response, when delivery completes, then the reminder becomes `sent`.
- [ ] **T-024** **DEL-02 — A duplicate provider response counts as successful delivery.** Given the provider returns `200` because it already accepted the same idempotency key, when delivery completes, then the reminder becomes `sent` and the patient is not sent a duplicate message.
- [ ] **T-069** **DEL-10 — The provider receives the exact localized reminder text.** Given a due reminder for a patient and clinic, when delivery is attempted, then the provider request contains the exact challenge message with the correct patient and clinic names and appointment date and time in the clinic's local time.
- [ ] **T-025** **DEL-03 — Temporary failures schedule the next attempts.** Given a `503` response, when the first attempt fails, then the second attempt is due one minute later; if that attempt also fails, then the third is due five minutes later.
- [ ] **T-026** **DEL-04 — An uncertain outcome retries safely.** Given a timeout, network error, or `504`, when the outcome is uncertain, then the service retries with the same idempotency key so the patient does not receive the same reminder twice.
- [ ] **T-070** **DEL-11 — A response taking longer than five seconds is treated as uncertain.** Given the provider does not respond within five seconds, when the attempt times out, then the service schedules a retry using the same idempotency key.
- [ ] **T-071** **DEL-12 — Concurrent workers do not call the provider twice for one attempt.** Given two workers try to deliver the same due reminder concurrently, when they compete to claim it, then only one worker calls the provider for that attempt.
- [ ] **T-027** **DEL-05 — A permanent provider rejection is not retried.** Given a `422` response, when delivery completes, then the reminder becomes `failed` and no retry is scheduled.
- [ ] **T-028** **DEL-06 — The reminder fails after its final unsuccessful attempt.** Given the third attempt also fails, when delivery completes, then the reminder becomes `failed`.
- [ ] **T-029** **DEL-07 — A retry may run during quiet hours.** Given a retry becomes due during quiet hours, when the delivery job runs, then it may be attempted immediately.
- [ ] **T-030** **DEL-08 — An ineligible patient is skipped without a provider call.** Given the patient has no phone number or has opted out, when delivery is due, then the reminder is marked `skipped` with the corresponding reason and the provider is not called.
- [ ] **T-031** **DEL-09 — A retry is skipped after the appointment starts.** Given the appointment has started by the time a retry is due, when the service checks the reminder, then it is marked `skipped` with reason `too_late`.

## 5. ReschedulerService

**Requirements:** [FR-002, FR-005, and FR-009](../steering/requirements.md#reminder-lifecycle-and-delivery)

Implement appointment rescheduling and creation of the reminder for the new appointment version. Preserve sent reminder history and invalidate reminders belonging to the previous schedule.

- [ ] **T-032** Accept rescheduling only when the appointment is not cancelled or already started and the requested start time is in the future.
- [ ] **T-033** Increment the appointment version on a successful reschedule and create a reminder for that version.
- [ ] **T-034** Cancel outstanding reminders for the previous schedule; keep already-sent reminders as history.
- [ ] **T-035** Return a previously confirmed appointment to `scheduled` when its time changes.
- [ ] **T-036** Ensure reminders for old appointment versions cannot be delivered.

### Unit-test scenarios

- [ ] **T-037** **RES-01 — Rescheduling replaces the active reminder.** Given an active appointment with a pending reminder, when it is moved to a future time, then its version increments, the old reminder is cancelled, and a new reminder is scheduled for the updated time.
- [ ] **T-038** **RES-02 — Rescheduling clears a previous confirmation.** Given a confirmed appointment that has not started, when it is rescheduled, then its status returns to `scheduled`.
- [ ] **T-039** **RES-03 — Rescheduling preserves sent reminder history.** Given the previous reminder was already sent, when the appointment is rescheduled, then that reminder remains in history and a new reminder is created for the new schedule.
- [ ] **T-040** **RES-04 — A cancelled or already-started appointment cannot be rescheduled.** Given either condition, when rescheduling is requested, then the operation is rejected and the appointment and reminders remain unchanged.
- [ ] **T-041** **RES-05 — A nonfuture start time is rejected.** Given a requested new start time that is not in the future, when rescheduling is requested, then the operation is rejected and the existing appointment state is unchanged.
- [ ] **T-042** **RES-06 — A queued reminder for an old version is not sent.** Given a reminder remains queued for the previous appointment version, when it is processed after rescheduling, then the version check prevents delivery.

## 6. CancellationService

**Requirements:** [FR-010](../steering/requirements.md#reminder-lifecycle-and-delivery)

Implement appointment cancellation and stopping of reminders that are still outstanding. Cancellation must be safe to repeat and must preserve sent reminder history.

- [ ] **T-043** Mark the appointment as `cancelled` and cancel its outstanding reminders.
- [ ] **T-044** Preserve reminders that were already sent as historical records.
- [ ] **T-045** Make repeated cancellation an idempotent no-op at the service level; the API continues to follow its documented response behavior.
- [ ] **T-046** Ensure cancelled appointments cannot proceed to provider delivery.

### Unit-test scenarios

- [ ] **T-047** **CAN-01 — Cancelling an appointment stops its pending reminder.** Given an appointment with a pending reminder, when it is cancelled, then the appointment becomes `cancelled` and the reminder becomes `cancelled`.
- [ ] **T-048** **CAN-02 — Cancellation preserves sent history.** Given a reminder was already sent, when its appointment is cancelled, then the sent reminder remains in history.
- [ ] **T-049** **CAN-03 — Repeating cancellation leaves state unchanged.** Given the appointment is already cancelled, when cancellation is requested again, then its state remains unchanged.
- [ ] **T-050** **CAN-04 — A cancelled appointment is not delivered.** Given an appointment is cancelled before its reminder is delivered, when due work is processed, then the provider is not called.

## Completion checks

- [ ] **T-051** Each service's unit tests cover the scenarios listed above using test doubles for external ports.
- [ ] **T-052** `npm test` runs the unit suite, and `npm run test:coverage` runs it with coverage reporting enabled.
- [ ] **T-053** The README explains both commands, the report locations, and how to open and interpret the HTML and LCOV reports.
- [ ] **T-054** Add focused PostgreSQL integration coverage later for persistence constraints and transaction-level concurrency; a unit test alone cannot prove database locking behavior.
- [ ] **T-055** Wire the use cases to the existing API contract and confirm no endpoints were added beyond `openapi.yaml`.
- [ ] **T-056** Verify reminder behavior with `CLOCK_MODE=test` and leave GUI/device-local time display out of scope.
