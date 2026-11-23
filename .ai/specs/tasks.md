# Reminder Implementation Tasks

## Goal and scope

Implement the first backend increment around the reminder lifecycle, including inbound-message handling. Use the four reminder services and the inbound-reply application use case described below. Keep the evaluated HTTP API aligned with [`openapi.yaml`](../../openapi.yaml); do not add GUI work or clinic and patient endpoints beyond creation. Follow the Clean Architecture boundaries in [`design.md`](design.md).

Use the [reminder rules](reminder-rules.md), [requirements](../steering/requirements.md), [product overview](../steering/product.md), and [challenge statement](../../enunciado.md) as the behavioral references. All test scenarios below are descriptions for unit tests; they do not prescribe implementation code.

Task IDs (`T-001` onward) are stable traceability identifiers. The service and use-case sections below identify the functional requirements each group implements. Inbound replies are included in this increment.

## 1. Clean Architecture foundation

- [ ] **T-066** Use [`candidate-layout.md`](candidate-layout.md) as an illustrative guide to separating domain, application/use cases, infrastructure, presentation, and tests. Translate its Python-specific examples into the repository's Node.js/TypeScript stack; follow the Clean Architecture dependency boundaries in [`design.md`](design.md), not a literal directory or language structure.
- [ ] **T-001** Define domain entities and invariants for `Clinic`, `Patient`, `Appointment`, and `Reminder`. Include clinic time zone, patient reminder eligibility, appointment status/version, and reminder schedule/status/attempt data, including reminder `created_at` and `sent_at`, needed by the use cases. Follow the appointment-version rules in [`design.md`](design.md#appointment-versioning), including the initial version and each reminder's `appointmentVersion`.
- [ ] **T-002** Define application ports for appointment, patient, clinic, reminder, and inbound-message persistence, the backend clock, and the messaging provider. Support atomic recognition of previously processed inbound `messageId` values. Keep domain and application code independent of PostgreSQL, HTTP, and provider-specific types.
- [ ] **T-003** Define transaction or atomic-claim behavior needed to ensure concurrent reminder runs do not deliver the same due reminder twice and duplicate inbound messages are applied only once.
- [ ] **T-004** Add infrastructure adapters for PostgreSQL persistence, the real UTC clock and controllable `CLOCK_MODE=test` clock, and the supplied messaging provider.
- [ ] **T-067** Create PostgreSQL migrations for clinics, patients, appointments, reminders, and inbound-message idempotency, including the relationships and persisted fields required for appointment versioning, reminder attempts, retry scheduling, reminder `created_at`/`sent_at` history, and unique inbound `messageId` processing.
- [ ] **T-005** Keep HTTP handlers as thin adapters that validate/map the contract and call application services. Do not put reminder rules in route handlers.
- [ ] **T-006** Add unit-test doubles for repositories, clock, transaction/claim behavior, and provider. Keep provider contract and `provider/server.mjs` unchanged.
- [ ] **T-007** Configure a TypeScript-compatible test runner and coverage reporting, exposing `npm test` and `npm run test:coverage` scripts.
- [ ] **T-008** Generate a terminal coverage summary, an HTML report at `coverage/index.html`, and an LCOV report at `coverage/lcov.info`. Report statement, branch, function, and line coverage; do not introduce a coverage threshold until one is agreed.

## 2. OpenAPI implementation

Implement the operations already defined in [`openapi.yaml`](../../openapi.yaml). Treat the contract as authoritative for paths, payloads, response schemas, validation, and status codes; do not add routes.

**Requirements:** [FR-001](../steering/requirements.md#api-contract), [FR-013–FR-015](../steering/requirements.md#inbound-replies), and [FR-016–FR-017](../steering/requirements.md#backend-clock)

- [ ] **T-057** Implement `GET /health` so it reports readiness only after the database is connected and migrations have completed, using the documented response.
- [ ] **T-058** Implement `POST /clinics` and `POST /patients`, including request validation, persistence, clinic relationship checks, and the documented success and error responses.
- [ ] **T-059** Implement `POST /appointments`, including request validation, clinic/patient relationship checks, persistence, reminder scheduling through `SchedulerService`, and the documented response mapping.
- [ ] **T-060** Implement `GET /appointments/{id}` to return the appointment with its reminder history ordered from oldest to newest, or the documented not-found response.
- [ ] **T-061** Implement `PATCH /appointments/{id}` and `POST /appointments/{id}/cancel` as thin adapters over `ReschedulerService` and `CancellationService`, mapping service outcomes to the contract's response codes and bodies.
- [ ] **T-062** Implement `POST /jobs/reminders/run` as an adapter over reminder processing; wait for the run to finish and return the documented `processed` count.
- [ ] **T-063** Implement `POST /webhooks/inbound-messages` as a thin adapter over the inbound-reply application use case. Validate the request, apply duplicate-message handling and reply interpretation, and return `200` for every valid message, including ignored messages.
- [ ] **T-064** Implement `PUT /test/clock` according to [FR-016 and FR-017](../steering/requirements.md#backend-clock) and the [system-time design decision](design.md#system-time-and-time-display). Map the request to the controllable backend clock and return the documented `204` response when the endpoint is enabled.
- [ ] **T-065** Add API contract tests for every OpenAPI operation and its documented success, validation, not-found, and conflict responses. Include the clock behavior scenarios below. Verify response bodies and status codes against the schemas, and verify no undocumented routes are exposed.

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

## 7. Inbound reply use case

**Requirements:** [FR-013–FR-015](../steering/requirements.md#inbound-replies)

Use the sender's phone number, backend clock, and reminder history to select an eligible appointment according to [`design.md`](design.md#inbound-reply-matching). Keep HTTP concerns in the webhook adapter and apply confirmation/cancellation through application-level behavior.

- [ ] **T-087** Implement the inbound-reply application use case behind the webhook adapter, coordinating message normalization, eligible-appointment selection, confirmation or cancellation, and idempotent message processing through application ports.
- [ ] **T-072** Normalize inbound reply text by trimming whitespace, removing surrounding punctuation, ignoring case, and treating accented and unaccented `SI` equivalently. Confirm the selected appointment for `SI`; cancel the appointment and its outstanding reminder for `NO`; ignore other text.
- [ ] **T-073** Select among eligible appointments for the sender's phone number using sent reminders: choose the latest reminder `sent_at`; break ties by latest reminder `created_at`, then by greatest reminder `id` when both timestamps tie. Exclude cancelled appointments and appointments that have already started.
- [ ] **T-074** Record inbound `messageId` processing atomically so repeated deliveries of the same webhook cannot apply the reply more than once.

### Unit-test scenarios

- [ ] **T-075** **INB-01 — A normalized SI reply confirms the selected appointment.** Given a valid inbound message containing `Sí`, `si.`, or whitespace and punctuation around `SI`, when it is processed, then the selected eligible appointment becomes `confirmed`.
- [ ] **T-076** **INB-02 — A normalized NO reply cancels the selected appointment.** Given a valid inbound message containing `NO` in any letter case or with surrounding whitespace and punctuation, when it is processed, then the selected appointment and its outstanding reminder become `cancelled`.
- [ ] **T-077** **INB-03 — Other reply text is ignored.** Given a valid inbound message with text other than `SI` or `NO`, when it is processed, then appointment and reminder states remain unchanged.
- [ ] **T-078** **INB-04 — The latest sent reminder determines the target appointment.** Given multiple eligible appointments share the sender's phone number but have different latest reminder send times, when a reply is processed, then it applies to the appointment with the most recently sent reminder.
- [ ] **T-079** **INB-05 — Reminder creation time breaks equal sent-time ties.** Given eligible reminders have the same `sent_at` but different `created_at` values, when a reply is processed, then it applies to the appointment associated with the reminder having the latest `created_at`.
- [ ] **T-080** **INB-06 — Reminder ID breaks a complete timestamp tie.** Given eligible reminders have equal `sent_at` and `created_at` values, when a reply is processed, then it applies to the appointment associated with the greatest reminder `id`.
- [ ] **T-081** **INB-07 — Ineligible appointments are excluded from reply matching.** Given matching appointments are cancelled or have already started, when a reply is processed, then those appointments are not selected; if none remain eligible, no appointment changes.
- [ ] **T-082** **INB-08 — Duplicate inbound message IDs are applied once.** Given the provider delivers the same `messageId` more than once, when each webhook request is processed, then the reply affects appointment state only once.

### Webhook API test scenarios

- [ ] **T-083** **INB-09 — A valid but ignored message still receives HTTP 200.** Given a valid webhook whose text is unrecognized or has no eligible target, when the endpoint handles it, then it returns `200` without changing appointment state.
- [ ] **T-084** **INB-10 — An invalid webhook body receives HTTP 400.** Given a webhook request missing required fields or containing invalid field values, when the endpoint validates it, then it returns the documented `400` response and does not process a reply.

## 8. Clock behavior verification

**Requirements:** [FR-016–FR-017](../steering/requirements.md#backend-clock)

- [ ] **T-085** **CLK-01 — Test mode controls backend timestamps and time-dependent behavior.** Given the service runs with `CLOCK_MODE=test` and its clock is set through `PUT /test/clock`, when entities are created or updated, appointments are created or rescheduled, reminder jobs run, or inbound messages are processed, then backend-generated timestamps and time-dependent decisions use that configured time.
- [ ] **T-086** **CLK-02 — Production mode uses UTC and does not expose the test-clock endpoint.** Given `CLOCK_MODE=test` is not configured, when the service starts and a client requests `PUT /test/clock`, then the service uses the system clock in UTC and the endpoint is unavailable.

## 9. Completion checks

- [ ] **T-051** Each reminder service and the inbound-reply use case have unit tests covering their scenarios, using test doubles for external ports. Verify the clock scenarios through the API contract tests.
- [ ] **T-052** `npm test` runs the unit suite, and `npm run test:coverage` runs it with coverage reporting enabled.
- [ ] **T-053** The README explains both commands, the report locations, and how to open and interpret the HTML and LCOV reports.
- [ ] **T-054** Add focused PostgreSQL integration coverage for persistence constraints and transaction-level concurrency, including competing reminder claims and duplicate inbound-message processing; unit tests alone cannot prove database locking behavior.
- [ ] **T-055** Wire the use cases to the existing API contract and confirm no endpoints were added beyond `openapi.yaml`.
- [ ] **T-056** Verify reminder behavior with `CLOCK_MODE=test` and leave GUI/device-local time display out of scope.
