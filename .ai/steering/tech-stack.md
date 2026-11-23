# Technology Stack

## Application

- **Runtime:** Node.js 22 or newer
- **Language:** TypeScript
- **Database:** PostgreSQL
- **Database client:** `pg`

## Architecture and delivery

Keep domain and application logic independent of HTTP, database, and messaging-provider details. Use adapters at system boundaries, following the separation described in [design.md](../specs/design.md).

Use Docker Compose for local development. The stack includes the API, PostgreSQL, and the supplied simulated messaging provider. Configure service connections through environment variables; inside Compose, the API connects to PostgreSQL at `db` and to the provider at `provider`.

The provider in `provider/` is fixed evaluation infrastructure and must not be modified.
