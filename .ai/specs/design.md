# Design Decisions

## Architecture

The backend must follow Clean Architecture. Keep domain and application logic independent of HTTP, PostgreSQL, and messaging-provider details; use adapters at the system boundaries. The [candidate layout](candidate-layout.md) is an illustrative example of the separation of concerns, not a required language or directory structure.

## API Scope

The evaluated API follows [`openapi.yaml`](../../openapi.yaml). Clinic and patient resources support creation only. Do not add endpoints to list, retrieve, update, or delete clinics or patients, or otherwise expand the API beyond the challenge contract.

## Appointment Versioning

Appointment versions support safe reminder handling after rescheduling:

- A new appointment starts at version `1`.
- Each successful reschedule increments its version automatically.
- Each reminder stores the appointment version for which it was created in `appointmentVersion`. This lets the service identify reminders for an older appointment schedule.
- Appointment `version` and reminder `appointmentVersion` are persistence-only. Clients do not send a version when creating appointments, and API responses do not expose either field.

See [appointment-version.md](appointment-version.md) for an example of how versioning identifies stale reminders.

## Reminder Quiet Hours and Retries

Quiet hours run from 21:00 to 09:00 in the clinic's local time. They apply to the initial reminder send: if it falls during quiet hours, defer it until 09:00. Retries do not wait for quiet hours to end, as specified in [`enunciado.md`](../../enunciado.md). A retry is still skipped as `too_late` if the appointment has already started.

## Database and Local Setup

Use PostgreSQL for persistence and Docker Compose to run the API, database, and messaging provider with the environment settings in [`docker-compose.yml`](../../docker-compose.yml). The database schema must be created by applying the repository's migrations. Document in the [README](../../README.md) how to start the database from its Docker image and run the service locally.
