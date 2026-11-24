# Design Decisions

## Architecture

The backend must follow Clean Architecture. Keep domain and application logic independent of HTTP, PostgreSQL, and messaging-provider details; use adapters at the system boundaries. The [candidate layout](candidate-layout.md) is an illustrative example of the separation of concerns, not a required language or directory structure.

## API Scope

The evaluated API follows [`openapi.yaml`](../../openapi.yaml). Clinic and patient resources support creation only. Do not add endpoints to list, retrieve, update, or delete clinics or patients. The documented `DELETE /appointments/{id}` and `DELETE /reminders` operations are local test-cleanup extensions: deleting an appointment deletes all its reminders, while deleting reminders leaves appointments intact.

## System Time and Time Display

When `CLOCK_MODE=test` is not configured, the backend uses the system clock in UTC. Treat timestamps as UTC instants for persistence and comparison, converting to a clinic's local time only where business rules require it.

This project does not include a GUI. How time is displayed on a phone, laptop, tablet, or other client device is outside the backend's scope and follows that device's local settings. `CLOCK_MODE=test` provides a controllable clock for testing backend behavior; it does not control or specify time display in user interfaces.

## Appointment Versioning

Appointment versions support safe reminder handling after rescheduling:

- A new appointment starts at version `1`.
- Each successful reschedule increments its version automatically.
- Each reminder stores the appointment version for which it was created in `appointmentVersion`. This lets the service identify reminders for an older appointment schedule.
- Appointment `version` and reminder `appointmentVersion` are persistence-only. Clients do not send a version when creating appointments, and API responses do not expose either field.

See [appointment-version.md](appointment-version.md) for an example of how versioning identifies stale reminders.

## Reminder Quiet Hours and Retries

Quiet hours run from 21:00 to 09:00 in the clinic's local time. They apply to the initial reminder send: if it falls during quiet hours, defer it until 09:00. Retries do not wait for quiet hours to end, as specified in [`enunciado.md`](../../enunciado.md). A retry is still skipped as `too_late` if the appointment has already started.

## Inbound Reply Matching

The challenge applies an inbound reply to the eligible appointment whose reminder was sent most recently to the sender's phone number. If multiple eligible appointments have reminders with the same `sent_at` time, apply the reply to the appointment associated with the reminder record created most recently in the database. Order by `created_at` descending; if those timestamps also tie, order by reminder `id` descending for a deterministic result. Reminder IDs are UUIDs and do not, by themselves, indicate creation order.

## Database and Local Setup

Use PostgreSQL for persistence and Docker Compose to run the API, database, and messaging provider with the environment settings in [`docker-compose.yml`](../../docker-compose.yml). The database schema must be created by applying the repository's migrations. Document in the [README](../../README.md) how to start the database from its Docker image and run the service locally.
