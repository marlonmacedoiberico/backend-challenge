# Functional Requirements

## Scope and source

The requirements below capture the ClinicSay challenge behavior described in [`enunciado.pdf`](../../enunciado.pdf), using the API contract in [`openapi.yaml`](../../openapi.yaml) and confirmed project decisions where noted. Stable `FR-` identifiers support traceability from requirements to design and implementation tasks.

The first implementation increment covers reminder functionality, including inbound-message handling through the `SchedulerService`, `DeliveryService`, `ReschedulerService`, `CancellationService`, and inbound-reply application use cases. This project does not include a GUI; device-local time display is outside backend scope.

## API contract

- **FR-001 — API contract:** The system shall expose the operations, fields, validation rules, and response status codes defined in [`openapi.yaml`](../../openapi.yaml). It shall not add evaluated API operations beyond that contract.

## Reminder scheduling and eligibility

- **FR-002 — Appointment reminder:** When an appointment is created or rescheduled, the system shall maintain a reminder for its current scheduled time and appointment version.
- **FR-003 — Local-time scheduling:** The system shall schedule a reminder for the same local time on the calendar day before the appointment, using the clinic's IANA time zone and applicable daylight-saving rules.
- **FR-004 — Quiet hours:** When an initial reminder send time falls between 21:00 and 09:00 in the clinic's local time, the system shall defer it to 09:00 local time.
- **FR-005 — Late creation or rescheduling:** When the normal reminder time has passed at appointment creation or rescheduling, the system shall use the current backend time as the initial send time and apply the quiet-hours rule.
- **FR-006 — Too-late reminder:** If the final scheduled send time is not before the appointment start, the system shall mark the reminder `skipped` with reason `too_late`. If the appointment has started by an initial or retry delivery attempt, the system shall also mark the reminder `skipped` with reason `too_late`.
- **FR-007 — Patient eligibility:** When a reminder becomes due for a patient without a phone number or who has opted out, the system shall mark it `skipped` with reason `no_phone` or `opted_out`, respectively, and shall not call the messaging provider.
- **FR-008 — Reminder content:** The system shall send the exact reminder text specified in the challenge and API contract, including the patient's name, clinic name, and appointment date and time formatted in the clinic's local time.

## Reminder lifecycle and delivery

- **FR-009 — Rescheduling:** When an appointment is rescheduled, the system shall cancel its outstanding reminder for the previous schedule and create a reminder for the new schedule, including when the previous reminder was already sent. It shall preserve sent reminders as history and return a previously confirmed appointment to `scheduled`.
- **FR-010 — Cancellation:** When an appointment is cancelled, the system shall cancel its outstanding reminder and preserve any sent reminder as history.
- **FR-011 — Due-reminder processing:** When `POST /jobs/reminders/run` is invoked, the system shall process all reminders due according to the backend clock and respond after the run completes. Concurrent runs shall not cause a reminder to be delivered more than once or cause duplicate provider calls for the same attempt.
- **FR-012 — Provider outcomes and retries:** The system shall mark reminders `sent` for provider responses `202` and `200`; retry `503`, `504`, network errors, and responses taking longer than five seconds; and mark `422` as `failed` without retrying. Retries shall reuse the same idempotency key. The second attempt shall be scheduled one minute after the first failure and the third five minutes after the second failure. After a third unsuccessful attempt, the reminder shall be `failed`. Retries shall not be deferred by quiet hours.

## Inbound replies

- **FR-013 — Reply interpretation:** When an inbound message contains `SI` or `NO`, the system shall normalize case, accents, surrounding whitespace, and punctuation. `SI` shall confirm the applicable appointment; `NO` shall cancel it and its outstanding reminder. Other message text shall be ignored.
- **FR-014 — Reply appointment matching:** The system shall apply a reply to the eligible appointment associated with the most recently sent reminder for the sender's phone number. If multiple eligible appointments share the latest `sent_at` time, it shall select the reminder with the latest `created_at`; if those timestamps also tie, it shall select the reminder with the greatest `id`, as specified in [`design.md`](../specs/design.md). An eligible appointment has not started and is not cancelled. If no eligible appointment exists, the reply shall be ignored.
- **FR-015 — Inbound-message idempotency:** When the provider sends the same inbound `messageId` more than once, the system shall process it only once. The webhook shall respond `200` even when the message is ignored.

## Backend clock

- **FR-016 — Controllable test clock:** When the service runs with `CLOCK_MODE=test`, `PUT /test/clock` shall set the backend clock for time-dependent behavior and service-generated timestamps, including entity creation and updates, appointment creation and rescheduling, reminder-job processing, and inbound webhook processing.
- **FR-017 — Production clock and time representation:** When `CLOCK_MODE=test` is not enabled, the backend shall use the system clock in UTC and shall not expose `PUT /test/clock`. The backend shall persist and compare timestamps as UTC instants, convert to clinic-local time only for applicable business rules, and return API timestamps in UTC with a `Z` suffix. `CLOCK_MODE=test` shall control backend behavior only; it shall not control the local time display of client devices.
