# Terms in the ClinicSay Application

## Purpose and sources

This glossary defines the domain and technical terms used in the ClinicSay requirements, design, API, and implementation tasks. Prefer these terms consistently in documentation, code, tests, and API discussions.

Behavioral definitions come from the [challenge statement](enunciado.md), [OpenAPI contract](openapi.yaml), [functional requirements](.ai/steering/requirements.md), [reminder rules](.ai/specs/reminder-rules.md), and [design decisions](.ai/specs/design.md). When a term is specifically about an API field, the OpenAPI name is authoritative.

## Domain concepts

- **Clinic:** An organization that creates appointments and owns the clinic-local time zone used to calculate reminder times and format reminder messages. Its time zone is an IANA time-zone identifier, such as `Europe/Madrid`.
- **Patient:** A person associated with a clinic and an appointment. A patient has a name, may have an E.164 phone number (or `null`), and has an `acceptsReminders` preference that determines outbound reminder eligibility.
- **Appointment:** A scheduled visit connecting one clinic and one patient, with a `startsAt` instant and a lifecycle status. The API statuses are `scheduled`, `confirmed`, and `cancelled`.
- **Appointment version:** A persistence-only number identifying a particular schedule of an appointment. A new appointment starts at version `1`; a successful reschedule increments it. Clients neither submit nor receive this value.
- **Reminder:** The record for an outbound message associated with an appointment version. It holds its scheduled send time, status, attempt count, and relevant timestamps and skip reason. The API statuses are `pending`, `sent`, `failed`, `skipped`, and `cancelled`.
- **Reminder appointment version (`appointmentVersion`):** The appointment version for which a reminder was created. It is persistence-only and lets the system identify reminders for a superseded schedule.
- **Reminder history:** All reminder records associated with an appointment, including sent, failed, skipped, and cancelled reminders. Rescheduling or cancelling an appointment preserves sent reminders as history. The appointment API returns records from oldest to newest.
- **Pending reminder:** A reminder awaiting its initial send or a scheduled retry.
- **Sent reminder:** A reminder the provider accepted successfully. Its `sentAt` timestamp records the backend time of that outcome.
- **Failed reminder:** A reminder that reached a permanent provider rejection or exhausted its allowed attempts.
- **Skipped reminder:** A reminder intentionally not sent because it was too late or the patient was ineligible.
- **Cancelled reminder:** An outstanding reminder invalidated by appointment rescheduling or cancellation. A reminder that was already sent remains historical and is not changed to `cancelled`.

## Reminder lifecycle and delivery

- **Initial reminder send:** The first planned provider call for a reminder. It is scheduled for the same clinic-local time on the calendar day before the appointment, with the clinic's daylight-saving rules applied.
- **Quiet hours:** The clinic-local period from 21:00 to 09:00. If the initial send falls in this period, it is deferred to 09:00 local time. Quiet hours do not delay retries.
- **Late-created or late-rescheduled appointment:** An appointment created or rescheduled after its normal reminder time. Its initial send time is the current backend time, subject to quiet hours.
- **Retry:** A later provider attempt after a retryable failure or uncertain outcome. The second attempt is scheduled one minute after the first failure; the third is scheduled five minutes after the second failure. A reminder fails after its third unsuccessful attempt.
- **Reminder attempt (`attempts`):** A call made to the messaging provider for a reminder. The API field `attempts` counts provider calls.
- **Too late (`too_late`):** A skip reason used when the final scheduled send time is not before the appointment start, or when an initial send or retry is attempted after the appointment has started.
- **Patient reminder eligibility:** A reminder is not sent if the patient has no phone number (`no_phone`) or has opted out (`opted_out`). In either case, the reminder is skipped without calling the provider.
- **Reminder content:** The exact message in the API contract, populated with the patient's and clinic's names and the appointment date and time in the clinic's local time.
- **Provider:** The messaging service that accepts outbound reminder requests and sends inbound-message webhooks. The supplied provider implementation is fixed challenge infrastructure and is not part of the application to modify.
- **Provider outcome:** `202` or `200` means the request is accepted as sent; `503` is retryable; `504`, a network error, or a response taking more than five seconds has an uncertain outcome and is retried safely; `422` is a permanent rejection and fails without retry.
- **Idempotency key:** The request key used to prevent duplicate messages at the provider. Retries for the same reminder reuse the same key.

## Inbound replies

