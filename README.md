# ClinicSay Backend

Submit the challenge through the [delivery form](https://docs.google.com/forms/d/e/1FAIpQLSd6OqQxPRvpBz_Cxw8KgOhN9-fsv5idE83PYGsH861BaMITCQ/viewform) by Wednesday, November 25, 2026, at 17:30 Madrid time (11:30 Lima time).

Backend for the ClinicSay appointment-reminder challenge. The challenge statement is available in [`enunciado.pdf`](enunciado.pdf), and [`openapi.yaml`](openapi.yaml) defines the HTTP contract. Product requirements and design decisions live under `.ai/steering/` and `.ai/specs/`.

## Local stack

Requires Docker Desktop with Docker Compose. Build and start the API, PostgreSQL, and the supplied messaging-provider simulator:

```sh
docker compose up --build
```

Windows Command Prompt (`cmd.exe`):

```cmd
docker compose up --build
```

The API listens on `http://localhost:3000`, the provider simulator on `http://localhost:4010`, and PostgreSQL on `localhost:5433`. The API runs database migrations before listening. Check readiness with `GET http://localhost:3000/health`.

The local Compose configuration uses `CLOCK_MODE=test`, so backend time can be set with `PUT /test/clock`. When `CLOCK_MODE=test` is absent, the backend uses the system clock in UTC and the test-clock endpoint is unavailable. This setting concerns backend behavior; device-local time display is outside the scope of this API.

| Variable | Local value | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `CLOCK_MODE` | `test` | Enables the controllable backend clock |
| `PROVIDER_URL` | `http://provider:4010` | Provider URL from the API container |
| `DATABASE_URL` | `postgresql://clinicsay:clinicsay@db:5432/clinicsay` | PostgreSQL connection |

Stop the stack with `docker compose down`. PostgreSQL data remains in its volume.

In Command Prompt, stop the stack with:

```cmd
docker compose down
```

## Tests and coverage

Requires Node.js 22 or later and npm. Install dependencies and run the unit tests:

```sh
npm install
npm test
```

Windows Command Prompt (`cmd.exe`):

```cmd
npm install
npm test
```

The tests use Node's built-in `node:test` runner and cover `SchedulerService`, `DeliveryService` (including retry behavior), `ReschedulerService`, `CancellationService`, and inbound-reply processing.

Generate the same test run with coverage reports:

```sh
npm run test:coverage
```

Windows Command Prompt (`cmd.exe`):

```cmd
npm run test:coverage
```

The command prints a coverage summary and writes:

- `coverage/index.html`: navigable report for file, line, branch, and function coverage.
- `coverage/lcov.info`: LCOV data for CI and coverage-analysis tools.

Open `coverage/index.html` in a browser to inspect the report. TypeScript build output is written to `dist/`.

## Implementation notes

- The application follows Clean Architecture. Domain and application services depend on ports; PostgreSQL and HTTP provider integrations are infrastructure adapters.
- Reminder scheduling and appointment display use the clinic's IANA time zone where applicable. API timestamps are returned as UTC instants.
- The provider simulator in `provider/` is fixed for evaluation and must not be modified.
