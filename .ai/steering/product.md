# ClinicSay Product Overview

## Product Purpose

ClinicSay is an appointment management backend for clinics in Spain. It helps clinics reduce avoidable no-shows by sending timely appointment reminders and letting patients confirm or cancel by replying to the message. The core product challenge is to deliver the right reminder at the right local time, handle unreliable messaging providers, and avoid duplicate or stale messages.

## Users and Context

- **Clinic staff and connected systems** create clinics, patients, and appointments through the API. This challenge has no user interface or authentication.
- **Patients** receive a reminder and may reply `SI` to confirm or `NO` to cancel. A phone number may be shared by family members, so inbound replies must be matched to the appropriate eligible appointment.
- **The clinic's operations system** triggers reminder processing. A production scheduler is outside the service's scope; the challenge invokes a job endpoint directly.

## Product Outcomes

1. Create and manage the appointment lifecycle needed for reminders.
2. Send one accurate reminder for the appointment's current schedule, using the clinic's IANA time zone and respecting daylight-saving changes.
3. Process retries and concurrent job runs without duplicate patient messages.
4. Apply patient replies once and only to an eligible appointment.
5. Make the service reproducible for evaluation with Docker Compose, PostgreSQL, migrations, and a controllable test clock.

## MVP Scope

The evaluated HTTP surface is defined by [openapi.yaml](../../openapi.yaml): create clinics and patients; create, retrieve, reschedule, and cancel appointments; run due reminders; receive inbound messages; check readiness; and set the clock when `CLOCK_MODE=test` is enabled. The API contract and [challenge statement](../../enunciado.md) define the required paths, payloads, status codes, and response shapes.

An appointment starts as `scheduled`, may become `confirmed` or `cancelled`, and cannot be rescheduled after cancellation or after it has started. Its internal version starts at `1` when created and increments automatically on each reschedule. The version is persistence-only: clients do not provide it when creating an appointment, and it is not included in appointment API responses. Each reminder stores the internal appointment version it belongs to so stale work can be rejected; `appointmentVersion` is also persistence-only and is not exposed through the API. Rescheduling invalidates outstanding reminders, creates a reminder for the new version, and clears a previous confirmation. Cancellation stops outstanding reminders while preserving sent history.

Reminder timing, quiet hours, eligibility, message text, retry delays, provider outcomes, and reply normalization are detailed in [reminder-rules.md](../specs/reminder-rules.md) and the challenge statement. Quiet hours apply to the initial reminder send; they do not delay retries. Preserve the challenge's Spain-specific local-time and daylight-saving behavior. The provider in `provider/` is fixed evaluation infrastructure and must not be modified.

Inbound replies target the eligible appointment with the most recently sent reminder to that phone number. If eligible reminders share the same `sent_at` time, choose the appointment associated with the reminder row created most recently, ordered by `created_at` descending and then `id` descending for a deterministic final tie-break.

For local test cleanup, the implementation also exposes `DELETE /appointments/{id}` to delete one appointment and its reminders, and `DELETE /reminders` to delete all reminder records while preserving appointments. These operations are specified by FR-018 and FR-019 and documented in [`openapi.yaml`](../../openapi.yaml).

## Out of Scope

The challenge does not require authentication, a front end, additional clinic or patient CRUD endpoints, pagination, or a real messaging provider. Clinic and patient HTTP resources remain creation-only as defined by `openapi.yaml`; do not add endpoints to list, retrieve, update, or delete them. Appointment and reminder deletion are local test-cleanup extensions, not challenge behaviors. Production cron scheduling and production deployment are discussion topics for the README, not deliverables in the evaluated service.

## Technology and Delivery Constraints

Use Node.js 22 or newer, TypeScript, and PostgreSQL. The service runs on port `3000` with `CLOCK_MODE=test` and `PROVIDER_URL=http://provider:4010`. Docker Compose must start the API, database, and fixed provider; database migrations must run at startup, and `/health` must report ready only after the database is usable and migrated. The README must explain setup, database creation, tests, key design decisions, known omissions, and a production approach.

Keep detailed behavioral rules in the requirements and API documents. This overview records the product intent, scope, constraints, and cross-document decisions that contributors need when prioritizing work.