- **Inbound message:** A message received from the provider through `POST /webhooks/inbound-messages`. Its `messageId` identifies the message for duplicate-processing protection; `from` is the sender's phone number, and `text` contains the reply.
- **Inbound reply:** The patient's response text after normalization. `SI` confirms the selected appointment; `NO` cancels it and its outstanding reminder. Case, accents, surrounding whitespace, and punctuation do not change the recognized reply. Other text is ignored.
- **Eligible appointment for reply matching:** An appointment associated with the sender's phone number that has not started and is not cancelled.
- **Most recently sent reminder:** The sent reminder used to select an appointment when a phone number is shared. Compare `sent_at` first. If eligible reminders tie on `sent_at`, compare `created_at` descending; if those also tie, compare reminder `id` descending. This final ordering is the confirmed rule in [design decisions](.ai/specs/design.md).
- **Inbound-message idempotency:** Processing a given `messageId` at most once, even if the provider retries its webhook. A valid webhook receives HTTP `200` even when its text is unrecognized, no appointment is eligible, or the message is a duplicate.

## Time and timestamp terms

- **Backend clock:** The clock used by the service for time-dependent decisions and generated timestamps. It uses the system clock in UTC unless `CLOCK_MODE=test` enables a controllable clock.
- **Test clock:** The controllable backend clock set through `PUT /test/clock` when `CLOCK_MODE=test` is enabled. It is for testing backend behavior; it does not control how client devices display time.
- **UTC instant:** A point in time stored and compared independently of a display time zone. API timestamps are returned in UTC with a `Z` suffix.
- **Clinic-local time:** A UTC instant converted using the clinic's IANA time zone when applying reminder scheduling rules or formatting reminder content.
- **Device-local display time:** How a phone, laptop, tablet, or other client displays a timestamp according to its own settings. The backend has no GUI and does not determine this display.
- **`sentAt` / `sent_at`:** The backend time at which a provider success was recorded, exposed as `sentAt` by the API and represented as `sent_at` in design/database terminology. It is distinct from the scheduled time and the reminder record's creation time.
- **`created_at`:** The database creation timestamp for a reminder record. It is used as the first tie-break after equal `sent_at` values when matching an inbound reply; it does not mean the reminder was sent at that time.

## Application and architecture terms

- **Clean Architecture:** The architectural constraint that domain and application behavior do not depend on HTTP, PostgreSQL, or provider-specific details. Dependencies point inward; infrastructure and presentation code act as adapters at the system boundaries.
- **Domain entity:** A business object with identity and rules, such as `Clinic`, `Patient`, `Appointment`, or `Reminder`.
- **Application service / use case:** An operation that coordinates domain rules and ports to fulfill a user or system goal. The planned reminder services are `SchedulerService`, `DeliveryService`, `ReschedulerService`, and `CancellationService`; inbound-message processing is an inbound-reply use case.
- **`SchedulerService`:** Coordinates reminder creation and scheduling, selects and claims due reminders, and passes claimed work to `DeliveryService`.
- **`DeliveryService`:** Checks delivery eligibility and timing, calls the provider through a port, and records success, skip, failure, or retry state.
- **`ReschedulerService`:** Changes an eligible appointment's start time, advances its version, invalidates outstanding reminders for the old schedule, and schedules a reminder for the new version.
- **`CancellationService`:** Cancels an appointment and its outstanding reminders while preserving sent reminders as history.
- **Inbound-reply use case:** Interprets a valid inbound message, selects the eligible appointment using the phone number and reminder ordering rule, applies confirmation or cancellation, and makes duplicate processing safe.
- **Port:** An application-owned interface for an external capability, such as persistence, the backend clock, or message delivery.
- **Adapter:** An outer-layer implementation of a port or an interface translator, such as a PostgreSQL repository, provider client, or HTTP handler.
- **HTTP handler:** A presentation-layer adapter that validates and maps the API contract, invokes an application service or use case, and maps its outcome to the documented response. It does not own reminder business rules.

## Terms to keep distinct

- **Appointment start (`startsAt`) vs. reminder scheduled time (`scheduledFor`):** The first is when the visit begins; the second is when the provider call is due.
- **Reminder `created_at` vs. `sent_at`:** Creation records when the reminder row was created; sending records when the provider accepted the message. They are not interchangeable.
- **`confirmed` vs. `cancelled`:** These are appointment lifecycle statuses. `sent`, `failed`, `skipped`, and `cancelled` are reminder statuses; a reminder can be cancelled without changing an already-sent historical reminder.
- **Scheduled vs. sent:** `scheduledFor` indicates when a reminder should be attempted. It does not mean the message has been sent; a successful provider outcome records the reminder as `sent`.
- **Retryable vs. permanent provider outcome:** Retryable and uncertain outcomes may produce another attempt; a `422` rejection is permanent and does not.
