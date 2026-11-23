# Requirements

## Scope and authoritative documents

The API shall conform to the paths, request and response schemas, validation rules, and status codes defined in [`openapi.yaml`](../../openapi.yaml). The challenge statement ([`enunciado.md`](../../enunciado.md)) and the detailed [reminder rules](../specs/reminder-rules.md) define the required behavior around those API operations.

Do not expand the evaluated API beyond its documented contract. Clinic and patient endpoints support creation only. See [design decisions](../specs/design.md) for the agreed API scope and related decisions.

## Reminder behavior

The service shall follow the reminder timing, eligibility, message, retry, and lifecycle rules in the [reminder rules](../specs/reminder-rules.md) and the challenge statement. Reminder calculations and message content shall use the clinic's IANA time zone, including its daylight-saving rules. Provider behavior and inbound reply handling shall follow the challenge statement and the confirmed decisions in [design.md](../specs/design.md).

## Backend clock and timestamps

The evaluation environment shall start the service with `CLOCK_MODE=test`. When this mode is enabled, `PUT /test/clock` shall set the backend's controllable clock for time-dependent behavior and service-generated timestamps, including entity creation and update times, appointment creation and rescheduling, reminder-job processing, and inbound webhook handling.

When `CLOCK_MODE=test` is not enabled, the backend shall use the system clock in UTC, and `PUT /test/clock` shall not be available. The backend shall persist and compare timestamps as UTC instants. It shall convert those instants to the clinic's local time only where required by reminder business rules. API response timestamps shall use UTC with a `Z` suffix, as specified by [`openapi.yaml`](../../openapi.yaml).

`CLOCK_MODE=test` controls backend behavior only; it does not control how time is displayed by a user interface or client device. This project does not include a GUI. See [design decisions](../specs/design.md) for the system-time and time-display decision.
